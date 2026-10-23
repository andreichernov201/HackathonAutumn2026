import type { Scenario } from './types'

export const scenarios: Record<Scenario, { title: string; prompt: string; description: string }> = {
  requirement: {
    title: 'Найти требование',
    prompt: 'Когда присваивать номер распоряжению о рабочей группе и кто участвует по матрице?',
    description: 'Поиск по базе нормативных документов',
  },
  document: {
    title: 'Создать документ',
    prompt: 'Создать проект распоряжения о рабочей группе',
    description: 'Подготовка проекта по шаблону',
  },
  'file-check': {
    title: 'Проверить файл',
    prompt: 'Проверь прикреплённый файл: ',
    description: 'Проверка структуры и требований',
  },
  approval: {
    title: 'Требования визирования',
    prompt: 'Кто участвует в визировании распоряжения о рабочей группе?',
    description: 'Маршрут и необходимые согласования',
  },
}

