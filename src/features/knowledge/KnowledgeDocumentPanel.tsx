import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BookOpenText } from 'lucide-react'
import type { KnowledgeDocumentData } from './hooks/useKnowledgeDocument'
import type { KnowledgeTab } from './routing'
import type { KnowledgeDocument } from './types'
import { KnowledgeTableOfContents } from './KnowledgeTableOfContents'
import { KnowledgeDocumentInfo } from './KnowledgeDocumentInfo'
import { KnowledgeSectionExcerpt } from './KnowledgeSectionExcerpt'
import { KnowledgeTextOriginal } from './KnowledgeTextOriginal'
const DocumentViewer = lazy(() => import('../../components/document-viewer/DocumentViewer').then(module => ({default: module.DocumentViewer})))
const tabs = [{id: 'view', label: 'Просмотр'}, {id: 'contents', label: 'Содержание'}, {id: 'info', label: 'Сведения'}] as const
interface Props {
  data?: KnowledgeDocumentData; loading: boolean; error?: string; tab: KnowledgeTab; admin: boolean; busy: boolean
  onTab: (tab: KnowledgeTab) => void; onSection: (id: string) => void; onAsk: (id: string) => void
  onVersion: (id: string) => void; onCopy: () => void; onUpload: (document: KnowledgeDocument) => void
  onRetry: () => void; onReindex: () => void
}
export function KnowledgeDocumentPanel({data, loading, error, tab, admin, busy, onTab, onSection, onAsk, onVersion, onCopy, onUpload, onRetry, onReindex}: Props) {
  const [originalError, setOriginalError] = useState('')
  useEffect(() => setOriginalError(''), [data?.version.id])
  const location = useMemo(() => data?.section ? {page: data.section.pageStart || undefined, quote: data.section.text, sectionId: data.version.fileType === 'docx' ? undefined : data.section.id} : undefined, [data?.section, data?.version.fileType])
  return <section className="kw-document-panel" aria-label="Источник базы знаний" aria-busy={loading}>
    <div className="kw-tabs" role="tablist" aria-label="Режим документа">{tabs.map(item => <button key={item.id} id={`knowledge-tab-${item.id}`} role="tab" aria-controls={`knowledge-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => onTab(item.id)} onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); const next = tabs[(tabs.findIndex(value => value.id === item.id) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]; onTab(next.id); document.getElementById(`knowledge-tab-${next.id}`)?.focus()}
    }}>{item.label}</button>)}</div>
    {loading && <p className="kw-state" role="status">Загрузка источника…</p>}
    {error && <div className="kb-error" role="alert">{error}<button className="kb-button" onClick={onRetry}>Повторить</button></div>}
    {!data && !loading && !error && <div className="kw-no-document"><BookOpenText size={36}/><h2>Источники под рукой</h2><p>Выберите документ в списке справа. Здесь появятся оригинал, содержание и сведения о редакции.</p></div>}
    {data && <div className="kw-document-content" hidden={loading}>
      <div id="knowledge-panel-view" role="tabpanel" aria-labelledby="knowledge-tab-view" hidden={tab !== 'view'} className="kw-original-tab">
        <div className="kw-original">
          {data.version.fileType === 'txt' ? <KnowledgeTextOriginal key={data.version.id} url={data.version.originalUrl} onError={setOriginalError}/> : <Suspense fallback={<p className="kw-state" role="status">Загрузка просмотрщика…</p>}><DocumentViewer key={data.version.id} source={data.version.originalUrl} filename={data.version.filename} documentId={data.version.id} format={data.version.fileType} mode="knowledge" initialLocation={location} tools={{download: false}} onError={setOriginalError} onReady={() => setOriginalError('')}/></Suspense>}
        </div>
        {originalError && <p className="kw-original-fallback">Оригинал не удалось отобразить. <button className="kb-button" onClick={() => onTab('contents')}>Открыть содержание и извлечённый текст</button></p>}
        {data.section && <KnowledgeSectionExcerpt section={data.section} onAsk={() => onAsk(data.section!.id)} onCopy={onCopy}/>}
      </div>
      <div id="knowledge-panel-contents" role="tabpanel" aria-labelledby="knowledge-tab-contents" hidden={tab !== 'contents'} className="kw-scroll-tab"><KnowledgeTableOfContents key={data.version.id} items={data.items} selectedId={data.section?.id} onSelect={onSection} onAsk={onAsk}/></div>
      <div id="knowledge-panel-info" role="tabpanel" aria-labelledby="knowledge-tab-info" hidden={tab !== 'info'} className="kw-scroll-tab"><KnowledgeDocumentInfo document={data.document} version={data.version} versions={data.versions} admin={admin} onVersion={onVersion} onCopy={onCopy} onUpload={() => onUpload(data.document)} onReindex={onReindex} busy={busy}/></div>
    </div>}
  </section>
}
