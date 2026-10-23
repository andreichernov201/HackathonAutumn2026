import type { ChatSession } from './types'

const STORAGE_KEY = 'regula-ai-local-sessions-v1'

export const sessionStore = {
  load(): ChatSession[] {
    try {
      const value = localStorage.getItem(STORAGE_KEY)
      if (!value) return []
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as ChatSession[]) : []
    } catch {
      return []
    }
  },
  save(sessions: ChatSession[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
    } catch {
      // Без доступа к хранилищу диалоги всё равно работают до обновления страницы.
    }
  },
}
