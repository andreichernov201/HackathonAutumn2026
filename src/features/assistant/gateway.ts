import type { AssistantGateway, ChatResult } from './types'
import { request as httpRequest } from '../../shared/http'

export interface AIConfiguration { configured: boolean; provider: string; model: string; processing: 'cloud' | 'local'; syntheticOnly: boolean }
export const aiConfiguration = () => httpRequest<AIConfiguration>('/api/chat/config')

// Only the same-origin server owns model credentials, history, tools and permissions.
export const assistantGateway: AssistantGateway = {
  async submit(request, onProgress) {
    const timer = setInterval(() => {
      void httpRequest<{state: string; tools: {name: string; state: string; label: string}[]}>(
        `/api/chat/${encodeURIComponent(request.conversationId)}/requests/${encodeURIComponent(request.requestId)}`,
      ).then(status => {
        const active = status.tools.find(t => t.state === 'running')
        onProgress?.(active?.label || (status.state === 'running' ? 'Ожидаю ответ AI-движка…' : 'Готово'))
      }).catch(() => {})
    }, 1000)
    try {
      const result = await httpRequest<ChatResult>('/api/chat', {method: 'POST', body: JSON.stringify({...request, history: []})})
      if (result.conversationId !== request.conversationId) throw new Error('Conversation mismatch')
      return result
    } finally { clearInterval(timer) }
  },
}
