import { useEffect, useState } from 'react'
import { ArrowRight, BookOpenText, FilePlus2, FileText, MessageSquareText, ShieldCheck } from 'lucide-react'
import type { Scenario, ChatSession } from '../features/assistant/types'
import type { Section } from '../app/navigation'
import type { DocumentProject } from '../features/documents/types'
import { documentsApi } from '../features/documents/api'
import { Button, EmptyState, PageHeader } from './ui'

export function WelcomeView({
  onChooseScenario,
  onNavigate,
  sessions = [],
  onSession,
  onDocument,
}: {
  onChooseScenario: (id: Scenario) => void
  onNavigate: (section: Section) => void
  sessions?: ChatSession[]
  onSession: (id: string) => void
  onDocument: (id: string) => void
}) {
  const [projects, setProjects] = useState<DocumentProject[]>([])
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    documentsApi
      .session()
      .then(() => documentsApi.projects())
      .then((items) => {
        if (active) setProjects(items)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [])
  return (
    <section className="home-page">
      <PageHeader title="Рабочее пространство" description="Документы, знания и рабочие диалоги" />
      <div className="home-actions">
        <button onClick={() => onNavigate('documents')}>
          <FilePlus2 size={20} />
          <strong>Создать документ</strong>
          <span>Выбрать шаблон и заполнить реквизиты</span>
          <ArrowRight size={16} />
        </button>
        <button onClick={() => onNavigate('knowledge')}>
          <BookOpenText size={20} />
          <strong>Найти в базе знаний</strong>
          <span>Инструкции, регламенты и точные пункты</span>
          <ArrowRight size={16} />
        </button>
        <button onClick={() => onNavigate('check')}>
          <ShieldCheck size={20} />
          <strong>Открыть для проверки</strong>
          <span>Работа с загруженным PDF или DOCX</span>
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="docs-section-head">
        <h2>Недавние документы</h2>
        <Button variant="ghost" onClick={() => onNavigate('documents')}>
          Все документы <ArrowRight size={15} />
        </Button>
      </div>
      {error ? (
        <p className="error-state" role="alert">
          Не удалось загрузить недавние документы.
        </p>
      ) : projects.length ? (
        <div className="home-recent">
          {projects.slice(0, 5).map((item) => (
            <button key={item.projectId} onClick={() => onDocument(item.projectId)}>
              <FileText size={18} />
              <span>
                <strong>{item.title}</strong>
                <small>Черновик · Версия {item.version}</small>
              </span>
              <time>{new Date(item.updatedAt).toLocaleDateString('ru-RU')}</time>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="Документов пока нет">Выберите шаблон, чтобы начать работу.</EmptyState>
      )}
      <div className="docs-section-head">
        <h2>Последние диалоги</h2>
        <Button variant="ghost" onClick={() => onChooseScenario('requirement')}>
          Новый запрос <ArrowRight size={15} />
        </Button>
      </div>
      {sessions.length ? (
        <div className="home-recent">
          {sessions.slice(0, 4).map((item) => (
            <button key={item.id} onClick={() => onSession(item.id)}>
              <MessageSquareText size={18} />
              <span>
                <strong>{item.title}</strong>
                <small>{new Date(item.updatedAt).toLocaleDateString('ru-RU')}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="Начните рабочий диалог">История поможет вернуться к найденным источникам.</EmptyState>
      )}
    </section>
  )
}
