import type { AssistantGateway, ChatBlock, ChatRequest, ChatResult, ProjectDraft, SourceReference } from './types'

export const demoSources: SourceReference[] = [
  { id: 'method-2-1', title: 'Методические рекомендации', locator: 'п. 2.1', excerpt: 'Номер подписываемого документа до его подписания или направления на регистрацию не присваивается.', provenance: 'case-excerpt' },
  { id: 'matrix-6', title: 'Матрица согласования · Внутренние документы', locator: 'строка 6', excerpt: 'Для распоряжения о рабочей группе предусмотрены ДОУ и кадровое подразделение; ИТ подразделение — условно, если документ относится к ИТ проекту.', provenance: 'case-excerpt' },
  { id: 'method-1-3', title: 'Методические рекомендации', locator: 'п. 1.3', excerpt: 'Предусмотрены исключения при полном соответствии документа утверждённому модулю.', provenance: 'case-excerpt' },
]
const citation = (sourceId: string): ChatBlock => ({ type: 'citation', sourceId })
const progress = (project: ProjectDraft): ChatBlock => ({
  type: 'task_progress', title: 'Подготовка проекта', steps: [
    { label: 'Выбран тип документа', state: 'done' },
    { label: 'Заполнены реквизиты проекта', state: project.title && project.chair ? 'done' : 'current' },
    { label: 'Проверка по оригиналам и выгрузка DOCX', state: 'pending' },
  ],
})
function reply(request: ChatRequest, text: string, blocks: ChatBlock[], project?: ProjectDraft): ChatResult {
  const sources = demoSources.filter((source) => blocks.some((block) => block.type === 'citation' && block.sourceId === source.id))
  return {
    status: 'completed', conversationId: request.conversationId, text, blocks,
    sources, project, origin: 'demo', workspace: { open: Boolean(project || sources.length), tab: project ? 'document' : 'sources' },
  }
}
function documentReply(request: ChatRequest): ChatResult {
  const current = request.context.project
  const project: ProjectDraft = current ?? { kind: 'working-group-order', title: '', chair: '', projectType: 'general', status: 'collecting-data' }
  // The chat and the form update the same project object. Keep parsing intentionally narrow.
  const title = request.message.match(/(?:^|[;\n])\s*тема\s*:\s*([^;\n]+)/i)?.[1]?.trim()
  const chair = request.message.match(/(?:^|[;\n])\s*руководитель\s*:\s*([^;\n]+)/i)?.[1]?.trim()
  const nextFields = { ...project, title: title ?? project.title, chair: chair ?? project.chair }
  const ready = Boolean(nextFields.title.trim() && nextFields.chair.trim())
  const next: ProjectDraft = { ...nextFields, status: ready ? 'draft' : 'collecting-data' }
  const blocks: ChatBlock[] = [
    progress(next),
    { type: 'document_card', title: 'Распоряжение о создании рабочей группы', status: ready ? 'draft' : 'needs-data', summary: ready ? 'Тема: ' + next.title + '. Руководитель: ' + next.chair + '.' : 'Для проекта нужны тема рабочей группы и её руководитель.' },
  ]
  if (!ready) blocks.push({ type: 'clarification', question: 'Укажите тему рабочей группы и её руководителя в полях справа. Затем напишите «Продолжить».', fields: ['title', 'chair', 'projectType'] })
  blocks.push(citation('method-2-1'), citation('matrix-6'))
  if (ready) blocks.push({ type: 'validation_result', outcome: 'needs-review', checks: [
    { label: 'Номер', detail: 'Не присвоен: проект ещё не подписан и не направлен на регистрацию.' },
    { label: 'Участники по матрице', detail: 'ДОУ и кадровое подразделение; ИТ — ' + (next.projectType === 'it' ? 'условно применимо к указанному ИТ проекту.' : 'только если проект относится к ИТ.') + ' Это не порядок визирования.' },
    { label: 'DOCX и согласование', detail: 'Модуль DOCX и глава 10 Инструкции не подключены; документ не выгружен и не согласован.' },
  ] })
  return reply(request, ready
    ? 'Проект распоряжения собран из введённых вами полей. Это демонстрационный черновик без номера и без выгруженного DOCX. Подразделения ниже приведены по матрице, а последовательность визирования нужно отдельно проверять по главе 10 Инструкции.'
    : 'Подготовлю проект распоряжения о рабочей группе. Сначала нужны недостающие реквизиты. Номер заранее не присваиваю; требования к участникам беру из строки 6 матрицы.', blocks, next)
}
function demoSubmit(request: ChatRequest): ChatResult {
  const text = request.message.toLowerCase()
  if (request.context.file) return reply(request, 'Файл выбран, но содержимое не загружено и не прочитано. Проверку файла нельзя выполнить в деморежиме.', [])
  if (request.scenario === 'document' || request.context.project && /продолж|проект|распоряжен|документ|тема\s*:|руководитель\s*:/.test(text)) return documentReply(request)
  if (/номер|регистрац|подписан/.test(text) && /документ|распоряж|рабоч/.test(text)) {
    const workingGroup = /рабоч|распоряж/.test(text)
    return reply(request,
      'По п. 2.1 Методических рекомендаций номер подписываемого документа не присваивается до подписания или направления на регистрацию.' +
      (workingGroup ? ' Для проекта распоряжения о рабочей группе строка 6 матрицы предусматривает ДОУ и кадровое подразделение; ИТ — условно для ИТ проекта. Эта строка не задаёт последовательность визирования: её нужно проверить по главе 10 Инструкции. Пункт 1.3 предусматривает исключение при полном соответствии утверждённому модулю; применимость исключения к конкретному документу требует проверки.' : ''),
      workingGroup ? [citation('method-2-1'), citation('matrix-6'), citation('method-1-3')] : [citation('method-2-1')])
  }
  if (/визир|согласован/.test(text) && /рабоч|распоряжен/.test(text)) {
    return reply(request, 'По строке 6 матрицы можно назвать участвующие подразделения для распоряжения о рабочей группе: ДОУ и кадровое, ИТ — условно для ИТ проекта. Последовательность визирования регулируется главой 10 Инструкции. Её текста в демоданных нет, поэтому порядок и факт согласования я не утверждаю.', [citation('matrix-6')])
  }
  return reply(request, 'В доступных демоданных нет проверяемого положения для этого запроса. Не буду придумывать ответ. Добавьте оригинал нормативного источника или подключите серверный поиск.', [])
}
export const demoGateway: AssistantGateway = { async submit(request) { return demoSubmit(request) } }
