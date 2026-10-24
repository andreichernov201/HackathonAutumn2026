import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'react-pdf/dist/Page/TextLayer.css'
import { clampPage, findTextMatches, highlightText, type TextMatch } from './search'
import { useViewport } from './hooks/useViewport'
import type { DocumentLocation, EngineProps, NavigationResult } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
const options = {isEvalSupported: false, enableXfa: false, useWasm: false, useSystemFonts: true, cMapPacked: true, cMapUrl: `${import.meta.env.BASE_URL}assets/pdfjs/cmaps/`, standardFontDataUrl: `${import.meta.env.BASE_URL}assets/pdfjs/standard_fonts/`}
type PageText = {text: string; offsets: number[]}
type Match = TextMatch & {page: number}

const PdfPage = memo(function PdfPage({number, scale, width, height, text, matches, selected, onTextReady, onError}: {
  number: number; scale: number; width: number; height: number; text?: PageText; matches: Match[]; selected?: Match
  onTextReady: (page: number) => void; onError: (message: string) => void
}) {
  const pageMatches = useMemo(() => matches.filter(match => match.page === number), [matches, number])
  const renderer = useCallback(({str, itemIndex}: TextItem & {itemIndex: number}) => highlightText(str, text?.offsets[itemIndex] || 0, pageMatches, selected), [text, pageMatches, selected])
  const rendered = useCallback(() => onTextReady(number), [onTextReady, number])
  const failed = useCallback(() => onError('Не удалось отобразить страницу PDF.'), [onError])
  return <Page suspense={false} pageNumber={number} scale={scale}
    devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_388_608 / (width * scale * height)))}
    renderAnnotationLayer={false} renderTextLayer onRenderTextLayerSuccess={rendered} onRenderError={failed} onLoadError={failed} onGetTextError={failed} onRenderTextLayerError={failed}
    loading={<span className="dv-status">Страница {number}…</span>} customTextRenderer={renderer}/>
})
export default function PdfViewer({blob, scrollRef, zoom, engineRef, onReady, onPage, onScale, onSearch, onError}: EngineProps) {
  const [file, setFile] = useState<{data: Uint8Array} | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [sizes, setSizes] = useState<Array<{width: number; height: number}>>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [active, setActive] = useState(0)
  const [index, setIndex] = useState<Map<number, PageText>>(new Map())
  const textCache = useRef(new Map<number, Promise<PageText>>())
  const pendingReveal = useRef<Match | null>(null)
  const generation = useRef(0)
  const live = useRef(true)
  const viewport = useViewport(scrollRef)
  const scale = sizes.length && zoom === 'width' ? Math.max(.1, (viewport.width - 32) / Math.max(...sizes.map(size => size.width))) : typeof zoom === 'number' ? zoom : 1
  const layout = useMemo(() => {
    let top = 16
    return sizes.map(size => {const item = {...size, top, height: size.height * scale}; top += item.height + 16; return item})
  }, [sizes, scale])
  const totalHeight = layout.length ? layout[layout.length - 1].top + layout[layout.length - 1].height + 16 : 600
  const priorLayout = useRef(layout)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  useEffect(() => {live.current = true; return () => {live.current = false; generation.current++}}, [])
  useEffect(() => {
    let cancelled = false
    blob.arrayBuffer().then(data => {if (!cancelled) setFile({data: new Uint8Array(data)})}).catch(() => onError('Не удалось прочитать PDF.'))
    return () => {cancelled = true}
  }, [blob, onError])
  useEffect(() => {onScale(scale)}, [scale, onScale])
  useLayoutEffect(() => {
    const node = scrollRef.current, previous = priorLayout.current
    if (node && previous.length && layout.length && previous !== layout) {
      const anchor = previous.findIndex(item => item.top + item.height > node.scrollTop)
      if (anchor >= 0 && layout[anchor]) {
        const fraction = (node.scrollTop - previous[anchor].top) / previous[anchor].height
        node.scrollTop = layout[anchor].top + fraction * layout[anchor].height
      }
    }
    priorLayout.current = layout
  }, [layout, scrollRef])
  useEffect(() => {
    const page = layout.findIndex(item => item.top + item.height > viewport.top + Math.min(100, viewport.height / 4)) + 1
    if (page > 0) {onPage(page)}
  }, [layout, viewport.top, viewport.height, onPage])

  async function loaded(document: PDFDocumentProxy) {
    try {
      const dimensions = []
      // Only page metadata is loaded here. Canvas and text layers stay windowed.
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number)
        if (!live.current) return
        const view = page.getViewport({scale: 1})
        dimensions.push({width: view.width, height: view.height})
      }
      if (live.current) {setSizes(dimensions); setPdf(document); onReady(document.numPages)}
    } catch {if (live.current) onError('Не удалось прочитать страницы PDF.')}
  }
  function goToPage(value: number): Promise<NavigationResult> {
    const page = clampPage(value, sizes.length)
    const node = scrollRef.current, target = layoutRef.current[page - 1]
    if (node && target) {node.scrollTop = target.top; onPage(page)}
    return Promise.resolve({exact: !!target, page})
  }
  async function textFor(page: number) {
    let promise = textCache.current.get(page)
    if (!promise) {
      promise = (async () => {
        const handle = await pdf!.getPage(page)
        const content = await handle.getTextContent()
        const offsets: number[] = []
        let text = ''
        content.items.forEach(item => {
          offsets.push(text.length)
          if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '')
        })
        return {text, offsets}
      })()
      textCache.current.set(page, promise)
    }
    return promise
  }
  function reveal(match: Match) {
    pendingReveal.current = match
    void goToPage(match.page)
    // The precise text may live in an unmounted page; its text layer will scroll it into view.
  }
  async function search(query: string) {
    const run = ++generation.current
    setMatches([]); setActive(0)
    onSearch({current: 0, total: 0, busy: !!query.trim(), searched: !!query.trim()})
    if (!query.trim() || !pdf) return
    const found: Match[] = [], texts = new Map<number, PageText>()
    try {
      for (let page = 1; page <= pdf.numPages; page++) {
        const text = await textFor(page)
        if (!live.current || run !== generation.current) return
        texts.set(page, text)
        found.push(...findTextMatches(text.text, query).map(match => ({...match, page})))
        // Yield between pages, including cached pages, so a new query can cancel this search.
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      if (!live.current || run !== generation.current) return
      setIndex(texts); setMatches(found); setActive(0)
      onSearch({current: found.length ? 1 : 0, total: found.length, busy: false, searched: true})
      if (found[0]) reveal(found[0])
    } catch {if (live.current && run === generation.current) {onSearch({current: 0, total: 0, busy: false, searched: true}); onError('Не удалось выполнить поиск в PDF.')}}
  }
  async function goToLocation(location: DocumentLocation): Promise<NavigationResult> {
    const run = ++generation.current
    pendingReveal.current = null; setMatches([]); setActive(0)
    onSearch({current: 0, total: 0, busy: false, searched: false})
    if (location.page && !location.quote && !location.sectionId && location.textOffsetStart === undefined && location.textOffsetEnd === undefined) return goToPage(location.page)
    if (location.quote && pdf) {
      const pages = location.page ? [clampPage(location.page, pdf.numPages)] : Array.from({length: pdf.numPages}, (_, i) => i + 1)
      for (const page of pages) {
        const text = await textFor(page)
        if (!live.current || run !== generation.current) return {exact: false, message: 'Переход отменён.'}
        const found = findTextMatches(text.text, location.quote).map(match => ({...match, page}))
        if (found.length) {setIndex(new Map([[page, text]])); setMatches(found); setActive(0); reveal(found[0]); return {exact: true, page}}
      }
    }
    if (location.page) await goToPage(location.page)
    return {exact: false, page: location.page ? clampPage(location.page, sizes.length) : undefined, message: location.quote ? 'Точное место фрагмента не определено. Ниже показан извлечённый текст.' : 'Точное место фрагмента не определено.'}
  }
  engineRef.current = {
    goToPage, goToLocation,
    highlightAnnotation: annotation => goToLocation(annotation.location),
    clearHighlight: () => {pendingReveal.current = null; generation.current++; setMatches([]); onSearch({current: 0, total: 0, busy: false, searched: false})},
    search: query => {void search(query)},
    nextMatch: backward => {
      if (!matches.length) return
      const next = (active + (backward ? -1 : 1) + matches.length) % matches.length
      setActive(next); reveal(matches[next]); onSearch({current: next + 1, total: matches.length, busy: false, searched: true})
    },
  }
  useEffect(() => () => {engineRef.current = null}, [engineRef])
  const revealText = useCallback((page: number) => {
    if (pendingReveal.current?.page !== page) return
    const node = scrollRef.current, mark = node?.querySelector(`[data-page="${page}"] .highlight.selected`)
    if (node && mark) {
      const bounds = mark.getBoundingClientRect(), container = node.getBoundingClientRect()
      node.scrollTop += bounds.top - container.top - container.height / 3
      pendingReveal.current = null
    }
  }, [scrollRef])
  const visible = layout.map((item, i) => ({...item, number: i + 1})).filter(item => item.top + item.height >= viewport.top - viewport.height && item.top <= viewport.top + viewport.height * 2)
  return file && <Document suspense={false} file={file} options={options} onLoadSuccess={loaded} onLoadError={() => onError('Не удалось открыть PDF. Файл повреждён, защищён паролем или недоступен.')} onPassword={() => onError('PDF защищён паролем. Используйте доступную копию.')} loading={null} error={null} className="dv-pdf-document">
    <div className="dv-pdf-pages" style={{height: totalHeight, width: Math.max(viewport.width, ...sizes.map(size => size.width * scale + 32))}}>
      {visible.map(item => <div className="dv-pdf-page" key={item.number} data-page={item.number} style={{position: 'absolute', top: item.top, width: item.width * scale, height: item.height}}>
        <PdfPage number={item.number} scale={scale} width={item.width} height={item.height} text={index.get(item.number)} matches={matches} selected={matches[active]} onTextReady={revealText} onError={onError}/>
      </div>)}
    </div>
  </Document>
}
