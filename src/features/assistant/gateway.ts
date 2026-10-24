import { demoGateway } from './demoGateway'
import type { AssistantGateway, ChatResult } from './types'
import { knowledgeApi } from '../knowledge/api'

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
export const assistantGateway: AssistantGateway = {
  async submit(request) {
    if (import.meta.env.VITE_CHAT_BACKEND === 'api') return apiGateway.submit(request)
    if (request.context.knowledgeSource) return {
      status: 'not-configured', conversationId: request.conversationId,
      message: 'Пункт закреплён в контексте диалога. Qwen/RAG пока не подключён: доступен оригинальный текст и поиск в базе знаний, автоматическое объяснение недоступно.',
    }
    if (request.context.file || request.scenario === 'file-check') return demoGateway.submit(request)
    const found = await knowledgeApi.search(request.message, {category: '', status: '', fileType: '', sort: 'updatedAt'})
    const sources = found.items.slice(0, 3).map(hit => hit.citation)
    return {
      status: 'completed', conversationId: request.conversationId, origin: 'api', sources,
      text: sources.length
        ? 'Найдены совпадения в исходных материалах базы знаний. Ниже приведены точные выдержки с указанием редакции и пункта. Это полнотекстовый поиск; автоматический AI-анализ пока не подключён. Условия и исключения проверяйте в оригинале.'
        : 'Нет подтверждённого основания по этому запросу в доступных материалах. Уточните формулировку или выполните поиск в разделе «База знаний». Автоматический AI-анализ пока не подключён.',
      blocks: sources.map(source => ({type: 'citation' as const, sourceId: source.id})),
      workspace: {open: sources.length > 0, tab: 'sources', selectedSourceId: sources[0]?.id},
    }
  },
}
