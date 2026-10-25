"""Employee-facing summaries from confirmed service results, never model UI/code."""
import re
from html import unescape
from html.parser import HTMLParser

TOOL_LABELS = {
    'list_templates': 'Подбираю документ',
    'get_template': 'Получаю поля документа',
    'create_document_project': 'Создаю черновик',
    'get_document_project': 'Получаю актуальный документ',
    'list_document_projects': 'Получаю список документов',
    'update_document_fields': 'Сохраняю реквизиты',
    'validate_document_project': 'Проверяю заполнение',
    'generate_document_docx': 'Формирую DOCX',
    'list_document_versions': 'Получаю версии документа',
    'get_document_artifact': 'Подготавливаю скачивание',
    'list_knowledge_documents': 'Получаю список источников',
    'search_knowledge': 'Ищу нормативные требования',
    'get_knowledge_document': 'Получаю сведения об источнике',
    'get_knowledge_section': 'Читаю исходный пункт',
    'list_knowledge_versions': 'Проверяю редакции источника',
    'verify_citation': 'Проверяю цитату',
}

TEMPLATE_CHOICE_TEXT = 'Выберите документ из списка ниже. После выбора откроется форма для заполнения.'


class _ReadableHTML(HTMLParser):
    """Keep prose but discard markup and non-prose subtrees, including SVG titles."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = []

    def handle_starttag(self, tag, attrs):
        if tag in ('svg', 'script', 'style', 'pre', 'code', 'iframe'):
            self.skip.append(tag)
        elif not self.skip and tag in ('p', 'div', 'br', 'li', 'section', 'h1', 'h2', 'h3'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.pop()
        elif tag in ('p', 'div', 'li', 'section', 'h1', 'h2', 'h3'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def public_text(text, templates=(), fields=()):
    """Only assistant prose is normalized; field values and exact citations stay intact."""
    text = re.sub(r'```[\s\S]*?(?:```|$)', '', text)
    text = unescape(text)
    if re.search(r'</?[A-Za-z][\w:-]*(?:\s[^>]*)?/?>', text):
        parser = _ReadableHTML()
        parser.feed(text)
        text = ''.join(parser.parts)
    # Some model responses spell a decorative icon as a word before a heading.
    text = re.sub(r'(?im)^(\s*(?:#{1,6}\s*)?)svg(?=[А-Яа-яЁё]|\s*$)\s*', r'\1', text)
    aliases = {**TOOL_LABELS, 'templateId': 'название документа', 'projectId': 'документ',
               'expectedVersion': 'версия документа', 'DocumentProject': 'проект документа',
               'FieldSpec': 'поле документа', 'version_conflict': 'конфликт версий'}
    aliases.update({t.templateId: t.title for t in templates})
    aliases.update({f.key: f.label for f in fields})
    # Resolve backticked identifiers before the plain-token pass, keeping prose out of code styling.
    text = re.sub(r'`([^`]+)`', lambda m: aliases.get(m[1], m[0]), text)
    for key in sorted(aliases, key=len, reverse=True):
        text = re.sub(r'(?<![\w-])' + re.escape(key) + r'(?![\w-])', lambda _: aliases[key], text)
    return re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', text).strip()


def document_summary(project, template, *, created=False, changed=()):
    """Summarize only a successful mutation/validation confirmed by DocumentsService."""
    if created:
        text = f'Создан черновик «{template.title}».'
    elif changed:
        labels = [f.label for f in template.fields if f.key in changed]
        text = 'Изменения сохранены.'
        if labels:
            text += '\n\nОбновлены реквизиты:\n' + '\n'.join('- ' + label for label in labels[:5])
            if len(labels) > 5:
                text += f'\n- Ещё {len(labels) - 5} реквизитов.'
    else:
        text = 'Заполнение документа проверено.'
    validation = project.validation
    if validation.ready:
        return text + '\n\nОбязательные реквизиты заполнены. Можно сформировать DOCX.'
    text += f'\n\nЗаполнено {validation.completed} из {validation.total} обязательных полей.'
    if any(i.code != 'required' for i in validation.issues):
        return text + ' Исправьте отмеченные в форме замечания.'
    return text + ' Остальные сведения добавьте в форме или сообщите в чате.'
