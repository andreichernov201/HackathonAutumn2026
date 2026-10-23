import type { AssistantGateway } from './types'

// Здесь позже появится вызов сервера. Пока честно сообщаем, что он не подключён.
export const assistantGateway: AssistantGateway = {
  async submit() {
    return { status: 'not-configured' }
  },
}
