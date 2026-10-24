"""Deterministic extraction. Model interpretation is never stored as source text."""
import re
import zipfile
from dataclasses import dataclass, field
from io import BytesIO

MAX_BYTES = 20 * 1024 * 1024
MAX_TEXT = 4_000_000
MAX_SECTIONS = 20000
EXTRACTOR = 'regula-structure-v3'
CASE_WATERMARK = 'УЧЕБНЫЙ ПРИМЕР ДЛЯ ИТ-СОРЕВНОВАНИЙ. НЕ ЯВЛЯЕТСЯ ДЕЙСТВУЮЩИМ ДОКУМЕНТОМ'
MIMES = {
    'pdf': {'application/pdf'},
    'docx': {'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
    'txt': {'text/plain'},
}
NUMBER = re.compile(r'^(\d+(?:\.\d+)*)(?:[.)])?\s+(.+)$')
CHAPTER = re.compile(r'^(Глава|Раздел|Приложение)\s+([\w.-]+)', re.I)


@dataclass
class ExtractedSection:
    heading: str
    text: str
    number: str | None = None
    parent: int | None = None
    page_start: int | None = None
    page_end: int | None = None
    table: list[list[str]] | None = None
    locator: str = ''
    confidence: str = 'fragment'


@dataclass
class Extraction:
    sections: list[ExtractedSection] = field(default_factory=list)
    page_count: int | None = None
    warnings: list[str] = field(default_factory=list)


def extract(content: bytes, file_type: str, mime: str) -> Extraction:
    if not content or len(content) > MAX_BYTES:
        raise ValueError('invalid_file_size')
    if file_type not in MIMES or mime not in MIMES[file_type] | {'application/octet-stream'}:
        raise ValueError('unsupported_file_type')
    result = Extraction()
    blocks: list[tuple[str | list[list[str]], int | None, bool]] = []
    try:
        if file_type == 'pdf':
            import fitz
            if not content.startswith(b'%PDF-'):
                raise ValueError('invalid_pdf')
            with fitz.open(stream=content, filetype='pdf') as pdf:
                if pdf.needs_pass or len(pdf) > 1000:
                    raise ValueError('encrypted_or_large_pdf')
                result.page_count = len(pdf)
                for i, page in enumerate(pdf):
                    # Preserve PDF reading order. Geometric sorting can weave a
                    # diagonal watermark into a clause and lose its number.
                    text = page.get_text(sort=False)
                    if not text.strip():
                        result.warnings.append(f'Страница {i+1}: текстовый слой не найден; OCR не подключён.')
                    for line in text.splitlines():
                        if line.strip() == CASE_WATERMARK:
                            warning = 'Повторяющаяся учебная маркировка PDF исключена из текста пунктов; полностью сохранена в оригинале. Это синтетический учебный документ.'
                            if warning not in result.warnings:
                                result.warnings.append(warning)
                        elif line.strip():
                            blocks.append((line, i + 1, False))
                result.warnings.append('PDF извлечён из текстового слоя; расположение таблиц проверяйте по оригиналу.')
        elif file_type == 'docx':
            if not zipfile.is_zipfile(BytesIO(content)):
                raise ValueError('invalid_docx')
            with zipfile.ZipFile(BytesIO(content)) as archive:
                entries = archive.infolist()
                if len(entries) > 5000 or sum(item.file_size for item in entries) > 80 * 1024 * 1024:
                    raise ValueError('unsafe_docx_archive')
                if 'word/document.xml' not in archive.namelist() or any('vbaproject' in item.filename.lower() for item in entries):
                    raise ValueError('invalid_docx')
                # Do not resolve external references, embedded objects or macros.
            from docx import Document
            from docx.table import Table
            from docx.text.paragraph import Paragraph
            document = Document(BytesIO(content))
            auto_numbering = False
            for block in document.iter_inner_content():
                if isinstance(block, Paragraph):
                    if block._p.xpath('./w:pPr/w:numPr'):
                        auto_numbering = True
                    if block.text.strip():
                        blocks.append((block.text, None, bool(block.style and block.style.name.startswith('Heading'))))
                elif isinstance(block, Table):
                    rows = [[cell.text for cell in row.cells] for row in block.rows]
                    if rows:
                        blocks.append((rows, None, False))
            result.warnings.append('Страницы DOCX не установлены: зависят от редактора и параметров печати.')
            if auto_numbering:
                result.warnings.append('Есть автоматическая нумерация Word: номера без явного текста не восстановлены; используйте привязку к фрагменту и оригинал.')
        else:
            if b'\x00' in content:
                raise ValueError('invalid_text_file')
            text = content.decode('utf-8-sig')
            if any(ord(char) < 32 and char not in '\n\r\t' for char in text):
                raise ValueError('invalid_text_file')
            blocks.extend((line, None, False) for line in text.splitlines() if line.strip())
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError('extraction_failed') from exc

    chapter: int | None = None
    numbered: dict[str, int] = {}
    current: int | None = None
    table_count = 0
    list_parent: int | None = None
    for block_index, (value, page, styled_heading) in enumerate(blocks):
        if isinstance(value, list):
            table_count += 1
            parent = chapter
            heading = f'Таблица {table_count}'
            table_index = len(result.sections)
            # Each row has its own stable citation and includes column labels.
            result.sections.append(ExtractedSection(heading, '\n'.join(' | '.join(row) for row in value), parent=parent, table=value, locator=heading, confidence='table'))
            headers = value[0]
            row_parent = table_index
            for row_index, row in enumerate(value[1:], 2):
                nonempty = [cell.strip() for cell in row if cell.strip()]
                # A merged all-column row labels a group, not a data row.
                if nonempty and len(set(nonempty)) == 1 and len(nonempty) > 1:
                    row_parent = len(result.sections)
                    result.sections.append(ExtractedSection(nonempty[0], nonempty[0], parent=table_index, locator=nonempty[0], confidence='table'))
                    continue
                text = '\n'.join(f'{headers[i] if i < len(headers) else i+1}: {cell}' for i, cell in enumerate(row))
                row_match = re.match(r'^(\d+(?:\.\d+)*)(?:\.\s|$)', row[0].strip()) if row else None
                explicit_number = row_match[1] if row_match else None
                label = f'Таблица {table_count}, строка {explicit_number}' if explicit_number else f'Таблица {table_count}, строка файла {row_index}'
                result.sections.append(ExtractedSection(label, text, number=explicit_number, parent=row_parent, table=[headers, row], locator=label, confidence='table'))
            current = None
            continue
        line = value.strip()
        ch = CHAPTER.match(line)
        match = NUMBER.match(line)
        if match and '.' not in match[1] and not re.match(r'^\d+[.)]\s', line):
            match = None
        standalone_number = line.rstrip('.') if re.fullmatch(r'\d+(?:\.\d+)+\.?', line) else None
        if match and '.' not in match[1] and not ch:
            next_value = blocks[block_index+1][0] if block_index+1 < len(blocks) else ''
            next_match = NUMBER.match(next_value.strip()) if isinstance(next_value, str) else None
            starts_new_root = match[1] not in numbered and next_match and next_match[1].startswith(match[1] + '.')
            if not starts_new_root and list_parent is None and current is not None:
                previous = result.sections[current]
                if previous.number and '.' in previous.number and previous.text.rstrip().endswith(':'):
                    list_parent = current
            if list_parent is not None and not starts_new_root:
                # A numbered list inside p. 4.2 is part of that point. Do not
                # overwrite chapter 4 with list item "4." or invent missing "2.".
                parent_section = result.sections[list_parent]
                parent_section.text += '\n' + value
                parent_section.page_end = page
                result.sections.append(ExtractedSection(line, value, number=match[1], parent=list_parent, page_start=page, page_end=page, locator=f'элемент {match[1]}', confidence='numbered'))
                continue
        if ch or match or styled_heading or standalone_number:
            list_parent = None
            number = match[1] if match else (standalone_number or (ch[0] if ch else None))
            parent = chapter
            if ch or styled_heading:
                parent = None
            elif number and '.' in number:
                parent = numbered.get(number.rsplit('.', 1)[0], chapter)
            locator = f'п. {number}' if match or standalone_number else line[:250]
            current = len(result.sections)
            result.sections.append(ExtractedSection(line, value, number, parent, page, page, locator=locator, confidence='numbered' if number else 'fragment'))
            if ch or styled_heading:
                chapter = current
                numbered = {}
            if number:
                numbered[number] = current
        elif current is not None:
            previous = result.sections[current]
            previous.text += '\n' + value
            previous.page_end = page
        else:
            current = len(result.sections)
            label = f'Фрагмент {current+1}'
            result.sections.append(ExtractedSection(label, value, parent=chapter, page_start=page, page_end=page, locator=label))
    if not result.sections or not any(s.text.strip() for s in result.sections):
        raise ValueError('no_text_layer')
    if len(result.sections) > MAX_SECTIONS or sum(len(s.text) for s in result.sections) > MAX_TEXT:
        raise ValueError('extracted_content_too_large')
    if any(s.confidence == 'fragment' for s in result.sections):
        result.warnings.append('Часть текста привязана к фрагментам: точный нормативный номер не определён.')
    return result
