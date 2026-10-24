import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BookOpenText, FileText, FolderOpen, LockKeyhole, Search, SlidersHorizontal, Upload, X } from 'lucide-react'
import { errorText, knowledgeApi, type Filters } from './api'
import { Highlight, KnowledgeViewer, type ViewerTarget } from './KnowledgeViewer'
import { UploadDialog } from './UploadDialog'
import { categories, statusLabels, type KnowledgeCitation, type KnowledgeDocument, type KnowledgeSession, type Page, type SearchHit } from './types'

const initialFilters: Filters = {category: '', status: '', fileType: '', sort: 'updatedAt'}
const dateLabel = (value: string) => new Date(value).toLocaleDateString('ru-RU')

function hashTarget(): ViewerTarget | undefined {
  const match = location.hash.match(/^#knowledge\/(sections|documents)\/([\w-]+)$/)
  return match ? match[1] === 'sections' ? {sectionId: match[2]} : {documentId: match[2]} : undefined
}

export function KnowledgePage({onAsk}: {onAsk: (source: KnowledgeCitation) => void}) {
  const [identity, setIdentity] = useState<KnowledgeSession>()
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [offset, setOffset] = useState(0)
  const [catalog, setCatalog] = useState<Page<KnowledgeDocument>>()
  const [results, setResults] = useState<Page<SearchHit> & {message: string | null}>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [target, setTarget] = useState<ViewerTarget | undefined>(hashTarget)
  const [upload, setUpload] = useState<KnowledgeDocument | 'new'>()
  const [loginOpen, setLoginOpen] = useState(false)
  const [token, setToken] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const loginDialog = useRef<HTMLDialogElement>(null)
  const isAdmin = identity?.role === 'knowledge_admin'
  const total = query ? results?.total || 0 : catalog?.total || 0

  useEffect(() => {
    const onHash = () => {if (location.hash.startsWith('#knowledge')) setTarget(hashTarget())}
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {const timer = setTimeout(() => {setQuery(draft.trim()); setOffset(0)}, 300); return () => clearTimeout(timer)}, [draft])
  useEffect(() => {
    let cancelled = false
    knowledgeApi.session().then(value => {if (!cancelled) setIdentity(value)}).catch(error => {if (!cancelled) setError(errorText(error))})
    return () => {cancelled = true}
  }, [reload])
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setCatalog(undefined); setResults(undefined)
    const request = query ? knowledgeApi.search(query, filters, offset).then(value => {if (!cancelled) setResults(value)}) : knowledgeApi.list(filters, offset).then(value => {if (!cancelled) setCatalog(value)})
    request.catch(error => {if (!cancelled) setError(errorText(error))}).finally(() => {if (!cancelled) setLoading(false)})
    return () => {cancelled = true}
  }, [query, filters, offset, reload])
  useEffect(() => {if (loginOpen) loginDialog.current?.showModal()}, [loginOpen])

  function changeFilters(next: Partial<Filters>) {setFilters(previous => ({...previous, ...next})); setOffset(0)}
  function open(next: ViewerTarget) {
    setTarget(next)
    history.pushState(null, '', next.sectionId ? `#knowledge/sections/${next.sectionId}` : `#knowledge/documents/${next.documentId}`)
  }
  function back() {setTarget(undefined); history.pushState(null, '', '#knowledge')}
  async function login() {
    setLoginBusy(true); setLoginError('')
    try {await knowledgeApi.login(token); setIdentity(await knowledgeApi.session()); setToken(''); setLoginOpen(false); setReload(value => value+1)}
    catch (error) {setLoginError(errorText(error))}
    finally {setLoginBusy(false)}
  }
  async function logout() {
    try {await knowledgeApi.logout(); setIdentity(await knowledgeApi.session()); back(); setReload(value => value+1)}
    catch (error) {setError(errorText(error))}
  }
  function uploaded(document: KnowledgeDocument) {
    setUpload(undefined); setReload(value => value+1)
    // Explicitly select the new edition, even when the viewer already shows this document.
    setTarget({documentId: document.id, versionId: document.latestVersion.id})
    history.pushState(null, '', `#knowledge/documents/${document.id}`)
  }

  return <section className="kb-page">
    {target ? <KnowledgeViewer target={target} query={query} admin={isAdmin} onBack={back} onAsk={onAsk} onVersionUpload={setUpload}/> : <>
      <div className="kb-page-heading"><div><span className="kb-eyebrow">ЕДИНЫЙ ИСТОЧНИК ЗНАНИЙ</span><h1>База знаний</h1><p>Корпоративные инструкции, регламенты и нормативные требования</p></div><button className="kb-button primary" onClick={() => {if (isAdmin) setUpload('new'); else {setLoginError(''); setLoginOpen(true)}}}><Upload size={17}/> Загрузить документ</button></div>
      <div className="kb-notice"><BookOpenText size={19}/><p><strong>Проверяемые источники для вас и AI.</strong> Учебные материалы кейса — синтетические документы, а не действующие нормативные акты Банка России.</p></div>
      <div className="kb-search"><Search size={22}/><input aria-label="Поиск по базе знаний" placeholder="Найти документ, пункт инструкции или нормативное требование..." value={draft} maxLength={500} onChange={event => setDraft(event.target.value)}/>{draft && <button className="icon-button" aria-label="Очистить поиск" onClick={() => setDraft('')}><X size={17}/></button>}<kbd>FTS</kbd></div>
      <p className="kb-search-tip">Поиск по названиям, тексту и номерам пунктов. Для точной фразы используйте «двойные кавычки»: <button onClick={() => setDraft('"регистрационный номер"')}>"регистрационный номер"</button></p>
      <div className="kb-category-tabs" aria-label="Категории документов">{[['', 'Все документы'], ...Object.entries(categories)].map(([key, label]) => <button className={filters.category === key ? 'active' : ''} aria-pressed={filters.category === key} key={key} onClick={() => changeFilters({category: key})}>{label}</button>)}</div>
      <div className="kb-filters"><SlidersHorizontal size={16}/><label><span className="visually-hidden">Статус редакции</span><select value={filters.status} onChange={event => changeFilters({status: event.target.value})}><option value="">Все статусы редакций</option><option value="active">Подтверждённые на сегодня</option><option value="unverified">Статус не подтверждён</option><option value="archived">Архивные</option></select></label><label><span className="visually-hidden">Тип файла</span><select value={filters.fileType} onChange={event => changeFilters({fileType: event.target.value})}><option value="">Все форматы</option><option value="pdf">PDF</option><option value="docx">DOCX</option><option value="txt">TXT</option></select></label><label className="kb-sort"><span className="visually-hidden">Сортировка</span><select disabled={Boolean(query)} value={filters.sort} onChange={event => changeFilters({sort: event.target.value})}><option value="updatedAt">По дате обновления</option><option value="createdAt">По дате добавления</option><option value="title">По названию</option></select></label></div>
      <div className="kb-catalog-heading"><h2>{query ? 'Результаты поиска' : 'Каталог документов'} {!loading && <span>{total}</span>}</h2><span className="kb-muted">{query ? 'По релевантности FTS5 · все найденные редакции' : 'Последняя загруженная редакция не означает действующую'}</span></div>
      {error && <div className="kb-error" role="alert">{error} <button onClick={() => setReload(value => value+1)}>Повторить</button></div>}
      {loading ? <div className="kb-loading" role="status">Поиск в локальной базе…</div> : !error && (total ? query ? <div className="kb-results">{results?.items.map(hit => <article className="kb-result" key={hit.section.id}><div className="kb-result-heading"><span className="kb-file-icon"><FileText size={21}/></span><div><button className="kb-title-link" onClick={() => open({sectionId: hit.section.id})}><Highlight text={hit.citation.title} query={query}/></button><p>{hit.citation.locator} · Редакция: {hit.citation.versionLabel || 'не установлена'} · <span className={'kb-status ' + hit.citation.status}>{statusLabels[hit.citation.status]}</span></p></div><ArrowRight size={18}/></div><p className="kb-snippet"><Highlight text={hit.snippet} query={query}/></p><div className="kb-result-footer"><span>Совпадение в тексте, заголовке или номере пункта · FTS5</span><a href={hit.citation.originalUrl} target="_blank" rel="noreferrer">Оригинал ↗</a></div></article>)}</div> : <div className="kb-catalog">{catalog?.items.map(document => {
        const version = document.latestVersion
        return <article className="kb-document-row" key={document.id}><span className={'kb-file-icon ' + document.category}><FileText size={23}/></span><div className="kb-row-main"><button className="kb-title-link" onClick={() => open({documentId: document.id, versionId: version.id})}>{document.title}</button><p>{document.description || categories[document.category]}</p><div className="kb-row-meta"><span>{categories[document.category]}</span><span>{version.fileType.toUpperCase()}{version.pageCount ? ` · ${version.pageCount} стр.` : ''}</span><span>Редакция: {version.versionLabel || 'не установлена'}</span><span className="kb-mobile-status">Статус: {statusLabels[version.status]}</span>{version.effectiveFrom && <span>С {version.effectiveFrom}</span>}<span>{document.materialNature === 'synthetic' ? 'Учебный материал' : 'Корпоративный'}</span>{document.accessLevel === 'restricted' && <span><LockKeyhole size={12}/> Ограниченный доступ</span>}</div><small className="kb-document-id">ID: {document.id}</small></div><div className="kb-row-status"><span className={'kb-status ' + version.status}>{statusLabels[version.status]}</span><span className="kb-indexed">Проиндексирован</span><small>Обновлён {dateLabel(document.updatedAt)}</small></div><button className="kb-open" aria-label={`Открыть ${document.title}`} onClick={() => open({documentId: document.id, versionId: version.id})}><ArrowRight size={18}/></button></article>
      })}</div> : <div className="kb-empty"><span className="kb-empty-icon"><FolderOpen size={32}/></span><h2>{query || filters.category || filters.status || filters.fileType ? 'Подходящих источников нет' : 'Здесь начинается база знаний'}</h2><p>{query ? results?.message || 'Нет подтверждённого основания в доступных материалах.' : 'Загрузите исходные PDF, DOCX или TXT. Система сохранит оригиналы, выделит пункты и создаст поисковый индекс.'}</p>{query || filters.category || filters.status || filters.fileType ? <button className="kb-button" onClick={() => {setDraft(''); setFilters(initialFilters); setOffset(0)}}>Сбросить поиск и фильтры</button> : <p className="kb-muted">Основные инструкции, рекомендации и матрица пока не импортированы. Шаблоны DOCX доступны отдельно в разделе «Документы».</p>}</div>)}
      {!loading && total > 20 && <div className="kb-pagination"><button className="kb-button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value-20))}>Назад</button><span>{offset+1}–{Math.min(offset+20, total)} из {total}</span><button className="kb-button" disabled={offset+20 >= total} onClick={() => setOffset(value => value+20)}>Далее</button></div>}
    </>}
    <footer className="kb-footer"><span><LockKeyhole size={13}/> Локальная обработка · Демо-доступ {isAdmin ? 'администратора базы' : 'читателя'} · Корпоративная авторизация не подключена</span>{isAdmin ? <button onClick={() => void logout()}>Завершить администрирование</button> : <button onClick={() => {setLoginError(''); setLoginOpen(true)}}>Управление базой</button>}</footer>
    {upload && <UploadDialog document={upload === 'new' ? undefined : upload} onClose={() => setUpload(undefined)} onDone={uploaded}/>}
    {loginOpen && <dialog ref={loginDialog} className="kb-dialog kb-login" onClose={() => {setLoginOpen(false); setToken('')}}><form onSubmit={event => {event.preventDefault(); void login()}}><div className="kb-dialog-head"><h2>Управление базой знаний</h2><button type="button" className="icon-button" aria-label="Закрыть" onClick={() => {setLoginOpen(false); setToken('')}}><X size={20}/></button></div><p className="kb-muted">Локальный режим обслуживания. Корпоративная авторизация не подключена. Ключ задаёт оператор сервера.</p>{identity?.adminConfigured ? <><label>Ключ администратора<input type="password" autoComplete="current-password" value={token} onChange={event => setToken(event.target.value)} required maxLength={1024}/></label><button className="kb-button primary" disabled={loginBusy}>{loginBusy ? 'Проверка…' : 'Войти'}</button></> : <p className="kb-note">Вход администратора отключён. Для загрузки оператор должен задать REGULA_KNOWLEDGE_ADMIN_TOKEN на сервере (не менее 32 символов).</p>}{loginError && <p className="kb-error" role="alert">{loginError}</p>}</form></dialog>}
  </section>
}
