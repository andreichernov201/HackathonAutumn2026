import type { DocumentProject, DocumentTemplate, Session, Validation } from './types'

let csrfToken = ''
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers: { ...(init.body instanceof FormData ? {} : {'Content-Type': 'application/json'}), ...(init.method && init.method !== 'GET' ? {'X-CSRF-Token': csrfToken} : {}), ...init.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}
export const documentsApi = {
  async session(): Promise<Session> { const session = await request<Session>('/api/session'); csrfToken = session.csrfToken; return session },
  templates: () => request<DocumentTemplate[]>('/api/document-templates'),
  projects: () => request<DocumentProject[]>('/api/document-projects'),
  get: (id: string) => request<DocumentProject>(`/api/document-projects/${encodeURIComponent(id)}`),
  create: (templateId: string, title?: string) => request<DocumentProject>('/api/document-projects', {method: 'POST', body: JSON.stringify({templateId, title})}),
  patch: (id: string, expectedVersion: number, fields: Record<string,string>, title?: string) => request<DocumentProject>(`/api/document-projects/${encodeURIComponent(id)}`, {method: 'PATCH', body: JSON.stringify({expectedVersion, fields, title})}),
  preview: (id: string, fields: Record<string,string>) => request<{preview: {section:string;label:string;value:string}[]; validation: Validation}>(`/api/document-projects/${encodeURIComponent(id)}/preview`, {method: 'POST', body: JSON.stringify({fields})}),
  validate: (id: string) => request<DocumentProject>(`/api/document-projects/${encodeURIComponent(id)}/validate`, {method: 'POST'}),
  generate: (id: string) => request<DocumentProject>(`/api/document-projects/${encodeURIComponent(id)}/generate`, {method: 'POST'}),
  download: async (id: string, artifactId: string, filename: string) => {
    const response = await fetch(`/api/document-projects/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}/download`, {credentials: 'same-origin'})
    if (!response.ok) throw new Error('Не удалось скачать файл')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
  },
}
