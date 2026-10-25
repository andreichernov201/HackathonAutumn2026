import type { KnowledgeCitation } from '../knowledge/types'
import type { DocumentTemplate, FieldSpec, Validation } from '../documents/types'
export type Scenario = 'requirement' | 'document' | 'file-check' | 'approval'
export interface FileReference { name: string; size: number; type: string }
export type WorkspaceTab = 'sources' | 'document' | 'route'
export interface WorkspaceState { open: boolean; tab: WorkspaceTab; selectedSourceId?: string }
export interface SourceReference {
  id: string
  title: string
  locator: string
  excerpt: string
  provenance: 'case-excerpt' | 'knowledge'
  originalUrl?: string
  documentId?: string
  versionId?: string
  sectionId?: string
  versionLabel?: string | null
  sourceReference?: string
  checksum?: string
}
export type ChatBlock =
  | { type: 'document_form'; projectId: string; templateId?: string; projectVersion?: number; title?: string; status?: 'draft' | 'generated'; fieldSpecs?: FieldSpec[]; values?: Record<string, string>; validation?: Validation; editable?: boolean; actions?: ('save' | 'validate' | 'preview' | 'generate' | 'open_editor')[] }
  | { type: 'download_artifact'; projectId: string; artifactId: string; projectVersion: number; filename: string }
  | { type: 'document_preview'; projectId: string; projectVersion: number }
  | { type: 'citation'; sourceId: string; note?: string }
  | { type: 'task_progress'; title: string; steps: { label: string; state: 'done' | 'current' | 'pending' }[] }
  | { type: 'clarification'; question: string; fields: string[]; confirmation?: {id: string; projectId: string; projectVersion: number} | null }
  | { type: 'document_card'; title: string; status: 'draft' | 'needs-data'; summary: string }
  | { type: 'template_suggestions'; recommendedTemplateId?: string | null; templates: Pick<DocumentTemplate, 'templateId' | 'title' | 'kind' | 'note' | 'sourceStatus'>[] }
  | { type: 'working_group_wizard'; projectId: string; projectTitle: string; projectVersion: number; fields: Record<string, string>; fieldSpecs: FieldSpec[]; completed?: boolean }
  | { type: 'validation_result'; outcome: 'pass' | 'needs-review' | 'blocked'; checks: { label: string; detail: string }[] }
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  file?: FileReference
  createdAt: string
  scenario?: Scenario
  blocks?: ChatBlock[]
  origin?: 'demo' | 'api'
}
export interface ChatSession {
  id: string
  title: string
  updatedAt: string
  messages: ChatMessage[]
  documentProjectId?: string
  sources?: SourceReference[]
  workspace?: WorkspaceState
  knowledgeSource?: KnowledgeCitation
}
// Same-origin JSON contract for future FastAPI POST /api/chat.
// File content needs a separate authenticated upload flow.
export interface ChatRequest {
  conversationId: string
  requestId: string
  syntheticOnlyAcknowledged?: boolean
  confirmActionId?: string
  selectTemplateId?: string
  message: string
  scenario?: Scenario
  history: ChatMessage[]
  context: { documentProjectId?: string; workspace: WorkspaceState; file?: FileReference; knowledgeSource?: KnowledgeCitation }
}
export type ChatResult =
  | { status: 'completed'; conversationId: string; text: string; blocks: ChatBlock[]; sources: SourceReference[]; documentProjectId?: string | null; message?: string | null; workspace?: WorkspaceState | null; origin: 'demo' | 'api' }
  | { status: 'not-configured' | 'error'; conversationId: string; message: string }
export interface AssistantGateway { submit(request: ChatRequest, onProgress?: (label: string) => void): Promise<ChatResult> }

