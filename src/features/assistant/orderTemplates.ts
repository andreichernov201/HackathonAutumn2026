import type { DocumentTemplate } from '../documents/types'

// These are routing rules for the seven IDs returned by the documents API.
// They do not generate a document type or infer a template outside that catalog.
const rules: Array<{ templateId: string; patterns: RegExp[] }> = [
  {templateId: 'working-group-order', patterns: [/рабоч\w*\s+групп/i]},
  {templateId: 'project-committee-order', patterns: [/проектн\w*\s+комитет/i]},
  {templateId: 'internal-audit-order', patterns: [/внутренн\w*\s+аудит/i]},
  {templateId: 'system-commissioning-order', patterns: [/ввод\w*\s+в\s+эксплуатац/i, /эксплуатац.*информационн\w*\s+систем/i]},
  {templateId: 'records-officers-order', patterns: [/делопроизводств/i, /ответственн\w*\s+за\s+делопроизводств/i]},
  {templateId: 'handover-order', patterns: [/при[её]м\w*\s+и\s+передач/i, /передач\w*\s+дел/i, /передач\w*\s+имуществ/i]},
  {templateId: 'local-act-order', patterns: [/локальн\w*\s+(документ|акт)/i, /утвержден\w*.*локальн/i]},
]

export function isOrderCreationCommand(text: string) {
  return /\b(созда(?:ть|й|м|ю)|подготов(?:ить|ь|им|лю)|оформ(?:ить|и|им|лю)|сформир(?:овать|уй|уем|ую))\b/i.test(text)
    && /\b(приказ\w*|распоряжен\w*)\b/i.test(text)
}

export function recommendedOrderTemplateId(text: string, templates: DocumentTemplate[]) {
  const rule = rules.find(item => item.patterns.some(pattern => pattern.test(text)))
  return rule && templates.some(template => template.templateId === rule.templateId) ? rule.templateId : undefined
}
