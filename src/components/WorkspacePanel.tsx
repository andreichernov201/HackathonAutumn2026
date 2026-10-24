import { useEffect, useRef, useState } from 'react'
import { ExternalLink, PanelRightClose, X } from 'lucide-react'
import type { SourceReference, WorkspaceState, WorkspaceTab } from '../features/assistant/types'
import { errorText, knowledgeApi } from '../features/knowledge/api'
import type { KnowledgeSection } from '../features/knowledge/types'

interface Props {
  state: WorkspaceState
  sources: SourceReference[]
  documentProjectId?: string
  onOpenDocument?: () => void
  onOpenKnowledge?: (sectionId: string) => void
  onClose: () => void
  onTab: (tab: WorkspaceTab) => void
}

function KnowledgeSource({source, onOpen}: {source: SourceReference; onOpen?: (id: string) => void}) {
  const [value, setValue] = useState<KnowledgeSection>()
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setValue(undefined); setError('')
    knowledgeApi.section(source.sectionId || source.id).then(result => {if (!cancelled) setValue(result)}).catch(error => {if (!cancelled) setError(errorText(error))})
    return () => {cancelled = true}
  }, [source.id, source.sectionId])
  if (error) return <p role="alert">{error}</p>
  if (!value) return <p>Проверка доступа к источнику…</p>
  return <><small>{value.source.locator} · Редакция: {value.source.versionLabel || 'не установлена'}</small><h3>{value.source.title}</h3><p>{value.source.excerpt}</p><a href={value.source.originalUrl} target="_blank" rel="noreferrer">Открыть оригинал <ExternalLink size={13}/></a><button className="kb-button" onClick={() => onOpen?.(value.id)}>Открыть пункт в базе знаний</button></>
}

export function WorkspacePanel({ state, sources, documentProjectId, onOpenDocument, onOpenKnowledge, onClose, onTab }: Props) {
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
        <p className="workspace-hint">{sources.some(source => source.provenance === 'knowledge') ? 'Источники закреплены за конкретными пунктами и редакциями локальной базы. Учебные материалы не являются нормативными актами Банка России.' : 'Демо выдержки из условий кейса. Проверьте текст по подлиннику перед использованием.'}</p>
        {sources.length ? sources.map((source) => <article id={'source-' + source.id} ref={state.selectedSourceId === source.id ? selectedRef : undefined} className={'source-detail ' + (state.selectedSourceId === source.id ? 'selected' : '')} key={source.id}>
          {source.provenance === 'knowledge' ? <KnowledgeSource source={source} onOpen={onOpenKnowledge}/> : <><small>{source.locator}</small><h3>{source.title}</h3><p>{source.excerpt}</p>
          {source.originalUrl ? <a href={source.originalUrl} target="_blank" rel="noreferrer">Открыть оригинал <ExternalLink size={13} /></a> : <span className="source-unavailable">Оригинал не подключён</span>}</>}
        </article>) : <p className="workspace-hint">В этом диалоге пока нет источников.</p>}
      </div>}
      {state.tab === 'document' && (documentProjectId ? <div className="project-fields"><p className="workspace-hint">Проект хранится в сервисе документов и доступен из чата и редактора.</p><button className="document-next" onClick={onOpenDocument}>Открыть проект {documentProjectId.slice(0, 8)}</button></div> : <p className="workspace-hint">Создайте серверный проект в разделе «Документы» и откройте его в чате.</p>)}
      {state.tab === 'route' && <div className="route-detail"><p className="workspace-hint">Маршрут согласования не сформирован. Перечень обязательных и условных визирующих можно проверить в оригинальной матрице в базе знаний.</p><p>Фактическое согласование в ИИС ДО не проводилось.</p></div>}
    </div>
  </aside>
}

