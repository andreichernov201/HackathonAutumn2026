"""Request-local field markup, materialized only in a temporary preview DOCX."""
import re
from copy import deepcopy
from uuid import uuid4

from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.text.run import Run

MISSING_FILL = 'FEF3C7'
FILLED_FILL = 'DBEAFE'


class DraftFields(dict):
    def __init__(self, fields, specs):
        super().__init__(fields)
        self.labels = {spec.key: spec.label for spec in specs}
        self.tokens = {}
        self.prefix = '\ue000' + uuid4().hex + ':'

    def mark(self, key, text, missing=None, placeholder=None):
        missing = not self.get(key, '').strip() if missing is None else missing
        if missing:
            label = re.split(r'\s*[:(]', self.labels.get(key, key), maxsplit=1)[0].strip()
            text = placeholder or 'Укажите: ' + label
        token = str(len(self.tokens))
        self.tokens[token] = MISSING_FILL if missing else FILLED_FILL
        return f'{self.prefix}{token}\ue001{text}\ue002'


def mark_field(fields, key, text, *, missing=None, placeholder=None):
    return fields.mark(key, text, missing, placeholder) if isinstance(fields, DraftFields) else text


def field_value(fields, key, draft):
    text = fields.get(key, '').strip() or ('…' if draft else '')
    return mark_field(fields, key, text) if draft else text


def finish_preview(document, fields):
    if not isinstance(fields, DraftFields):
        return
    pattern = re.compile(re.escape(fields.prefix) + r'(\d+)\ue001(.*?)\ue002', re.DOTALL)
    # Replacements insert each token into a run. Split only those runs and copy
    # their properties so the original font, size, emphasis and layout survive.
    for element in list(document.element.iter(qn('w:r'))):
        run = Run(element, None)
        matches = list(pattern.finditer(run.text))
        if not matches:
            continue
        offset = 0
        segments = []
        for match in matches:
            segments.append((run.text[offset:match.start()], None))
            segments.append((match.group(2), fields.tokens[match.group(1)]))
            offset = match.end()
        segments.append((run.text[offset:], None))
        for text, fill in segments:
            if not text:
                continue
            new = Run(deepcopy(element), None)
            new.text = text
            if fill:
                properties = new._r.get_or_add_rPr()
                for prior in list(properties.findall(qn('w:shd'))):
                    properties.remove(prior)
                shading = OxmlElement('w:shd')
                shading.set(qn('w:val'), 'clear')
                shading.set(qn('w:fill'), fill)
                properties.append(shading)
            element.addprevious(new._r)
        element.getparent().remove(element)
