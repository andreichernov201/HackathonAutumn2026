import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderAsync, type HElement } from 'docx-preview'
import { clampPage, findTextMatches } from './search'
import { useViewport } from './hooks/useViewport'
import type { DocumentLocation, EngineProps, NavigationResult } from './types'

const frameHtml = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;background:#f0f0f2}body{padding:16px;box-sizing:border-box}mark.dv-highlight{background:#fde68a;color:inherit}section.docx{background:#fff;box-shadow:0 2px 10px #1b35501a;margin:0 auto 16px!important}*{box-sizing:border-box}.regula-inline{cursor:text;border-radius:2px;outline:1px solid transparent;outline-offset:2px;background:#edf4ff!important;white-space:pre-wrap}.regula-inline:hover{outline-color:#9cbfe8}.regula-inline:focus{outline:2px solid #2771cb;background:#e8f1ff!important}.regula-inline[role=button]{cursor:pointer}.regula-inline[aria-invalid=true]{text-decoration:underline dotted #b58132;text-underline-offset:4px}</style></head><body></body></html>`

// Create every node in the sandbox document; no untrusted HTML is interpreted.
function safeRenderer(doc: Document) {
  function h(value: HElement | Node | string): Node {
    if (typeof value === 'string') return doc.createTextNode(value)
    if ('nodeType' in value) return value as Node
    const { ns, tagName, className, style, children, ...props } = value
    if (tagName === '#comment') return doc.createComment('')
    if (tagName === '#fragment') {
      const fragment = doc.createDocumentFragment()
      children?.forEach((child) => fragment.appendChild(h(child)))
      return fragment
    }
    if (/^(script|iframe|object|embed|foreignObject|link|meta|base|form|input|button)$/i.test(tagName))
      return doc.createTextNode('')
    const element = ns ? doc.createElementNS(ns, tagName) : doc.createElement(tagName)
    if (className) element.setAttribute('class', className)
    if (style) {
      if (typeof style === 'string') element.setAttribute('style', style)
      else Object.assign((element as HTMLElement).style, style)
    }
    for (const [key, val] of Object.entries(props)) {
      if (/^on/i.test(key) || /^(innerHTML|outerHTML|srcdoc|action|formAction)$/i.test(key)) continue
      if (
        /^(href|src|xlink:href)$/i.test(key) &&
        !(typeof val === 'string' && (val.startsWith('#') || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(val)))
      )
        continue
      if (val !== undefined) Reflect.set(element, key, val)
    }
    children?.forEach((child) => element.appendChild(h(child)))
    return element
  }
  return h
}
export default function DocxViewer({
  blob,
  scrollRef,
  zoom,
  engineRef,
  onReady,
  onPage,
  onScale,
  onSearch,
  onError,
  fieldEditing,
}: EngineProps) {
  const editing = useRef(fieldEditing)
  editing.current = fieldEditing
  const iframe = useRef<HTMLIFrameElement>(null)
  const [doc, setDoc] = useState<Document>()
  const [dimensions, setDimensions] = useState({ width: 826, height: 600 })
  const viewport = useViewport(scrollRef)
  const scale = zoom === 'width' ? Math.max(0.1, (viewport.width - 16) / dimensions.width) : zoom
  const pages = useRef<HTMLElement[]>([])
  const marks = useRef<HTMLElement[]>([])
  const active = useRef(0)
  const ready = useRef(false)
  const priorScale = useRef(scale)
  useEffect(() => {
    onScale(scale)
  }, [scale, onScale])
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop *= scale / priorScale.current
    priorScale.current = scale
  }, [scale, scrollRef])
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    ready.current = false
    const content = doc.createElement('div'),
      styles = doc.createElement('div')
    doc.body.replaceChildren()
    let observer: ResizeObserver | undefined
    const measure = () => {
      if (cancelled) return
      const sections = Array.from(content.querySelectorAll<HTMLElement>('section.docx'))
      pages.current = sections
      const width = Math.max(320, ...sections.map((section) => section.offsetWidth + 32))
      setDimensions({
        width,
        height: Math.max(content.scrollHeight + 32, 300),
      })
    }
    renderAsync(blob, content, styles, {
      className: 'docx',
      inWrapper: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      useBase64URL: true,
      renderAltChunks: false,
      renderComments: false,
      experimental: false,
      h: safeRenderer(doc),
    })
      .then(() => {
        if (cancelled) return
        // Links stay local to this read-only frame. Scripts and remote resources are blocked by CSP.
        content.querySelectorAll('*').forEach((element) => {
          for (const attribute of Array.from(element.attributes)) {
            if (/^on/i.test(attribute.name) || /^(srcdoc|action|formaction)$/i.test(attribute.name))
              element.removeAttribute(attribute.name)
            if (
              /^(href|src|xlink:href)$/i.test(attribute.name) &&
              !attribute.value.startsWith('#') &&
              !attribute.value.startsWith('data:')
            )
              element.removeAttribute(attribute.name)
          }
        })
        content.querySelectorAll('a').forEach((link) => {
          if (!link.getAttribute('href')?.startsWith('#')) link.removeAttribute('href')
        })
        if (editing.current) {
          for (const anchor of content.querySelectorAll<HTMLElement>('[id^="regula_field_"]')) {
            const key = anchor.id.replace(/^regula_field_/, '').replace(/_\d+$/, '')
            const spec = editing.current.specs.find((item) => item.key === key)
            const target = anchor.nextElementSibling as HTMLElement | null
            if (!spec || !target || target.tagName !== 'SPAN') continue
            target.classList.add('regula-inline')
            target.dataset.fieldId = key
            target.tabIndex = 0
            target.title = spec.label
            target.setAttribute('aria-label', spec.label)
            target.setAttribute('aria-required', String(spec.required))
            target.setAttribute('aria-invalid', String(spec.required && !editing.current.values[key]?.trim()))
            const isText = spec.inputType === 'text'
            target.setAttribute('role', isText ? 'textbox' : 'button')
            if (isText) {
              target.contentEditable = 'plaintext-only'
              target.setAttribute('aria-multiline', String(spec.multiline))
            }
            let original = '',
              lastText = '',
              changed = false
            target.addEventListener('focus', () => {
              original = editing.current?.values[key] || ''
              lastText = target.textContent || ''
              changed = false
              editing.current?.onSelect(key)
              if (isText) {
                editing.current?.onEditing(true)
                if (!original) {
                  target.textContent = ''
                  lastText = ''
                }
              }
            })
            target.addEventListener('input', () => {
              const value = target.textContent || ''
              if (value.length > 4000) {
                target.textContent = lastText
                target.dataset.constraint = 'length'
                editing.current?.onConstraintError?.(
                  `Поле «${spec.label}» допускает до 4000 символов. Ввод не добавлен.`,
                )
                return
              }
              if (target.dataset.constraint) {
                delete target.dataset.constraint
                editing.current?.onConstraintError?.('')
              }
              lastText = value
              changed = true
              editing.current?.onChange(key, value)
            })
            target.addEventListener('blur', () => {
              if (isText) {
                if (!changed && !original) target.textContent = 'Укажите: ' + spec.label
                editing.current?.onEditing(false)
              }
            })
            target.addEventListener('keydown', (event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                target.blur()
                queueMicrotask(() => editing.current?.onSave())
              }
              if (event.key === 'Enter' && (!isText || !spec.multiline)) {
                event.preventDefault()
                target.blur()
                editing.current?.onSelect(key)
              }
              if (event.key === 'Escape' && isText) {
                target.textContent = original
                editing.current?.onChange(key, original)
                target.blur()
              }
            })
            if (!isText) target.addEventListener('click', () => editing.current?.onSelect(key))
          }
        }
        doc.body.append(styles, content)
        measure()
        ready.current = true
        onReady(pages.current.length || 1)
        observer = new ResizeObserver(measure)
        observer.observe(content)
      })
      .catch(() => {
        if (!cancelled) onError('Не удалось открыть DOCX. Проверьте формат и целостность файла.')
      })
    return () => {
      cancelled = true
      ready.current = false
      observer?.disconnect()
      content.remove()
      styles.remove()
      pages.current = []
      marks.current = []
    }
  }, [blob, doc, onReady, onError])
  useEffect(() => {
    const page =
      pages.current.findIndex((section) => (section.offsetTop + section.offsetHeight) * scale > viewport.top + 100) + 1
    if (page > 0) onPage(page)
  }, [viewport.top, scale, dimensions.height, onPage])
  function clearMarks() {
    marks.current.forEach((mark) => mark.replaceWith(...Array.from(mark.childNodes)))
    doc?.body.normalize()
    marks.current = []
    active.current = 0
  }
  function reveal(mark: HTMLElement) {
    const node = scrollRef.current
    if (node)
      node.scrollTop =
        (mark.getBoundingClientRect().top + (doc?.defaultView?.scrollY || 0)) * scale - node.clientHeight / 3
    const page = pages.current.findIndex((section) => section.contains(mark)) + 1
    if (page > 0) onPage(page)
  }
  function markText(query: string, scope: Node = doc!.body) {
    clearMarks()
    const walker = doc!.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest('style,script') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    })
    const nodes: Array<{ node: Text; start: number }> = []
    let text = '',
      current: Node | null,
      lastBlock: Element | null = null
    while ((current = walker.nextNode())) {
      const block = current.parentElement?.closest('p,td,th,li,h1,h2,h3') || null
      if (text && block !== lastBlock) text += '\n'
      nodes.push({ node: current as Text, start: text.length })
      text += current.textContent
      lastBlock = block
    }
    const matches = findTextMatches(text, query)
    const firstMarks: HTMLElement[] = []
    // Reverse order keeps original offsets valid even when one text node has multiple matches.
    for (const match of [...matches].reverse()) {
      let first: HTMLElement | undefined
      for (const { node, start } of [...nodes].reverse()) {
        const from = Math.max(0, match.start - start),
          to = Math.min(node.length, match.end - start)
        if (from >= to) continue
        const range = doc!.createRange()
        range.setStart(node, from)
        range.setEnd(node, to)
        const mark = doc!.createElement('mark')
        mark.className = 'dv-highlight'
        range.surroundContents(mark)
        marks.current.push(mark)
        first = mark
      }
      if (first) firstMarks.unshift(first)
    }
    return firstMarks
  }
  const searchTargets = useRef<HTMLElement[]>([])
  function goToPage(value: number): Promise<NavigationResult> {
    const page = clampPage(value, pages.current.length),
      section = pages.current[page - 1]
    if (section && scrollRef.current) {
      scrollRef.current.scrollTop = section.offsetTop * scale
      onPage(page)
    }
    return Promise.resolve({ exact: !!section, page })
  }
  async function goToLocation(location: DocumentLocation): Promise<NavigationResult> {
    if (!ready.current || !doc) return { exact: false, message: 'Документ ещё загружается.' }
    clearMarks()
    searchTargets.current = []
    onSearch({ current: 0, total: 0, busy: false, searched: false })
    if (
      location.page &&
      !location.quote &&
      !location.sectionId &&
      location.textOffsetStart === undefined &&
      location.textOffsetEnd === undefined
    )
      return goToPage(location.page)
    const section = location.sectionId?.startsWith('field:')
      ? doc.querySelector<HTMLElement>(`[data-field-id="${CSS.escape(location.sectionId.slice(6))}"]`)
      : location.sectionId
        ? doc.getElementById(location.sectionId)
        : null
    if (section) {
      reveal(section)
      return { exact: true }
    }
    if (location.quote) {
      const scope = location.page ? pages.current[clampPage(location.page, pages.current.length) - 1] : doc.body
      const found = markText(location.quote, scope || doc.body)
      if (found[0]) {
        reveal(found[0])
        return { exact: true }
      }
    }
    if (location.page) await goToPage(location.page)
    return {
      exact: false,
      page: location.page,
      message: location.quote
        ? 'Точное место фрагмента не определено. Ниже показан извлечённый текст.'
        : 'Точное место фрагмента не определено.',
    }
  }
  engineRef.current = {
    goToPage,
    goToLocation,
    highlightAnnotation: (annotation) => goToLocation(annotation.location),
    clearHighlight: () => {
      clearMarks()
      searchTargets.current = []
      onSearch({ current: 0, total: 0, busy: false, searched: false })
    },
    search: (query) => {
      if (!doc || !ready.current) return
      const found = markText(query)
      searchTargets.current = found
      active.current = 0
      onSearch({
        current: found.length ? 1 : 0,
        total: found.length,
        busy: false,
        searched: !!query.trim(),
      })
      if (found[0]) reveal(found[0])
    },
    nextMatch: (backward) => {
      const found = searchTargets.current
      if (!found.length) return
      active.current = (active.current + (backward ? -1 : 1) + found.length) % found.length
      reveal(found[active.current])
      onSearch({
        current: active.current + 1,
        total: found.length,
        busy: false,
        searched: true,
      })
    },
  }
  useEffect(
    () => () => {
      engineRef.current = null
    },
    [engineRef],
  )
  return (
    <div
      className="dv-docx-size"
      style={{
        width: dimensions.width * scale,
        height: dimensions.height * scale,
      }}
    >
      <iframe
        ref={iframe}
        title="Страницы DOCX"
        sandbox="allow-same-origin"
        srcDoc={frameHtml}
        onLoad={() => setDoc(iframe.current?.contentDocument || undefined)}
        style={{
          width: dimensions.width,
          height: dimensions.height,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  )
}
