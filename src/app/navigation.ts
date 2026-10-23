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
    text: 'Здесь появятся созданные документы, когда будет подключён сервис генерации и хранения.',
    action: 'Начать создание документа',
    scenario: 'document',
  },
  check: {
    icon: ShieldCheck,
    title: 'Проверка',
    text: 'Здесь будут результаты проверок файлов после подключения сервиса анализа.',
    action: 'Подготовить файл к проверке',
    scenario: 'file-check',
  },
  knowledge: {
    icon: BookOpenText,
    title: 'База знаний',
    text: 'Поиск по нормативной базе появится после подключения источников и индекса.',
    action: 'Сформулировать запрос',
    scenario: 'requirement',
  },
}
