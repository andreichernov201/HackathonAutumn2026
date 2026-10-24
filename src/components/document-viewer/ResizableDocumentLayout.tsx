import { Fragment, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels'
import './document-viewer.css'

export interface DocumentPanel {
  id: string
  label: string
  content: ReactNode
  defaultSize?: string
  minSize?: string
  maxSize?: string
  collapsible?: boolean
}
export interface DocumentLayoutHandle {
  togglePanel(id: string): void
  closePanel(id: string): void
}
interface Props {
  children: ReactNode
  before?: DocumentPanel
  after?: DocumentPanel
  ref?: Ref<DocumentLayoutHandle>
  className?: string
  storageKey?: string
  mobilePresentation?: 'stack' | 'drawer'
  mobileBreakpoint?: number
  onPanelVisibility?: (id: string, visible: boolean) => void
}
function stored(key?: string): Record<string, number> {
  try {
    return key ? JSON.parse(sessionStorage.getItem(key) || '{}') : {}
  } catch {
    return {}
  }
}
/** The application sidebar belongs outside this layout. */
export function ResizableDocumentLayout({
  children,
  before,
  after,
  ref,
  className = '',
  storageKey,
  mobilePresentation = 'stack',
  mobileBreakpoint = 800,
  onPanelVisibility,
}: Props) {
  const media = `(max-width: ${mobileBreakpoint}px)`
  const [narrow, setNarrow] = useState(() => window.matchMedia(media).matches)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [drawer, setDrawer] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const handles = useRef<Record<string, PanelImperativeHandle | null>>({})
  const initialSizes = useRef(stored(storageKey))
  const preferred = useRef({ ...initialSizes.current })
  const callback = useRef(onPanelVisibility)
  callback.current = onPanelVisibility
  const useDrawer = narrow && mobilePresentation === 'drawer'
  const sides = [before, after].filter((panel): panel is DocumentPanel => !!panel)
  useEffect(() => {
    const query = window.matchMedia(media),
      update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [media])
  useEffect(() => {
    if (useDrawer && drawer) dialog.current?.showModal()
    else dialog.current?.close()
  }, [useDrawer, drawer])
  useEffect(() => {
    for (const panel of sides) callback.current?.(panel.id, useDrawer ? drawer === panel.id : !collapsed[panel.id])
  }, [useDrawer, drawer, collapsed, before?.id, after?.id])
  function toggle(id: string) {
    if (useDrawer) setDrawer((previous) => (previous === id ? null : id))
    else {
      const handle = handles.current[id]
      if (handle?.isCollapsed()) handle.expand()
      else handle?.collapse()
    }
  }
  function close(id: string) {
    if (useDrawer) setDrawer(null)
    else handles.current[id]?.collapse()
  }
  useImperativeHandle(ref, () => ({ togglePanel: toggle, closePanel: close }))
  const slots = [
    ...(before ? [before] : []),
    {
      id: 'document-main',
      label: 'Документ',
      content: children,
      collapsible: false,
      defaultSize: sides.length === 2 ? '60%' : '70%',
      minSize: narrow ? '240px' : '30%',
      maxSize: undefined,
    },
    ...(after ? [after] : []),
  ]
  return (
    <div
      className={`dv-layout ${narrow && !useDrawer ? 'dv-layout-narrow' : ''} ${useDrawer ? 'dv-layout-drawer' : ''} ${className}`}
    >
      {!ref && sides.some((panel) => panel.collapsible !== false) && (
        <div className="dv-panel-toggles">
          {sides
            .filter((panel) => panel.collapsible !== false)
            .map((panel) => (
              <button
                type="button"
                key={panel.id}
                aria-expanded={useDrawer ? drawer === panel.id : !collapsed[panel.id]}
                onClick={() => toggle(panel.id)}
              >
                {(useDrawer ? drawer !== panel.id : collapsed[panel.id]) ? 'Показать' : 'Скрыть'}: {panel.label}
              </button>
            ))}
        </div>
      )}
      {useDrawer ? (
        <>
          <div className="dv-drawer-main">{children}</div>
          {sides.length > 0 && (
            <dialog
              className="dv-side-drawer"
              ref={dialog}
              aria-label={sides.find((side) => side.id === (drawer || sides[0].id))?.label}
              onCancel={() => setDrawer(null)}
              onClose={() => setDrawer(null)}
              onClick={(event) => {
                if (event.target === event.currentTarget) setDrawer(null)
              }}
            >
              {sides.find((side) => side.id === (drawer || sides[0].id))?.content}
            </dialog>
          )}
        </>
      ) : (
        <Group orientation={narrow ? 'vertical' : 'horizontal'} className="dv-panel-group">
          {slots.map((panel, i) => (
            <Fragment key={panel.id}>
              {i > 0 && <Separator className="dv-panel-separator" aria-label={`Изменить размер: ${panel.label}`} />}
              <Panel
                id={panel.id}
                panelRef={(handle) => {
                  handles.current[panel.id] = handle
                }}
                defaultSize={
                  panel.id === 'document-main'
                    ? undefined
                    : initialSizes.current[panel.id] !== undefined
                      ? `${initialSizes.current[panel.id]}px`
                      : panel.defaultSize || '20%'
                }
                minSize={panel.minSize || (narrow ? '120px' : '180px')}
                maxSize={panel.maxSize}
                collapsible={panel.collapsible !== false}
                collapsedSize="0%"
                onResize={(size) => {
                  const value = size.asPercentage === 0
                  setCollapsed((previous) =>
                    previous[panel.id] === value ? previous : { ...previous, [panel.id]: value },
                  )
                  if (storageKey && panel.id !== 'document-main' && size.inPixels > 0) {
                    preferred.current[panel.id] = size.inPixels
                    try {
                      sessionStorage.setItem(storageKey, JSON.stringify(preferred.current))
                    } catch {
                      /* Storage can be disabled. */
                    }
                  }
                }}
                className="dv-layout-panel"
              >
                {panel.content}
              </Panel>
            </Fragment>
          ))}
        </Group>
      )}
    </div>
  )
}
