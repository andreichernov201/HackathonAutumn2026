export type Scenario = 'requirement' | 'document' | 'file-check' | 'approval'
export interface FileReference { name: string; size: number; type: string }
export type WorkspaceTab = 'sources' | 'document' | 'route'
export interface WorkspaceState { open: boolean; tab: WorkspaceTab; selectedSourceId?: string }
export interface SourceReference {
  id: string
  title: string
  locator: string
  excerpt: string
  provenance: 'case-excerpt'
  originalUrl?: string
}
export type ChatBlock =
  | { type: 'citation'; sourceId: string; note?: string }
  | { type: 'task_progress'; title: string; steps: { label: string; state: 'done' | 'current' | 'pending' }[] }
  | { type: 'clarification'; question: string; fields: ('title' | 'chair' | 'projectType')[] }
  | { type: 'document_card'; title: string; status: 'draft' | 'needs-data'; summary: string }
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
}
// Same-origin JSON contract for future FastAPI POST /api/chat.
// File content needs a separate authenticated upload flow.
export interface ChatRequest {
  conversationId: string
  message: string
  scenario?: Scenario
  history: ChatMessage[]
  context: { documentProjectId?: string; workspace: WorkspaceState; file?: FileReference }
}
export type ChatResult =
  | { status: 'completed'; conversationId: string; text: string; blocks: ChatBlock[]; sources: SourceReference[]; workspace?: WorkspaceState; origin: 'demo' | 'api' }
  | { status: 'not-configured' | 'error'; conversationId: string; message: string }
export interface AssistantGateway { submit(request: ChatRequest): Promise<ChatResult> }

