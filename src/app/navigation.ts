import { BookOpenText, FileText, ShieldCheck, MessageSquareText, House } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Scenario } from '../features/assistant/types'

export type Section = 'home' | 'assistant' | 'documents' | 'check' | 'knowledge'

export const navigation: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Главная', icon: House },
  { id: 'assistant', label: 'Чаты', icon: MessageSquareText },
  { id: 'documents', label: 'Документы', icon: FileText },
  { id: 'check', label: 'Проверка', icon: ShieldCheck },
  { id: 'knowledge', label: 'База знаний', icon: BookOpenText },
]

export const sectionDetails: Record<
  Exclude<Section, 'assistant' | 'home'>,
  {
    icon: LucideIcon
    title: string
    text: string
    action: string
    scenario: Scenario
  }
> = {
  documents: {
    icon: FileText,
    title: 'Документы',
    text: 'Создавайте документы по шаблонам и сохраняйте версии.',
    action: 'Начать создание документа',
    scenario: 'document',
  },
  check: {
    icon: ShieldCheck,
    title: 'Проверка',
    text: 'Откройте оригинал документа для проверки.',
    action: 'Подготовить файл к проверке',
    scenario: 'file-check',
  },
  knowledge: {
    icon: BookOpenText,
    title: 'База знаний',
    text: 'Найдите инструкцию или нормативный пункт в базе знаний.',
    action: 'Сформулировать запрос',
    scenario: 'requirement',
  },
}
