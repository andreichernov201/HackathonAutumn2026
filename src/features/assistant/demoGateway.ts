import type { AssistantGateway } from './types'

// File checking remains explicitly unavailable. Normative text always comes from
// KnowledgeService; keep no second corpus of excerpts or inferred requirements.
export const demoGateway: AssistantGateway = {
  async submit(request) {
    return {
      status: 'not-configured',
      conversationId: request.conversationId,
      message:
        'Файл не был проанализирован. Откройте его в разделе «Проверка» для чтения и сопоставьте с источниками базы знаний.',
    }
  },
}
