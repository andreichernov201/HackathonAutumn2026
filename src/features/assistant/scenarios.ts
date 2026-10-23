import type { Scenario } from './types'

export const scenarios: Record<Scenario, { title: string; prompt: string; description: string }> = {
  requirement: {
    title: 'Найти требование',
    prompt: 'Найди нормативное требование по теме: ',
    description: 'Поиск по базе нормативных документов',
  },
  document: {
    title: 'Создать документ',
    prompt: 'Помоги подготовить документ: ',
    description: 'Подготовка проекта по шаблону',
  },
  'file-check': {
    title: 'Проверить файл',
    prompt: 'Проверь прикреплённый файл: ',
    description: 'Проверка структуры и требований',
  },
  approval: {
    title: 'Требования визирования',
    prompt: 'Покажи требования к визированию для документа: ',
    description: 'Маршрут и необходимые согласования',
  },
}
