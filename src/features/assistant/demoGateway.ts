import type { AssistantGateway, ChatBlock, ChatRequest, ChatResult, SourceReference } from './types'

export const demoSources: SourceReference[] = [
  { id: 'method-2-1', title: 'Методические рекомендации', locator: 'п. 2.1', excerpt: 'Номер подписываемого документа до его подписания или направления на регистрацию не присваивается.', provenance: 'case-excerpt' },
  { id: 'matrix-6', title: 'Матрица согласования · Внутренние документы', locator: 'строка 6', excerpt: 'Для распоряжения о рабочей группе предусмотрены ДОУ и кадровое подразделение; ИТ подразделение — условно, если документ относится к ИТ проекту.', provenance: 'case-excerpt' },
  { id: 'method-1-3', title: 'Методические рекомендации', locator: 'п. 1.3', excerpt: 'Предусмотрены исключения при полном соответствии документа утверждённому модулю.', provenance: 'case-excerpt' },
]
const citation = (sourceId: string): ChatBlock => ({ type: 'citation', sourceId })
function reply(request: ChatRequest, text: string, blocks: ChatBlock[]): ChatResult {
  const sources = demoSources.filter((source) => blocks.some((block) => block.type === 'citation' && block.sourceId === source.id))
  return {
    status: 'completed', conversationId: request.conversationId, text, blocks,
    sources, origin: 'demo', workspace: { open: Boolean(sources.length), tab: 'sources' },
  }
}
function documentReply(request: ChatRequest): ChatResult {
  return reply(request, 'Редактор и сохранение проекта доступны в разделе «Документы». Там можно выбрать модуль, заполнить поля и проверить готовность исходного DOCX.', [])
}
function demoSubmit(request: ChatRequest): ChatResult {
  const text = request.message.toLowerCase()
  if (request.context.file) return reply(request, 'Файл выбран, но содержимое не загружено и не прочитано. Проверку файла нельзя выполнить в деморежиме.', [])
  if (request.scenario === 'document' || /созда.*(?:проект|распоряжен|документ)/.test(text)) return documentReply(request)
  if (/номер|регистрац|подписан/.test(text) && /документ|распоряж|рабоч/.test(text)) {
    const workingGroup = /рабоч|распоряж/.test(text)
    return reply(request,
      'По п. 2.1 Методических рекомендаций номер подписываемого документа не присваивается до подписания или направления на регистрацию.' +
      (workingGroup ? ' Для проекта распоряжения о рабочей группе строка 6 матрицы предусматривает ДОУ и кадровое подразделение; ИТ — условно для ИТ проекта. Эта строка не задаёт последовательность визирования: её нужно проверить по главе 10 Инструкции. Пункт 1.3 предусматривает исключение при полном соответствии утверждённому модулю; применимость исключения к конкретному документу требует проверки.' : ''),
      workingGroup ? [citation('method-2-1'), citation('matrix-6'), citation('method-1-3')] : [citation('method-2-1')])
  }
  if (/визир|согласован/.test(text) && /рабоч|распоряжен/.test(text)) {
    return reply(request, 'По строке 6 матрицы можно назвать участвующие подразделения для распоряжения о рабочей группе: ДОУ и кадровое, ИТ — условно для ИТ проекта. Демо-адаптер не строит маршрут по главе 10 Инструкции и не утверждает факт согласования.', [citation('matrix-6')])
  }
  return reply(request, 'В доступных демоданных нет проверяемого положения для этого запроса. Не буду придумывать ответ. Добавьте оригинал нормативного источника или подключите серверный поиск.', [])
}
export const demoGateway: AssistantGateway = { async submit(request) { return demoSubmit(request) } }

