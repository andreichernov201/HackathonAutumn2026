import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Maximize2, Minimize2, Search, ZoomIn, ZoomOut } from 'lucide-react'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import type { EventBus, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import './pdf-original.css'

export default function PdfOriginal({url, initialPage = 1}: {url: string; initialPage?: number}) {
  const root = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const pages = useRef<HTMLDivElement>(null)
  const runtime = useRef<{viewer: PDFViewer; bus: EventBus} | undefined>(undefined)
  const [page, setPage] = useState(initialPage)
  const [pageDraft, setPageDraft] = useState(String(initialPage))
  const [count, setCount] = useState(0)
  const [scale, setScale] = useState(1)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState({current: 0, total: 0})
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let cancelled = false
    let task: PDFDocumentLoadingTask | undefined
    let viewer: PDFViewer | undefined
    const controller = new AbortController()
    async function load() {
      // Load the core first: the official viewer consumes its pdfjsLib export.
      const pdfjs = await import('pdfjs-dist')
      const {EventBus, PDFViewer, PDFLinkService, PDFFindController} = await import('pdfjs-dist/web/pdf_viewer.mjs')
      if (cancelled || !container.current || !pages.current) return
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      const bus = new EventBus()
      const links = new PDFLinkService({eventBus: bus})
      const find = new PDFFindController({eventBus: bus, linkService: links})
      const options = {
        container: container.current, viewer: pages.current, eventBus: bus,
        linkService: links, findController: find, annotationMode: 0,
        enableAutoLinking: false, maxCanvasPixels: 8388608,
        abortSignal: controller.signal,
      }
      viewer = new PDFViewer(options)
      const current = viewer
      runtime.current = {viewer: current, bus}
      links.setViewer(current)
      bus.on('pagesinit', () => {
        if (cancelled) return
        current.currentScaleValue = 'page-width'
        current.currentPageNumber = Math.max(1, Math.min(initialPage, current.pagesCount))
        setReady(true)
      })
      bus.on('pagechanging', ({pageNumber}: {pageNumber: number}) => {
        if (!cancelled) {setPage(pageNumber); setPageDraft(String(pageNumber))}
      })
      bus.on('scalechanging', ({scale}: {scale: number}) => {if (!cancelled) setScale(scale)})
      bus.on('updatefindmatchescount', ({matchesCount}: {matchesCount: {current: number; total: number}}) => {
        if (!cancelled) setMatches(matchesCount)
      })
      bus.on('updatefindcontrolstate', ({state, matchesCount}: {state: number; matchesCount: {current: number; total: number}}) => {
        if (!cancelled) {setSearching(state === 3); setMatches(matchesCount)}
      })
      task = pdfjs.getDocument({url, withCredentials: true, enableXfa: false})
      const document = await task.promise
      if (cancelled) return
      setCount(document.numPages)
      links.setDocument(document)
      current.setDocument(document)
    }
    load().catch(() => {if (!cancelled) setError('Не удалось открыть PDF. Повторите открытие или скачайте оригинал.')})
    return () => {
      cancelled = true
      controller.abort()
      runtime.current = undefined
      viewer?.setDocument(null)
      void task?.destroy().catch(() => {})
    }
  }, [url, initialPage])

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === root.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  function go(next: number) {
    if (!runtime.current || !Number.isFinite(next)) return
    const value = Math.max(1, Math.min(Math.trunc(next), count))
    runtime.current.viewer.currentPageNumber = value
    setPageDraft(String(value))
  }
  function zoom(value: number) {
    if (runtime.current) runtime.current.viewer.currentScale = Math.max(0.5, Math.min(value, 3))
  }
  function find(previous = false, again = false) {
    setSearched(Boolean(query.trim()))
    runtime.current?.bus.dispatch('find', {
      source: runtime.current.bus, type: again ? 'again' : '', query: query.trim(),
      caseSensitive: false, entireWord: false, highlightAll: true,
      findPrevious: previous, matchDiacritics: false,
    })
  }
  async function expand() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen()
      else await root.current?.requestFullscreen()
    } catch {setError('Полноэкранный режим недоступен в этом браузере. Просмотр PDF продолжает работать ниже.')}
  }

  return <div className="kb-pdf" ref={root} role="region" aria-label="Просмотр PDF">
    <div className="kb-pdf-toolbar">
      <div className="kb-pdf-controls">
        <button type="button" className="kb-button" aria-label="Предыдущая страница PDF" disabled={!ready || page <= 1} onClick={() => go(page-1)}><ArrowLeft size={16}/></button>
        <form onSubmit={event => {event.preventDefault(); go(Number(pageDraft))}}><label>Страница <input aria-label="Номер страницы PDF" type="number" min="1" max={count || 1} value={pageDraft} disabled={!ready} onChange={event => setPageDraft(event.target.value)} onBlur={() => go(Number(pageDraft))}/><span>из {count || '…'}</span></label></form>
        <button type="button" className="kb-button" aria-label="Следующая страница PDF" disabled={!ready || page >= count} onClick={() => go(page+1)}><ArrowRight size={16}/></button>
        <button type="button" className="kb-button" aria-label="Уменьшить PDF" disabled={!ready || scale <= .5} onClick={() => zoom(scale-.25)}><ZoomOut size={16}/></button>
        <output aria-label="Масштаб PDF">{Math.round(scale*100)}%</output>
        <button type="button" className="kb-button" aria-label="Увеличить PDF" disabled={!ready || scale >= 3} onClick={() => zoom(scale+.25)}><ZoomIn size={16}/></button>
        <button type="button" className="kb-button" disabled={!ready} onClick={() => {if (runtime.current) runtime.current.viewer.currentScaleValue = 'page-width'}}>По ширине</button>
        <button type="button" className="kb-button" disabled={!ready} onClick={() => void expand()}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>} {fullscreen ? 'Свернуть PDF' : 'Развернуть PDF'}</button>
        <a className="kb-button" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Оригинал</a>
      </div>
      <form className="kb-pdf-search" onSubmit={event => {event.preventDefault(); find()}}>
        <Search size={16}/><input aria-label="Поиск в PDF" value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти в документе" disabled={!ready}/>
        <button className="kb-button" disabled={!ready}>Найти</button>
        <button type="button" className="kb-button" aria-label="Предыдущее совпадение PDF" disabled={!matches.total} onClick={() => find(true, true)}><ArrowLeft size={15}/></button>
        <button type="button" className="kb-button" aria-label="Следующее совпадение PDF" disabled={!matches.total} onClick={() => find(false, true)}><ArrowRight size={15}/></button>
        <span role="status">{searching ? 'Поиск…' : searched ? matches.total ? `${matches.current} из ${matches.total}` : 'Совпадений нет' : 'Поиск по всем страницам'}</span>
      </form>
    </div>
    {error && <p className="kb-error" role="alert">{error}</p>}
    {!ready && !error && <p className="kb-loading" role="status">Загрузка страниц PDF…</p>}
    <div className="kb-pdf-stage"><div className="kb-pdf-scroll" ref={container} tabIndex={0} aria-label="Страницы PDF"><div ref={pages} className="pdfViewer"/></div></div>
  </div>
}
