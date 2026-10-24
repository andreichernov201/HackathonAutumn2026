import type { DocumentProject, DocumentTemplate, Session, Validation } from './types'
import { request, requestResponse, session } from '../../shared/http'

export const documentsApi = {
  async session(): Promise<Session> { return session() },
  templates: () => request<DocumentTemplate[]>('/api/document-templates'),
  projects: () => request<DocumentProject[]>('/api/document-projects'),
  get: (id: string) => request<DocumentProject>(`/api/document-projects/${encodeURIComponent(id)}`),
  create: (templateId: string, title?: string) => request<DocumentProject>('/api/document-projects', {method: 'POST', body: JSON.stringify({templateId, title})}),
  patch: (id: string, expectedVersion: number, fields: Record<string,string>, title?: string) => request<DocumentProject>(`/api/document-projects/${encodeURIComponent(id)}`, {method: 'PATCH', body: JSON.stringify({expectedVersion, fields, title})}),
  preview: (id: string, fields: Record<string,string>) => request<{preview: {section:string;label:string;value:string}[]; validation: Validation}>(`/api/document-projects/${encodeURIComponent(id)}/preview`, {method: 'POST', body: JSON.stringify({fields})}),
  validate: (id: string) => request<DocumentProject>(`/api/document-projects/${encodeURIComponent(id)}/validate`, {method: 'POST'}),
  generate: (id: string) => request<DocumentProject>(`/api/document-projects/${encodeURIComponent(id)}/generate`, {method: 'POST'}),
  artifactUrl: (id: string, artifactId: string) => `/api/document-projects/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}/download`,
  download: async (id: string, artifactId: string, filename: string) => {
    const response = await requestResponse(`/api/document-projects/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifactId)}/download`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
  },
}
