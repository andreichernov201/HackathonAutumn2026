"""Render a temporary DOCX through the existing, source-based generators."""
from .module_renderers import render as render_module
from .preview_markup import DraftFields
from .working_group import render as render_working_group

DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'


def render_document_preview(template_id, source, fields, specs):
    values = DraftFields(fields, specs)
    try:
        if template_id == 'working-group-order':
            return render_working_group(source, values, draft=True)
        return render_module(template_id, source, values, draft=True)
    except Exception as exc:
        # DOCX parser errors can contain local paths or XML content.
        code = str(exc) if isinstance(exc, ValueError) else ''
        if code in ('source_structure_changed', 'unresolved_placeholders', 'service_area_missing'):
            raise ValueError(code) from exc
        raise ValueError('preview_render_failed') from exc
