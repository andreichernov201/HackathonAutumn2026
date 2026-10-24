import { useEffect, useRef } from 'react'
import { ExternalLink, PanelRightClose, X } from 'lucide-react'
import type { SourceReference, WorkspaceState, WorkspaceTab } from '../features/assistant/types'

interface Props {
  state: WorkspaceState
  sources: SourceReference[]
  documentProjectId?: string
  onOpenDocument?: () => void
  onClose: () => void
  onTab: (tab: WorkspaceTab) => void
}

export function WorkspacePanel({ state, sources, documentProjectId, onOpenDocument, onClose, onTab }: Props) {
  const selectedRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (state.open && state.tab === 'sources' && state.selectedSourceId) selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [state.open, state.tab, state.selectedSourceId])
  if (!state.open) return null

  return <aside className="workspace-panel" aria-label="Рабочая панель">
    <div className="workspace-head"><div><small>КОНТЕКСТ ДИАЛОГА</small><h2>Рабочая панель</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Свернуть рабочую панель"><PanelRightClose size={20} /><X className="workspace-mobile-x" size={16} /></button></div>
    <div className="workspace-tabs" role="tablist" aria-label="Разделы рабочей панели">
      {([['sources', 'Источники'], ['document', 'Документ'], ['route', 'Маршрут']] as const).map(([id, label]) =>
        <button key={id} type="button" role="tab" aria-selected={state.tab === id} className={state.tab === id ? 'active' : ''} onClick={() => onTab(id)}>{label}</button>)}
    </div>
    <div className="workspace-body">
      {state.tab === 'sources' && <div className="source-list">
        <p className="workspace-hint">Демо выдержки из условий кейса. Оригиналы документов и их версии пока не загружены; проверьте текст по подлиннику перед использованием.</p>
        {sources.length ? sources.map((source) => <article id={'source-' + source.id} ref={state.selectedSourceId === source.id ? selectedRef : undefined} className={'source-detail ' + (state.selectedSourceId === source.id ? 'selected' : '')} key={source.id}>
          <small>{source.locator}</small><h3>{source.title}</h3><p>{source.excerpt}</p>
          {source.originalUrl ? <a href={source.originalUrl} target="_blank" rel="noreferrer">Открыть оригинал <ExternalLink size={13} /></a> : <span className="source-unavailable">Оригинал не подключён</span>}
        </article>) : <p className="workspace-hint">В этом диалоге пока нет источников.</p>}
      </div>}
      {state.tab === 'document' && (documentProjectId ? <div className="project-fields"><p className="workspace-hint">Проект хранится в сервисе документов и доступен из чата и редактора.</p><button className="document-next" onClick={onOpenDocument}>Открыть проект {documentProjectId.slice(0, 8)}</button></div> : <p className="workspace-hint">Создайте серверный проект в разделе «Документы» и откройте его в чате.</p>)}
      {state.tab === 'route' && <div className="route-detail"><p className="workspace-hint">Предварительная информация из синтетической матрицы. Это не фактический маршрут визирования.</p><h3>Распоряжение о рабочей группе</h3><ul><li>ДОУ — предусмотрено строкой 6 матрицы.</li><li>Кадровое подразделение — предусмотрено строкой 6.</li><li>ИТ подразделение — условно для ИТ проекта.</li></ul><p>Фактическое согласование в ИИС ДО не проводилось.</p></div>}
    </div>
  </aside>
}

