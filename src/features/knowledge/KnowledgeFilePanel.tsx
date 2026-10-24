import { useEffect, useState } from 'react'
import { FileText, Search, SlidersHorizontal, Upload, X } from 'lucide-react'
import { errorText, knowledgeApi, type Filters } from './api'
import { Highlight } from './Highlight'
import { categories, statusLabels, type KnowledgeDocument, type Page, type SearchHit } from './types'
import type { ViewerTarget } from './routing'
interface Props {
  selectedId?: string; revision: number; resetKey: number; admin: boolean; onUpload: () => void
  onSelect: (target: ViewerTarget) => void; onDefault: (document: KnowledgeDocument) => void
  onClose: () => void
}
export function KnowledgeFilePanel({selectedId, revision, resetKey, admin, onUpload, onSelect, onDefault, onClose}: Props) {
  const [draft, setDraft] = useState(''), [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>({category: '', status: '', fileType: '', sort: 'title'})
  const [offset, setOffset] = useState(0), [hitOffset, setHitOffset] = useState(0)
  const [state, setState] = useState<{catalog?: Page<KnowledgeDocument>; hits?: Page<SearchHit>; error?: string; loading: boolean}>({loading: true})
  useEffect(() => {setDraft(''); setQuery(''); setFilters({category: '', status: '', fileType: '', sort: 'title'}); setOffset(0); setHitOffset(0)}, [resetKey])
  useEffect(() => {const timer = setTimeout(() => {setQuery(draft.trim()); setOffset(0); setHitOffset(0)}, 300); return () => clearTimeout(timer)}, [draft])
  useEffect(() => {
    const controller = new AbortController()
    setState({loading: true})
    Promise.all([knowledgeApi.list(filters, offset, query, controller.signal), query ? knowledgeApi.search(query, filters, hitOffset, controller.signal) : Promise.resolve(undefined)])
      .then(([catalog, hits]) => {if (!controller.signal.aborted) setState({catalog, hits, loading: false})})
      .catch(error => {if (!controller.signal.aborted) setState({error: errorText(error), loading: false})})
    return () => controller.abort()
  }, [query, filters, offset, hitOffset, revision])
  useEffect(() => {if (!selectedId && state.catalog?.items[0] && !query) onDefault(state.catalog.items[0])}, [selectedId, state.catalog, query, onDefault])
  function filter(next: Partial<Filters>) {setFilters(previous => ({...previous, ...next})); setOffset(0); setHitOffset(0)}
  function select(target: ViewerTarget) {onSelect(target); if (window.matchMedia('(max-width: 1100px)').matches) onClose()}
  return <aside className="kw-files" aria-label="Документы базы знаний">
    <div className="kw-files-title"><h2>Документы</h2><button className="kb-icon" aria-label="Скрыть документы" onClick={onClose}><X size={17}/></button></div>
    <label className="kw-search"><Search size={16}/><input aria-label="Поиск по базе знаний" placeholder="Поиск по документам и пунктам..." value={draft} maxLength={500} onChange={event => setDraft(event.target.value)}/>{draft && <button className="kb-icon" aria-label="Очистить поиск" onClick={() => setDraft('')}><X size={15}/></button>}</label>
    <label className="kw-category">Категория<select aria-label="Категория документов" value={filters.category} onChange={event => filter({category: event.target.value})}><option value="">Все документы</option>{Object.entries(categories).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    <details className="kw-filters"><summary><SlidersHorizontal size={14}/> Фильтры{(filters.status || filters.fileType) && <span> · применены</span>}</summary><div>
      <label>Статус редакции<select aria-label="Статус редакции" value={filters.status} onChange={event => filter({status: event.target.value})}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Формат<select aria-label="Формат" value={filters.fileType} onChange={event => filter({fileType: event.target.value})}><option value="">Все форматы</option><option>pdf</option><option>docx</option><option>txt</option></select></label>
      <label>Сортировка<select aria-label="Сортировка" value={filters.sort} onChange={event => filter({sort: event.target.value})}><option value="title">По названию</option><option value="updatedAt">По обновлению</option><option value="createdAt">По добавлению</option></select></label>
    </div></details>
    <div className="kw-file-scroll" aria-busy={state.loading}>
      {state.loading && <p className="kw-state" role="status">Поиск в базе…</p>}
      {state.error && <div className="kb-error" role="alert">{state.error}<button className="kb-button" onClick={() => setFilters(value => ({...value}))}>Повторить</button></div>}
      {!state.loading && !state.error && <>
        <h3 className="kw-list-label">{query ? 'Название и сведения' : 'Все источники'} <span>{state.catalog?.total || 0}</span></h3>
        <div className="kw-file-list">{state.catalog?.items.map(document => <button key={document.id} className={`kw-file-row ${document.id === selectedId ? 'selected' : ''}`} aria-pressed={document.id === selectedId} onClick={() => select({documentId: document.id, versionId: document.latestVersion.id})}>
          <span className={`kw-format ${document.latestVersion.fileType}`}><FileText size={18}/><small>{document.latestVersion.fileType.toUpperCase()}</small></span>
          <span className="kw-file-copy"><strong><Highlight text={document.title} query={query}/></strong><small>{document.latestVersion.pageCount ? `${document.latestVersion.pageCount} стр. · ` : ''}{document.latestVersion.versionLabel || 'Редакция не установлена'}</small><small className={'kw-file-status ' + document.latestVersion.status}>{statusLabels[document.latestVersion.status]}</small></span>
        </button>)}</div>
        {!!state.catalog?.total && <PageButtons page={state.catalog} offset={offset} onOffset={setOffset} label="документов"/>}
        {query && <><h3 className="kw-list-label">Совпадения в пунктах <span>{state.hits?.total || 0}</span></h3><div className="kw-search-results">{state.hits?.items.map(hit => <button className={`kw-hit ${hit.citation.documentId === selectedId ? 'current-document' : ''}`} key={hit.section.id} onClick={() => select({sectionId: hit.section.id})}>
          <strong><Highlight text={hit.citation.title} query={query}/></strong><small>{hit.citation.locator} · {hit.citation.versionLabel || 'Редакция не установлена'}</small><p><Highlight text={hit.snippet} query={query}/></p>
        </button>)}</div>{state.hits && <PageButtons page={state.hits} offset={hitOffset} onOffset={setHitOffset} label="совпадений"/>}</>}
        {!state.catalog?.total && !state.hits?.total && <div className="kw-state"><p>{query || filters.category || filters.status || filters.fileType ? 'Подходящих источников нет.' : 'Доступных документов пока нет.'}</p>{query || filters.category || filters.status || filters.fileType ? <button className="kb-button" onClick={() => {setDraft(''); setFilters({category: '', status: '', fileType: '', sort: 'title'}); setOffset(0); setHitOffset(0)}}>Сбросить поиск и фильтры</button> : <p>{admin ? 'Загрузите PDF, DOCX или TXT.' : 'Документы может добавить администратор базы.'}</p>}</div>}
      </>}
    </div>
    {admin && <div className="kw-upload"><button className="kb-button primary" onClick={onUpload}><Upload size={16}/> Загрузить документ</button></div>}
  </aside>
}
function PageButtons({page, offset, onOffset, label}: {page: {total: number; limit: number}; offset: number; onOffset: (value: number) => void; label: string}) {
  if (page.total <= page.limit) return null
  return <div className="kw-pagination" aria-label={`Страницы ${label}`}><button className="kb-button" disabled={!offset} onClick={() => onOffset(Math.max(0, offset - page.limit))}>Назад</button><span>{offset + 1}–{Math.min(offset + page.limit, page.total)} / {page.total}</span><button className="kb-button" disabled={offset + page.limit >= page.total} onClick={() => onOffset(offset + page.limit)}>Далее</button></div>
}
