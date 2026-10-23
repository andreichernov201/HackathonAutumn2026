import { demoGateway } from './demoGateway'
import type { AssistantGateway, ChatResult } from './types'

// Only the application server is called. Model and search services stay behind it.
const apiGateway: AssistantGateway = {
  async submit(request) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(request),
    })
    if (!response.ok) throw new Error('Chat API: ' + response.status)
    const result: ChatResult = await response.json()
    if (result.conversationId !== request.conversationId) throw new Error('Conversation mismatch')
    return result
  },
}
export const assistantGateway: AssistantGateway = import.meta.env.VITE_CHAT_BACKEND === 'api' ? apiGateway : demoGateway
