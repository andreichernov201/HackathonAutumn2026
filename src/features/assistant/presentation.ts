import type { ChatBlock } from './types'

// Display-only cleanup also covers saved conversations from earlier releases.
// User messages, document values and exact source excerpts never pass through it.
const operations: Record<string, string> = {
  list_templates: 'Подбираю документ', get_template: 'Получаю поля документа',
  create_document_project: 'Создаю черновик', get_document_project: 'Получаю актуальный документ',
  list_document_projects: 'Получаю список документов', update_document_fields: 'Сохраняю реквизиты',
  validate_document_project: 'Проверяю заполнение', generate_document_docx: 'Формирую DOCX',
  list_document_versions: 'Получаю версии документа', get_document_artifact: 'Подготавливаю скачивание',
  list_knowledge_documents: 'Получаю список источников', search_knowledge: 'Ищу нормативные требования',
  get_knowledge_document: 'Получаю сведения об источнике', get_knowledge_section: 'Читаю исходный пункт',
  list_knowledge_versions: 'Проверяю редакции источника', verify_citation: 'Проверяю цитату',
}
export function progressLabel(label: string) {
  const [operation, ...suffix] = label.split(' · ')
  const translated = operations[operation] || (/^[a-z]+(?:_[a-z]+)+$/.test(operation) ? 'Обработка запроса' : operation)
  return [translated, ...suffix].join(' · ')
}
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function assistantDisplayText(text: string, blocks: ChatBlock[] = []) {
  const catalog = blocks.find(block => block.type === 'template_suggestions')
  if (catalog?.type === 'template_suggestions' && !blocks.some(block => block.type === 'citation')
      && catalog.templates.filter(t => text.includes(t.templateId) || text.includes(t.title)).length >= 2) {
    return 'Выберите документ из списка ниже. После выбора откроется форма для заполнения.'
  }
  const aliases: Record<string, string> = {...operations, templateId: 'название документа', projectId: 'документ', expectedVersion: 'версия документа', DocumentProject: 'проект документа'}
  for (const block of blocks) {
    if (block.type === 'template_suggestions') for (const template of block.templates) aliases[template.templateId] = template.title
    if (block.type === 'document_form') for (const field of block.fieldSpecs || []) aliases[field.key] = field.label
  }
  // This is text cleanup, not an HTML renderer: MessageMarkdown still escapes all raw HTML.
  let result = text.replace(/```[\s\S]*?(?:```|$)/g, '')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/<(svg|script|style|pre|code|iframe)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?[a-z][\w:-]*(?:\s[^>]*)?\/?>/gi, '')
    .replace(/^(\s*(?:#{1,6}\s*)?)svg(?=[А-Яа-яЁё]|\s*$)\s*/gim, '$1')
    .replace(/`([^`]+)`/g, (match, key: string) => aliases[key] || match)
  for (const key of Object.keys(aliases).sort((a,b) => b.length - a.length)) {
    result = result.replace(new RegExp(`(?<![\\w-])${escapeRegExp(key)}(?![\\w-])`, 'g'), () => aliases[key])
  }
  for (const block of blocks) if (block.type === 'template_suggestions') {
    for (const {title} of block.templates) result = result.replaceAll(`${title} — ${title}`, title)
  }
  return result.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim()
}
