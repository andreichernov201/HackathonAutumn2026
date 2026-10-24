import type { AssistantGateway } from './types'

// File checking remains explicitly unavailable. Normative text always comes from
// KnowledgeService; keep no second corpus of excerpts or inferred requirements.
export const demoGateway: AssistantGateway = {
  async submit(request) {
    return {
      status: 'not-configured', conversationId: request.conversationId,
      message: 'Проверка файлов пока не подключена: содержимое выбранного файла не загружено и не прочитано. Qwen не подключена. Поиск по оригиналам доступен в разделе «База знаний».',
    }
  },
}
