import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Download, Ellipsis, PanelRight, Sparkles, Upload } from 'lucide-react'
import {
  ResizableDocumentLayout,
  type DocumentLayoutHandle,
} from '../../components/document-viewer/ResizableDocumentLayout'
import { loadLocalSource, safeFilename } from '../../components/document-viewer/source'
import { errorText, knowledgeApi } from './api'
import { KnowledgeFilePanel } from './KnowledgeFilePanel'
import { KnowledgeDocumentPanel } from './KnowledgeDocumentPanel'
import { useKnowledgeDocument } from './hooks/useKnowledgeDocument'
import { knowledgeHash, type ViewerTarget } from './routing'
import { statusLabels, type KnowledgeCitation, type KnowledgeDocument } from './types'
export type KnowledgeAsk = (citation: KnowledgeCitation, scope?: 'document' | 'section') => void
interface Props {
  active: boolean
  target: ViewerTarget
  revision: number
  catalogReset: number
  admin: boolean
  onNavigate: (target: ViewerTarget, replace?: boolean) => void
  onAsk: KnowledgeAsk
  onUpload: (document: KnowledgeDocument | 'new') => void
  onReload: () => void
}
export function KnowledgeWorkspace({
  active,
  target,
  revision,
  catalogReset,
  admin,
  onNavigate,
  onAsk,
  onUpload,
  onReload,
}: Props) {
  const { data, loading, error } = useKnowledgeDocument(target, revision)
  const layout = useRef<DocumentLayoutHandle>(null)
  const [filesVisible, setFilesVisible] = useState(true),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const current = useRef(data)
  current.current = data
  const actions = useRef(new AbortController())
  const downloads = useRef(new Map<number, string>())
  useEffect(() => {
    actions.current.abort()
    actions.current = new AbortController()
    setNotice('')
    return () => actions.current.abort()
  }, [data?.version.id])
  useEffect(
    () => () => {
      downloads.current.forEach((url, timer) => {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
      })
    },
    [],
  )
  const selectDefault = useCallback(
    (document: KnowledgeDocument) => {
      if (active && !target.documentId && !target.sectionId)
        onNavigate({ documentId: document.id, versionId: document.latestVersion.id }, true)
    },
    [active, target.documentId, target.sectionId, onNavigate],
  )
  const visibility = useCallback((_id: string, visible: boolean) => setFilesVisible(visible), [])
  function section(id: string) {
    onNavigate({ sectionId: id, tab: 'view' })
  }
  async function ask(id?: string, scope: 'document' | 'section' = 'section') {
    if (!data) return
    const version = data.version.id,
      signal = actions.current.signal
    const sectionId = id || data.items[0]?.id
    if (!sectionId) return
    try {
      const source = data.section?.id === sectionId ? data.section : await knowledgeApi.section(sectionId, signal)
      if (!signal.aborted && current.current?.version.id === version) onAsk(source.source, scope)
    } catch (cause) {
      if (!signal.aborted) setNotice(errorText(cause))
    }
  }
  async function download() {
    if (!data) return
    const version = data.version,
      signal = actions.current.signal
    setBusy(true)
    setNotice('')
    try {
      const blob = await loadLocalSource(version.originalUrl, signal)
      signal.throwIfAborted()
      const url = URL.createObjectURL(blob),
        link = document.createElement('a')
      link.href = url
      link.download = safeFilename(version.filename, version.fileType === 'pdf' ? 'pdf' : 'docx')
      document.body.append(link)
      link.click()
      link.remove()
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(url)
        downloads.current.delete(timer)
      }, 1000)
      downloads.current.set(timer, url)
    } catch (cause) {
      if (!signal.aborted) setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  async function copy() {
    if (!data) return
    const hash = knowledgeHash(
      data.section ? { sectionId: data.section.id } : { documentId: data.document.id, versionId: data.version.id },
    )
    try {
      await navigator.clipboard.writeText(new URL(hash, window.location.href).href)
      setNotice('Постоянная ссылка скопирована.')
    } catch {
      setNotice('Не удалось скопировать ссылку. Её можно взять из адресной строки.')
    }
  }
  async function reindex() {
    if (!data) return
    setBusy(true)
    try {
      await knowledgeApi.reindex(data.version.id)
      onReload()
      setNotice('Поисковый индекс обновлён. Пункты и постоянные ссылки сохранены.')
    } catch (cause) {
      setNotice(errorText(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="kw-workspace">
      <header className="kw-workspace-header">
        <div className="kw-current-title">
          <span>
            База знаний <span aria-hidden="true">/</span>{' '}
            {data && !loading ? data.version.fileType.toUpperCase() : 'Источники'}
          </span>
          <h1 title={data?.document.title}>
            {loading ? 'Загрузка документа…' : data?.document.title || 'База знаний'}
          </h1>
          {data && !loading && (
            <div className="kw-current-meta">
              <span className={'kb-status ' + data.version.status}>{statusLabels[data.version.status]}</span>
              <span>
                {data.document.materialNature === 'synthetic' ? 'Учебный материал кейса' : 'Корпоративный источник'}
              </span>
            </div>
          )}
        </div>
        <div className="kw-header-actions">
          <button
            className="kb-icon"
            title="Скачать оригинал"
            aria-label="Скачать оригинал источника"
            disabled={!data || loading || busy}
            onClick={() => void download()}
          >
            <Download size={18} />
          </button>
          <details className="kw-action-menu">
            <summary aria-label="Действия с источником">
              <Ellipsis size={20} />
            </summary>
            <div
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('button'))
                  event.currentTarget.parentElement?.removeAttribute('open')
              }}
            >
              <button
                className="kb-button"
                disabled={!data || loading || !data.items.length}
                onClick={() => void ask(undefined, 'document')}
              >
                <Sparkles size={15} /> Спросить ИИ об этом документе
              </button>
              <button className="kb-button" disabled={!data || loading} onClick={() => void copy()}>
                <Copy size={15} /> Скопировать ссылку
              </button>
              {admin && (
                <button
                  className="kb-button"
                  disabled={!data || loading}
                  onClick={() => data && onUpload(data.document)}
                >
                  <Upload size={15} /> Новая редакция
                </button>
              )}
            </div>
          </details>
          <button
            className="kb-button kw-file-toggle"
            aria-label="Список документов"
            aria-expanded={filesVisible}
            onClick={() => layout.current?.togglePanel('knowledge-files')}
          >
            <PanelRight size={17} /> Документы
          </button>
        </div>
      </header>
      {notice && (
        <div className="kw-notice" role="status">
          {notice}
          <button className="kb-icon" aria-label="Закрыть сообщение" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      <ResizableDocumentLayout
        ref={layout}
        className="kw-resizable"
        storageKey="regula.knowledge.panel-width"
        mobilePresentation="drawer"
        mobileBreakpoint={1100}
        onPanelVisibility={visibility}
        after={{
          id: 'knowledge-files',
          label: 'Документы',
          defaultSize: '288px',
          minSize: '260px',
          maxSize: '420px',
          content: (
            <KnowledgeFilePanel
              selectedId={data?.document.id}
              revision={revision}
              resetKey={catalogReset}
              admin={admin}
              onUpload={() => onUpload('new')}
              onSelect={onNavigate}
              onDefault={selectDefault}
              onClose={() => layout.current?.closePanel('knowledge-files')}
            />
          ),
        }}
      >
        <KnowledgeDocumentPanel
          data={data}
          loading={loading}
          error={error}
          tab={target.tab || 'view'}
          admin={admin}
          busy={busy}
          onTab={(tab) => onNavigate({ ...target, tab }, true)}
          onSection={section}
          onAsk={(id) => void ask(id)}
          onVersion={(id) => data && onNavigate({ documentId: data.document.id, versionId: id, tab: target.tab })}
          onCopy={() => void copy()}
          onUpload={onUpload}
          onRetry={onReload}
          onReindex={() => void reindex()}
        />
      </ResizableDocumentLayout>
    </div>
  )
}
