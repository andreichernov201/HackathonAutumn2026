import type { Scenario } from './types'

export const scenarios: Record<Scenario, { title: string; prompt: string; description: string }> = {
  requirement: {
    title: 'Найти требование',
    prompt: 'Когда присваивать номер распоряжению о рабочей группе и кто участвует по матрице?',
    description: 'Демо ответ по выдержкам из кейса',
  },
  document: {
    title: 'Создать документ',
    prompt: 'Создать проект распоряжения о рабочей группе',
    description: 'Редактор распоряжения и DOCX',
  },
  'file-check': {
    title: 'Проверить файл',
    prompt: 'Проверь прикреплённый файл: ',
    description: 'Сервис проверки пока не подключён',
  },
  approval: {
    title: 'Требования визирования',
    prompt: 'Кто участвует в визировании распоряжения о рабочей группе?',
    description: 'Подразделения по матрице, без маршрута',
  },
}


