import { useEffect, useRef } from 'react'
import { ExternalLink, PanelRightClose, X } from 'lucide-react'
import type { ProjectDraft, SourceReference, WorkspaceState, WorkspaceTab } from '../features/assistant/types'

interface Props {
  state: WorkspaceState
  sources: SourceReference[]
  project?: ProjectDraft
  onClose: () => void
  onTab: (tab: WorkspaceTab) => void
  onProject: (patch: Partial<Pick<ProjectDraft, 'title' | 'chair' | 'projectType'>>) => void
}

export function WorkspacePanel({ state, sources, project, onClose, onTab, onProject }: Props) {
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
      {state.tab === 'document' && (project ? <div className="project-fields">
        <p className="workspace-hint">Демонстрационный проект распоряжения. Поля ниже — то же состояние, которое получает чат.</p>
        <label>Тема рабочей группы<input value={project.title} onChange={(event) => onProject({ title: event.target.value })} placeholder="Например, внедрение системы" /></label>
        <label>Руководитель рабочей группы<input value={project.chair} onChange={(event) => onProject({ chair: event.target.value })} placeholder="ФИО и должность" /></label>
        <label>Тип проекта<select value={project.projectType} onChange={(event) => onProject({ projectType: event.target.value as ProjectDraft['projectType'] })}><option value="general">Общий</option><option value="it">ИТ проект</option></select></label>
        <div className="project-preview"><strong>Проект распоряжения</strong><p>О создании рабочей группы{project.title ? ' по теме «' + project.title + '»' : ' [тема не указана]'}</p><p>Руководитель: {project.chair || '[не указан]'}</p><p>Номер: не присвоен</p><small>Черновик в интерфейсе. DOCX не создан. Подписи и визы отсутствуют.</small></div>
      </div> : <p className="workspace-hint">Проект появится после выбора сценария «Создать документ».</p>)}
      {state.tab === 'route' && <div className="route-detail"><p className="workspace-hint">Предварительная информация из демо выдержки матрицы. Это не подтверждённый маршрут визирования.</p><h3>Распоряжение о рабочей группе</h3><ul><li>ДОУ — предусмотрено строкой 6 матрицы.</li><li>Кадровое подразделение — предусмотрено строкой 6.</li><li>ИТ подразделение — условно для ИТ проекта{project?.projectType === 'it' ? ' (проект помечен как ИТ)' : ''}.</li></ul><p>Последовательность визирования регулирует глава 10 Инструкции. Её текста нет в демоданных, поэтому маршрут не построен и согласование не проводилось.</p></div>}
    </div>
  </aside>
}
