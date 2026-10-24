import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useDocumentSource } from './hooks/useDocumentSource'
import { useDocumentNavigation } from './hooks/useDocumentNavigation'
import { ViewerToolbar } from './ViewerToolbar'
import { ViewerLoading } from './ViewerLoading'
import { ViewerError } from './ViewerError'
import type { DocumentViewerProps, SearchState, ViewerEngine } from './types'
import './document-viewer.css'

const PdfViewer = lazy(() => import('./PdfViewer'))
const DocxViewer = lazy(() => import('./DocxViewer'))
const emptySearch = {current: 0, total: 0, busy: false, searched: false}
export function DocumentViewer(props: DocumentViewerProps) {
  const {source, documentId, initialLocation, onReady, onError, onLocationChange} = props
  const [retry, setRetry] = useState(0), [renderError, setRenderError] = useState('')
  const state = useDocumentSource(props, retry)
  const [ready, setReady] = useState(false), [count, setCount] = useState(0), [page, setPage] = useState(1)
  const [zoom, setZoom] = useState<number | 'width'>('width'), [scale, setScale] = useState(1)
  const [search, setSearch] = useState<SearchState>(emptySearch)
  const [expanded, setExpanded] = useState(false)
  const root = useRef<HTMLDivElement>(null), scroll = useRef<HTMLDivElement>(null)
  const engine = useRef<ViewerEngine | null>(null)
  const savedTop = useRef(0), isReady = useRef(false)
  const identity = documentId ?? source
  const previousIdentity = useRef(identity)
  const callbacks = useRef({onReady, onError, onLocationChange})
  callbacks.current = {onReady, onError, onLocationChange}
  const {notice, navigate, clear} = useDocumentNavigation(props.ref, engine, ready)
  const format = state.value?.format || props.format || 'pdf'
  useEffect(() => {
    setReady(false); isReady.current = false; setCount(0); setPage(1); setSearch(emptySearch); setRenderError(''); clear()
    if (previousIdentity.current !== identity) {savedTop.current = 0; setZoom('width'); previousIdentity.current = identity}
  }, [source, identity, retry, clear])
  const handleReady = useCallback((pages: number) => {
    setCount(pages); setReady(true); isReady.current = true
  }, [])
  const handleError = useCallback((message: string) => {setRenderError(message); setReady(false); isReady.current = false; callbacks.current.onError?.(message)}, [])
  const handlePage = useCallback((value: number) => {setPage(value); callbacks.current.onLocationChange?.({page: value})}, [])
  useEffect(() => {if (state.error) callbacks.current.onError?.(state.error)}, [state.error])
  const appliedLocation = useRef<{identity: typeof identity; location: typeof initialLocation} | undefined>(undefined)
  const notifiedSource = useRef<typeof state.value>(undefined)
  useEffect(() => {
    if (!ready || !state.value) return
    let cancelled = false
    const value = state.value, restoreTop = savedTop.current
    const frame = requestAnimationFrame(() => {
      async function restore() {
        if (initialLocation && (appliedLocation.current?.identity !== identity || appliedLocation.current.location !== initialLocation)) {
          appliedLocation.current = {identity, location: initialLocation}
          await navigate(initialLocation)
        } else if (scroll.current) scroll.current.scrollTop = restoreTop
        if (!cancelled && notifiedSource.current !== value) {
          notifiedSource.current = value
          callbacks.current.onReady?.({format, pages: count})
        }
      }
      void restore()
    })
    return () => {cancelled = true; cancelAnimationFrame(frame)}
  }, [ready, initialLocation, navigate, identity, state.value, format, count])
  useEffect(() => {
    const change = () => setExpanded(document.fullscreenElement === root.current)
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])
  useEffect(() => {
    if (!expanded) return
    const close = (event: KeyboardEvent) => {if (event.key === 'Escape' && !document.fullscreenElement) setExpanded(false)}
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [expanded])
  async function expand() {
    if (expanded) {if (document.fullscreenElement === root.current) await document.exitFullscreen().catch(() => {}); setExpanded(false)}
    else {try {await root.current?.requestFullscreen(); setExpanded(true)} catch {setExpanded(true)}}
  }
  function download() {
    if (!state.value) return
    const url = URL.createObjectURL(state.value.blob)
    const link = document.createElement('a'); link.href = url; link.download = state.value.filename
    document.body.append(link); link.click(); link.remove()
    // Let the browser start reading before revoking. Also release on unmount.
    const timer = window.setTimeout(() => {URL.revokeObjectURL(url); downloads.current.delete(timer)}, 1000)
    downloads.current.set(timer, url)
  }
  const downloads = useRef(new Map<number, string>())
  useEffect(() => () => {downloads.current.forEach((url, timer) => {clearTimeout(timer); URL.revokeObjectURL(url)}); downloads.current.clear()}, [])
  const error = state.error || renderError
  return <div ref={root} className={`document-viewer ${expanded ? 'dv-expanded' : ''} ${props.className || ''}`} data-mode={props.mode || 'knowledge'} role="region" aria-label={`Просмотр ${format.toUpperCase()}`}>
    {state.value && <ViewerToolbar key={identity instanceof Object ? undefined : String(identity)} format={format} ready={ready} page={page} count={count} scale={scale} onPage={value => {void engine.current?.goToPage(value)}} onZoom={setZoom} onSearch={value => engine.current?.search(value)} onNextMatch={backward => engine.current?.nextMatch(backward)} search={search} onDownload={download} onExpand={() => void expand()} expanded={expanded} tools={props.tools} extra={props.toolbarExtra}/>}
    {format === 'docx' && <p className="dv-note">DOCX · Только чтение. Разбиение на страницы приблизительное и может отличаться от Microsoft Word.</p>}
    {(props.updating || !ready && !error) && <ViewerLoading updating={props.updating}/>}
    {error && <ViewerError message={error} onRetry={() => setRetry(value => value + 1)}/>}
    {notice && <aside className="dv-location-note" role="status"><p>{notice.text}</p>{notice.quote && <blockquote>{notice.quote}</blockquote>}{notice.annotation?.sourceReference && <p>Нормативная ссылка: {notice.annotation.sourceReference}</p>}<button type="button" onClick={clear}>Снять выделение</button></aside>}
    <div className="dv-stage"><div ref={scroll} className="dv-scroll" tabIndex={0} aria-label={`Страницы ${format.toUpperCase()}`} onScroll={() => {if (isReady.current && scroll.current) savedTop.current = scroll.current.scrollTop}}>
      {state.value && !error && <Suspense fallback={null}>{format === 'pdf'
        ? <PdfViewer key={state.revision} blob={state.value.blob} scrollRef={scroll} zoom={zoom} engineRef={engine} onReady={handleReady} onPage={handlePage} onScale={setScale} onSearch={setSearch} onError={handleError}/>
        : <DocxViewer key={state.revision} blob={state.value.blob} scrollRef={scroll} zoom={zoom} engineRef={engine} onReady={handleReady} onPage={handlePage} onScale={setScale} onSearch={setSearch} onError={handleError}/>}</Suspense>}
    </div></div>
  </div>
}
