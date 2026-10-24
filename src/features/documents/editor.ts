import type { FieldSpec, Validation } from './types'
import type { KnowledgeCitation } from '../knowledge/types'
import { request } from '../../shared/http'
export interface SourceReference {
  section_id: string
  version_id: string
}
export interface DocumentSuggestion {
  id: string
  project_id: string
  base_version: number
  field_id: string
  original: string
  proposed: string
  reason: string
  source: KnowledgeCitation | null
  status: 'pending' | 'accepted' | 'rejected'
  created: string
}
export interface DocumentModel {
  document_id: string
  template_id: string
  version: number
  metadata: { title: string; template_version: string | null }
  content: {
    id: string
    kind: 'field' | 'generated' | 'static' | 'protected'
    field_id: string
    value: string
    editable: boolean
  }[]
  editable_fields: FieldSpec[]
  document_styles: {
    source: string
    source_sha256: string
    mode: 'preserve_source'
  }
  validation_state: Validation
  history: {
    version: number
    operation: string
    payload: Record<string, unknown>
    created: string
  }[]
  suggestions: DocumentSuggestion[]
  missing_fields?: string[]
}
interface OperationBase {
  document_id: string
  base_version: number
}
export type EditorOperation = OperationBase &
  (
    | { operation: 'set_field'; field_id: string; value: string }
    | {
        operation: 'replace_block' | 'insert_allowed_block'
        block_id: string
        value: string
      }
    | {
        operation: 'propose_rewrite'
        block_id: string
        value: string
        reason: string
        source?: SourceReference
      }
    | { operation: 'get_missing_fields' | 'validate_document' }
    | {
        operation: 'accept_suggestion' | 'reject_suggestion'
        suggestion_id: string
        value?: string
      }
  )
export const editorApi = {
  get: (id: string, signal?: AbortSignal) =>
    request<DocumentModel>(`/api/document-projects/${encodeURIComponent(id)}/editor`, { signal }),
  apply: (operation: EditorOperation, signal?: AbortSignal) =>
    request<DocumentModel>(`/api/document-projects/${encodeURIComponent(operation.document_id)}/operations`, {
      method: 'POST',
      body: JSON.stringify(operation),
      signal,
    }),
}
/** All providers return operations to review; never HTML to execute. */
export interface AssistantGenerationRequest {
  document_id: string
  base_version: number
  prompt: string
  field_id?: string
  source_ids: string[]
}
export interface AssistantGenerationResult {
  operations: EditorOperation[]
  explanation: string
  citations: KnowledgeCitation[]
}
export interface DocumentAssistantAdapter {
  generate(request: AssistantGenerationRequest, signal: AbortSignal): Promise<AssistantGenerationResult>
  stream?: (request: AssistantGenerationRequest, signal: AbortSignal) => AsyncIterable<string>
}
/** Enable actions only when backend capabilities advertise a compatible service. */
export function createDocumentAssistantAdapter(endpoint: string, timeoutMs = 30000): DocumentAssistantAdapter {
  if (!endpoint.startsWith('/api/')) throw new Error('The assistant endpoint must belong to the application API')
  return {
    generate: (input, signal) =>
      request<AssistantGenerationResult>(endpoint, {
        method: 'POST',
        body: JSON.stringify(input),
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      }),
  }
}
