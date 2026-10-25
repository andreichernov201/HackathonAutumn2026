import type { ChatSession } from './types'

const STORAGE_KEY = 'regula-ai-local-sessions-v1'

export const sessionStore = {
  load(): ChatSession[] {
    try {
      const value = localStorage.getItem(STORAGE_KEY)
      if (!value) return []
      const parsed: unknown = JSON.parse(value)
      // PR #1 kept a local ProjectDraft. Drop it on load: server DocumentProject
      // is now the only editable source of document data.
      return Array.isArray(parsed) ? (parsed as (ChatSession & {project?: unknown})[]).map(({project: _legacyProject, ...session}) => session) : []
    } catch {
      return []
    }
  },
  save(sessions: ChatSession[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.map(session => ({...session, messages: session.messages.map(message => ({...message, blocks: message.blocks?.map(block => block.type === 'document_form' ? {type: block.type, projectId: block.projectId} : block)}))}))))
    } catch {
      // Без доступа к хранилищу диалоги всё равно работают до обновления страницы.
    }
  },
}

