"""Renderer for the supplied synthetic working-group DOCX module.

Edits a new in-memory copy. Anchors are checked before changing anything, so a
new edition with different fixed wording fails closed instead of silently
producing a plausible but incorrect document.
"""
import re
from datetime import date
from io import BytesIO

from docx import Document

from .preview_markup import field_value, finish_preview, mark_field

MONTHS = ('января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря')

def replace(paragraph, old: str, new: str):
    if old in paragraph.text:
        runs = paragraph.runs
        chars = [(ri, ci) for ri, run in enumerate(runs) for ci in range(len(run.text))]
        start = paragraph.text.index(old)
        first, first_char = chars[start]
        last, last_char = chars[start + len(old) - 1]
        if first == last:
            runs[first].text = runs[first].text[:first_char] + new + runs[first].text[last_char + 1:]
        else:
            runs[first].text = runs[first].text[:first_char] + new
            for ri in range(first + 1, last):
                runs[ri].text = ''
            runs[last].text = runs[last].text[last_char + 1:]

def replace_pattern(paragraph, pattern: str, value: str):
    match = re.search(pattern, paragraph.text)
    if not match:
        raise ValueError('source_structure_changed')
    replace(paragraph, match.group(), value)

def drop_paragraph(paragraph):
    paragraph._element.getparent().remove(paragraph._element)

def drop_table(table):
    table._element.getparent().remove(table._element)

def render(source: bytes, fields: dict[str, str], *, draft=False) -> bytes:
    document = Document(BytesIO(source))
    paragraphs = document.paragraphs
    if len(paragraphs) < 29 or len(document.tables) != 4:
        raise ValueError('source_structure_changed')
    expected = {
        0: 'МОДУЛЬНЫЙ ДОКУМЕНТ', 2: 'РАСПОРЯЖЕНИЕ', 5: 'О создании рабочей группы по ',
        6: 'В целях ', 8: '1. Создать рабочую группу по ', 9: '2. Рабочей группе до ',
        10: '3. Руководителю Рабочей группы', 11: '4. Секретарю Рабочей группы',
        12: '5. Рабочая группа прекращает деятельность после ',
        13: '6. Контроль за исполнением настоящего распоряжения возложить на ',
        15: 'Примечания по заполнению модульного распоряжения',
    }
    if any(not paragraphs[index].text.startswith(prefix) for index, prefix in expected.items()):
        raise ValueError('source_structure_changed')
    if 'УТВЕРЖДАЮ' not in document.tables[0].cell(0, 1).text or 'ВИЗУАЛИЗАЦИЯ ЭП' not in document.tables[3].cell(1, 0).text:
        raise ValueError('source_structure_changed')
    def value(key):
        return field_value(fields, key, draft) if draft else fields[key].strip()
    replace(paragraphs[1], 'НАИМЕНОВАНИЕ ОРГАНИЗАЦИИ', value('organization'))
    # Main text: only variable slots and numbered hints change; fixed clauses stay.
    for index, key in ((5, 'subject'), (6, 'purpose'), (8, 'subject'), (12, 'termination'), (13, 'control')):
        replace_pattern(paragraphs[index], r'_{3,}', value(key))
    for index in (6, 8, 12, 13):
        replace_pattern(paragraphs[index], r'\s*\[\d+\]', '')
    if draft and not fields.get('deadline', '').strip():
        date_phrase = mark_field(fields, 'deadline', '…')
    else:
        deadline = date.fromisoformat(fields['deadline'])
        date_phrase = f'«{deadline.day:02d}» {MONTHS[deadline.month-1]} {deadline.year} г.'
        if draft:
            date_phrase = mark_field(fields, 'deadline', date_phrase)
    replace_pattern(paragraphs[9], r'«_{3}»\s*_{3,}\s*20_{3}\s*г\.', date_phrase)
    def phrase(key):
        text = fields.get(key, '').strip().rstrip('.') if draft else fields[key].strip().rstrip('.')
        return mark_field(fields, key, text or '…') if draft else text
    replace_pattern(paragraphs[9], r'_{3,}', phrase('tasks'))
    replace_pattern(paragraphs[9], r'_{3,}', (phrase('result') + ' ' + phrase('recipient')).strip())
    replace_pattern(paragraphs[9], r'\s*\[\d+\]', '')
    replace_pattern(paragraphs[9], r'\s*\[\d+\]', '')
    replace(paragraphs[3], ' (НЕ УДАЛЯТЬ)', '')
    composition = document.tables[2]
    if [composition.cell(row, 0).text.strip() for row in (1,2,3)] != ['Руководитель', 'Секретарь', 'Члены']:
        raise ValueError('source_structure_changed')
    for row, key in ((1, 'chair'), (2, 'secretary'), (3, 'members')):
        cell = composition.cell(row, 1)
        replace_pattern(cell.paragraphs[0], r'_{3,}', value(key))
        if row == 3:
            replace_pattern(cell.paragraphs[0], r'\s*\[3\]', '')
    signature = document.tables[3]
    replace_pattern(signature.cell(0, 2).paragraphs[0], r'И\. О\. Фамилия\s*\[8\]', value('signer'))
    replace_pattern(signature.cell(0, 1).paragraphs[0], r'_{3,}', '')
    for cell in signature.rows[1].cells:
        for paragraph in cell.paragraphs:
            replace(paragraph, ' (НЕ УДАЛЯТЬ)', '')
    # Keep the emblem area, but remove the visible sample-image prompt.
    for paragraph in document.tables[1].cell(0,0).paragraphs:
        replace(paragraph, 'ГЕРБ', '')
        replace(paragraph, 'место для изображения', '')
    drop_table(document.tables[0]) # approval stamp belongs to the module, not its project
    for paragraph in paragraphs[15:]:
        drop_paragraph(paragraph)
    drop_paragraph(paragraphs[0])
    finish_preview(document, fields)
    text = '\n'.join(p.text for p in document.paragraphs)
    text += '\n' + '\n'.join(cell.text for table in document.tables for row in table.rows for cell in row.cells)
    if re.search(r'\[\d+\]|_{3,}|МОДУЛЬНЫЙ ДОКУМЕНТ|УТВЕРЖДАЮ|НЕ УДАЛЯТЬ|Примечания по заполнению', text):
        # Underscores are allowed only in the preserved date/registration area.
        raise ValueError('unresolved_placeholders')
    if 'ДАТА / РЕГИСТРАЦИОННЫЙ НОМЕР' not in text or 'ВИЗУАЛИЗАЦИЯ ЭП' not in text:
        raise ValueError('service_area_missing')
    output = BytesIO()
    document.save(output)
    return output.getvalue()
