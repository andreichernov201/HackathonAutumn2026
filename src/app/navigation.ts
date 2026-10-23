import { BookOpenText, FileText, ShieldCheck, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Scenario } from '../features/assistant/types'

export type Section = 'assistant' | 'documents' | 'check' | 'knowledge'

export const navigation: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'assistant', label: 'AI-ассистент', icon: Sparkles },
  { id: 'documents', label: 'Документы', icon: FileText },
  { id: 'check', label: 'Проверка', icon: ShieldCheck },
  { id: 'knowledge', label: 'База знаний', icon: BookOpenText },
]

export const sectionDetails: Record<Exclude<Section, 'assistant'>, { icon: LucideIcon; title: string; text: string; action: string; scenario: Scenario }> = {
  documents: {
    icon: FileText,
    title: 'Документы',
    text: 'Начните с запроса в ассистенте. Создание и хранение документов сейчас недоступны.',
    action: 'Начать создание документа',
    scenario: 'document',
  },
  check: {
    icon: ShieldCheck,
    title: 'Проверка',
    text: 'Опишите задачу или прикрепите файл в диалоге. Анализ файла сейчас недоступен.',
    action: 'Подготовить файл к проверке',
    scenario: 'file-check',
  },
  knowledge: {
    icon: BookOpenText,
    title: 'База знаний',
    text: 'Сформулируйте вопрос в диалоге. Поиск по нормативной базе сейчас недоступен.',
    action: 'Сформулировать запрос',
    scenario: 'requirement',
  },
}
