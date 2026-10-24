import { request, session } from '../../shared/http'
import type { KnowledgeDocument, KnowledgeSection, KnowledgeSession, KnowledgeVersion, Page, SearchHit, SectionSummary } from './types'

export type Filters = {category: string; status: string; fileType: string; sort: string}
function params(values: Record<string, string | number>) {
  const result = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {if (value !== '') result.set(key, String(value))})
  return result.toString()
}
export const knowledgeApi = {
  async session() {await session(); return request<KnowledgeSession>('/api/knowledge/session')},
  list: (filters: Filters, offset = 0) => request<Page<KnowledgeDocument>>('/api/knowledge/documents?' + params({...filters, offset, limit: 20})),
  search: (q: string, filters: Filters, offset = 0) => {
    const {sort: _sort, ...rest} = filters
    return request<Page<SearchHit> & {message: string | null}>('/api/knowledge/search?' + params({...rest, q, offset, limit: 20}))
  },
  get: (id: string) => request<KnowledgeDocument>(`/api/knowledge/documents/${encodeURIComponent(id)}`),
  async versions(id: string) {
    const items: KnowledgeVersion[] = []
    let offset = 0
    while (true) {
      const page = await request<Page<KnowledgeVersion>>(`/api/knowledge/documents/${encodeURIComponent(id)}/versions?offset=${offset}`)
      items.push(...page.items); offset += page.items.length
      if (offset >= page.total || !page.items.length) return items
    }
  },
  async sections(id: string) {
    const items: SectionSummary[] = []
    let offset = 0
    while (true) {
      const page = await request<Page<SectionSummary>>(`/api/knowledge/versions/${encodeURIComponent(id)}/sections?offset=${offset}`)
      items.push(...page.items); offset += page.items.length
      if (offset >= page.total || !page.items.length) return items
    }
  },
  section: (id: string) => request<KnowledgeSection>(`/api/knowledge/sections/${encodeURIComponent(id)}`),
  upload: (file: File, metadata: Record<string, unknown>, documentId?: string) => {
    const body = new FormData(); body.append('file', file); body.append('metadata', JSON.stringify(metadata))
    return request<KnowledgeDocument>(documentId ? `/api/knowledge/documents/${encodeURIComponent(documentId)}/versions` : '/api/knowledge/documents', {method: 'POST', body})
  },
  reindex: (id: string) => request<KnowledgeVersion>(`/api/knowledge/versions/${encodeURIComponent(id)}/index`, {method: 'POST'}),
  login: (token: string) => request('/api/knowledge/admin-session', {method: 'POST', body: JSON.stringify({token})}),
  logout: () => request('/api/knowledge/admin-session', {method: 'DELETE'}),
}

const errors: Record<string, string> = {
  knowledge_document_not_found: 'Документ не найден или недоступен для вашей роли.',
  knowledge_section_not_found: 'Пункт не найден или недоступен для вашей роли.',
  knowledge_version_not_found: 'Редакция не найдена или недоступна для вашей роли.',
  knowledge_admin_required: 'Это действие доступно администратору базы знаний.',
  invalid_admin_token: 'Неверный ключ администратора или вход отключён на сервере.',
  too_many_admin_attempts: 'Слишком много попыток входа. Повторите через 5 минут.',
  invalid_upload_metadata: 'Проверьте название, даты и основание статуса редакции.',
  duplicate_version: 'Такой оригинал уже сохранён в этом документе. Выберите другую редакцию.',
  invalid_file_size: 'Выберите непустой файл размером до 20 МБ.',
  unsupported_file_type: 'Поддерживаются PDF с текстовым слоем, DOCX и TXT в UTF-8.',
  no_text_layer: 'Текст не найден. Для сканированного PDF требуется OCR, который пока не подключён.',
  extraction_failed: 'Не удалось извлечь текст. Проверьте файл и его формат.',
  source_integrity_error: 'Контрольная сумма оригинала не совпадает. Обратитесь к администратору.',
  version_metadata_mismatch: 'Редакция должна сохранить категорию, доступ и происхождение документа.',
  csrf_required: 'Сессия изменилась. Обновите страницу и повторите действие.',
  'HTTP 413': 'Размер загрузки превышает допустимый предел.',
}
export function errorText(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  return errors[code] || 'Не удалось выполнить запрос. Проверьте доступность API и корректность файла.'
}
