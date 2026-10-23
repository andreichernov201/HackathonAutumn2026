export type Scenario = 'requirement' | 'document' | 'file-check' | 'approval'

export interface FileReference {
  name: string
  size: number
  type: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  file?: FileReference
  createdAt: string
  scenario?: Scenario
}

export interface ChatSession {
  id: string
  title: string
  updatedAt: string
  messages: ChatMessage[]
}

export interface ChatRequest {
  text: string
  scenario?: Scenario
  file?: File
}

export type ChatResult =
  | { status: 'not-configured' }
  | { status: 'completed'; text: string }

export interface AssistantGateway {
  submit(request: ChatRequest): Promise<ChatResult>
}
