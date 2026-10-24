import type { DocumentTemplate } from '../documents/types'

// These are routing rules for the seven IDs returned by the documents API.
// They do not generate a document type or infer a template outside that catalog.
const rules: Array<{ templateId: string; patterns: RegExp[] }> = [
  {templateId: 'working-group-order', patterns: [/рабоч[а-яё]*\s+групп/i]},
  {templateId: 'project-committee-order', patterns: [/проектн[а-яё]*\s+комитет/i]},
  {templateId: 'internal-audit-order', patterns: [/внутренн[а-яё]*\s+аудит/i]},
  {templateId: 'system-commissioning-order', patterns: [/ввод[а-яё]*\s+в\s+эксплуатац/i, /эксплуатац.*информационн[а-яё]*\s+систем/i]},
  {templateId: 'records-officers-order', patterns: [/делопроизводств/i, /ответственн[а-яё]*\s+за\s+делопроизводств/i]},
  {templateId: 'handover-order', patterns: [/при[её]м[а-яё]*\s+и\s+передач/i, /передач[а-яё]*\s+дел/i, /передач[а-яё]*\s+имуществ/i]},
  {templateId: 'local-act-order', patterns: [/локальн[а-яё]*\s+(документ|акт)/i, /утвержден[а-яё]*.*локальн/i]},
]

export function isOrderCreationCommand(text: string) {
  return /(созда(?:ть|й|м|ю)|подготов(?:ить|ь|им|лю)|оформ(?:ить|и|им|лю)|сформир(?:овать|уй|уем|ую))/i.test(text)
    && /(приказ[а-яё]*|распоряжен[а-яё]*)/i.test(text)
}

export function recommendedOrderTemplateId(text: string, templates: DocumentTemplate[]) {
  const rule = rules.find(item => item.patterns.some(pattern => pattern.test(text)))
  return rule && templates.some(template => template.templateId === rule.templateId) ? rule.templateId : undefined
}
