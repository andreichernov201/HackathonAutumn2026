import { lazy, Suspense, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, FileText, RefreshCw, Sparkles, Upload } from 'lucide-react'
import { errorText, knowledgeApi } from './api'
import { statusLabels, type KnowledgeCitation, type KnowledgeDocument, type KnowledgeSection, type KnowledgeVersion, type SectionSummary } from './types'

export type ViewerTarget = {documentId?: string; sectionId?: string; versionId?: string}
const PdfOriginal = lazy(() => import('./PdfOriginal'))
export function Highlight({text, query}: {text: string; query: string}) {
  const tokens = query.match(/[\p{L}\p{N}.]+/gu)?.filter(value => value.length > 1).slice(0, 30) || []
  if (!tokens.length) return <>{text}</>
  const pattern = new RegExp('(' + tokens.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi')
  return <>{text.split(pattern).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part)}</>
}

function SectionTree({items, parent, selected, onSelect, query}: {items: SectionSummary[]; parent: string | null; selected?: string; onSelect: (id: string) => void; query: string}) {
  return <ul>{items.filter(item => item.parentId === parent).map(item => {
    const children = items.some(child => child.parentId === item.id)
    const button = <button className={selected === item.id ? 'selected' : ''} onClick={() => onSelect(item.id)} title={item.heading}><Highlight text={item.heading} query={query}/></button>
    return <li key={item.id}>{children ? <details open><summary>{button}</summary><SectionTree items={items} parent={item.id} selected={selected} onSelect={onSelect} query={query}/></details> : button}</li>
  })}</ul>
}

export function KnowledgeViewer({target, query, admin, onBack, onAsk, onVersionUpload}: {target: ViewerTarget; query: string; admin: boolean; onBack: () => void; onAsk: (citation: KnowledgeCitation) => void; onVersionUpload: (document: KnowledgeDocument) => void}) {
  const [document, setDocument] = useState<KnowledgeDocument>()
  const [versions, setVersions] = useState<KnowledgeVersion[]>([])
  const [versionId, setVersionId] = useState('')
  const [items, setItems] = useState<SectionSummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [section, setSection] = useState<KnowledgeSection>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sectionLoading, setSectionLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [indexBusy, setIndexBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState<'text' | 'pdf'>('text')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setView('text'); setDocument(undefined); setVersions([]); setSection(undefined); setItems([]); setSelectedId(''); setVersionId('')
    async function load() {
      const initial = target.sectionId ? await knowledgeApi.section(target.sectionId) : undefined
      const doc = await knowledgeApi.get(initial?.source.documentId || target.documentId || '')
      const editions = await knowledgeApi.versions(doc.id)
      const selectedVersion = initial?.documentVersionId || target.versionId || doc.latestVersion.id
      if (!cancelled) {setDocument(doc); setVersions(editions); setVersionId(selectedVersion); setSelectedId(initial?.id || '')}
    }
    load().catch(error => {if (!cancelled) setError(errorText(error))}).finally(() => {if (!cancelled) setLoading(false)})
    return () => {cancelled = true}
  }, [target.documentId, target.sectionId, target.versionId, retry])

  useEffect(() => {
    if (!versionId) return
    let cancelled = false
    setItems([]); setSection(undefined); setSectionLoading(true)
    knowledgeApi.sections(versionId).then(rows => {
      if (!cancelled) {setItems(rows); setSelectedId(current => rows.some(row => row.id === current) ? current : rows[0]?.id || ''); if (!rows.length) setSectionLoading(false)}
    }).catch(error => {if (!cancelled) {setError(errorText(error)); setSectionLoading(false)}})
    return () => {cancelled = true}
  }, [versionId, retry])

  useEffect(() => {
    if (!selectedId || !items.some(item => item.id === selectedId)) return
    let cancelled = false
    setSection(undefined); setSectionLoading(true); setCopied(false)
    knowledgeApi.section(selectedId).then(value => {
      if (!cancelled) {setSection(value); history.replaceState(null, '', value.source.sourceReference)}
    }).catch(error => {if (!cancelled) setError(errorText(error))}).finally(() => {if (!cancelled) setSectionLoading(false)})
    return () => {cancelled = true}
  }, [selectedId, items])

  const version = versions.find(item => item.id === versionId)
  const position = items.findIndex(item => item.id === selectedId)
  async function copyLink() {
    if (!section) return
    try {await navigator.clipboard.writeText(new URL(section.source.sourceReference, location.origin).href); setCopied(true)}
    catch {setNotice('Браузер не разрешил копирование. Ссылку можно скопировать из адресной строки.')}
  }
  async function reindex() {
    setIndexBusy(true); setNotice('')
    try {const result = await knowledgeApi.reindex(versionId); setVersions(previous => previous.map(item => item.id === result.id ? result : item)); setNotice('Поисковый индекс обновлён. Ссылки и текст пунктов сохранены.')}
    catch (error) {setNotice(errorText(error))}
    finally {setIndexBusy(false)}
  }

  return <div className="kb-viewer">
    <div className="kb-viewer-bar"><button className="kb-button" onClick={onBack}><ArrowLeft size={16}/> К результатам</button><span className="kb-muted">Оригинальный текст источника</span>{admin && document && <button className="kb-button" onClick={() => onVersionUpload(document)}><Upload size={15}/> Новая редакция</button>}</div>
    {error && <div className="kb-error" role="alert">{error} <button onClick={() => setRetry(value => value+1)}>Повторить</button></div>}
    {loading ? <p className="kb-loading" role="status">Загрузка документа…</p> : document && <>
      <div className="kb-document-heading"><span className="kb-eyebrow">{document.materialNature === 'synthetic' ? 'СИНТЕТИЧЕСКИЙ УЧЕБНЫЙ МАТЕРИАЛ' : 'КОРПОРАТИВНЫЙ ДОКУМЕНТ'}</span><h1>{document.title}</h1><div className="kb-version-controls"><label>Редакция <select aria-label="Редакция документа" value={versionId} onChange={event => {setSelectedId(''); setVersionId(event.target.value); setError('')}}>{versions.map(item => <option value={item.id} key={item.id}>{item.versionLabel || 'Без обозначения'} · {item.checksum.slice(0, 8)} · {statusLabels[item.status]}</option>)}</select></label><span className="kb-badge">{version?.fileType.toUpperCase()}{version?.pageCount ? ` · ${version.pageCount} стр.` : ''}</span></div></div>
      {version?.fileType === 'pdf' && <div className="kb-view-modes" aria-label="Режим просмотра документа"><button className="kb-button" aria-pressed={view === 'text'} onClick={() => setView('text')}>Текст по пунктам</button><button className="kb-button" aria-pressed={view === 'pdf'} onClick={() => setView('pdf')}>PDF оригинал</button></div>}
      {view === 'pdf' && version?.fileType === 'pdf' ? <Suspense fallback={<p className="kb-loading" role="status">Загрузка просмотрщика PDF…</p>}><PdfOriginal key={version.id} url={version.originalUrl} initialPage={section?.pageStart || 1}/></Suspense> : <div className="kb-reader-grid">
        <nav className="kb-toc" aria-label="Содержание документа"><h2>Содержание <span>{items.length}</span></h2><SectionTree items={items} parent={null} selected={selectedId} onSelect={id => {setSelectedId(id); setError('')}} query={query}/></nav>
        <article className="kb-source-text" aria-busy={sectionLoading}>
          {sectionLoading ? <p className="kb-muted">Загрузка пункта…</p> : section ? <>
            <div className="kb-source-topline"><span><FileText size={15}/> {section.source.locator}</span>{section.pageStart && (version?.fileType === 'pdf' ? <button className="kb-button" onClick={() => setView('pdf')}>Стр. {section.pageStart}{section.pageEnd !== section.pageStart ? `–${section.pageEnd}` : ''}</button> : <a href={section.source.originalUrl} target="_blank" rel="noreferrer">Стр. {section.pageStart}{section.pageEnd !== section.pageStart ? `–${section.pageEnd}` : ''}</a>)}</div>
            <h2>{section.heading.length > 160 && section.sectionNumber ? `Пункт ${section.sectionNumber}` : section.heading}</h2>
            {section.locatorConfidence === 'fragment' && <p className="kb-note">Точный номер положения не определён. Используется постоянная ссылка на извлечённый фрагмент.</p>}
            {section.table ? <div className="kb-table-scroll"><table><thead><tr>{section.table[0]?.map((cell, index) => <th key={index}><Highlight text={cell} query={query}/></th>)}</tr></thead><tbody>{section.table.slice(1).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}><Highlight text={cell} query={query}/></td>)}</tr>)}</tbody></table><details><summary>Извлечённый текст для проверки цитаты</summary><pre><Highlight text={section.text} query={query}/></pre></details></div> : <pre><Highlight text={section.text} query={query}/></pre>}
            <div className="kb-section-nav"><button className="kb-button" disabled={position <= 0} onClick={() => setSelectedId(items[position-1].id)}><ArrowLeft size={15}/> Предыдущий</button><button className="kb-button" disabled={position < 0 || position >= items.length-1} onClick={() => setSelectedId(items[position+1].id)}>Следующий <ArrowRight size={15}/></button></div>
          </> : <p className="kb-muted">Выберите пункт в содержании.</p>}
        </article>
        {section && version && <aside className="kb-source-info"><span className="kb-eyebrow">ПРОВЕРЯЕМЫЙ ИСТОЧНИК</span><h2>Сведения о пункте</h2><dl>
          <dt>Точное положение</dt><dd>{section.source.locator}</dd><dt>Редакция</dt><dd>{version.versionLabel || 'Не установлена'}</dd><dt>Статус редакции</dt><dd><span className={'kb-status ' + version.status}>{statusLabels[version.status]}</span></dd>
          {version.statusEvidence && <><dt>Основание статуса</dt><dd>{version.statusEvidence}</dd></>}
          <dt>Начало действия</dt><dd>{version.effectiveFrom || 'Не установлено'}</dd>{version.effectiveUntil && <><dt>Окончание действия</dt><dd>{version.effectiveUntil}</dd></>}
          <dt>Идентификатор пункта</dt><dd className="kb-code">{section.id}</dd><dt>Идентификатор редакции</dt><dd className="kb-code">{version.id}</dd><dt>SHA-256 оригинала</dt><dd className="kb-code">{version.checksum}</dd>
        </dl><a className="kb-button" href={section.source.originalUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Открыть оригинал</a><button className="kb-button" onClick={() => void copyLink()}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}</button><button className="kb-button primary" onClick={() => onAsk(section.source)}><Sparkles size={15}/> Спросить AI об этом пункте</button>
          {admin && <button className="kb-button" disabled={indexBusy} onClick={() => void reindex()}><RefreshCw size={15}/>{indexBusy ? 'Обновление…' : 'Переиндексировать'}</button>}
          {notice && <p className="kb-note" role="status">{notice}</p>}
          <details className="kb-extraction"><summary>Извлечение и проверка</summary><p>Проиндексировано: {version.indexedAt ? new Date(version.indexedAt).toLocaleString('ru-RU') : 'Не установлено'}</p>{version.extractionWarnings.map((warning, i) => <p key={i}>{warning}</p>)}</details>
        </aside>}
      </div>}
    </>}
  </div>
}
