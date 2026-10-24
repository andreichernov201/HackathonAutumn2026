import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels'
import './document-viewer.css'

export interface DocumentPanel {id: string; label: string; content: ReactNode; defaultSize?: string; minSize?: string; collapsible?: boolean}
/** Two or three slots. The global application sidebar belongs outside this component. */
export function ResizableDocumentLayout({children, before, after}: {children: ReactNode; before?: DocumentPanel; after?: DocumentPanel}) {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 800px)').matches)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const handles = useRef<Record<string, PanelImperativeHandle | null>>({})
  useEffect(() => {
    const query = window.matchMedia('(max-width: 800px)')
    const update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const sides = [before, after].filter((panel): panel is DocumentPanel => !!panel)
  const slots = [...before ? [before] : [], {id: 'document-main', label: 'Документ', content: children, collapsible: false, defaultSize: sides.length === 2 ? '60%' : '70%', minSize: narrow ? '240px' : '30%'}, ...after ? [after] : []]
  return <div className={`dv-layout ${narrow ? 'dv-layout-narrow' : ''}`}>
    {sides.some(panel => panel.collapsible !== false) && <div className="dv-panel-toggles">{sides.filter(panel => panel.collapsible !== false).map(panel => <button type="button" key={panel.id} aria-expanded={!collapsed[panel.id]} onClick={() => {const handle = handles.current[panel.id]; if (handle?.isCollapsed()) handle.expand(); else handle?.collapse()}}>{collapsed[panel.id] ? 'Показать' : 'Скрыть'}: {panel.label}</button>)}</div>}
    <Group orientation={narrow ? 'vertical' : 'horizontal'} className="dv-panel-group">
      {slots.map((panel, i) => <Fragment key={panel.id}>
        {i > 0 && <Separator className="dv-panel-separator" aria-label={`Изменить размер: ${panel.label}`}/>}
        <Panel id={panel.id} panelRef={handle => {handles.current[panel.id] = handle}} defaultSize={panel.defaultSize || '20%'} minSize={panel.minSize || (narrow ? '120px' : '180px')} collapsible={panel.collapsible !== false} collapsedSize="0%" onResize={size => {const value = size.asPercentage === 0; setCollapsed(previous => previous[panel.id] === value ? previous : {...previous, [panel.id]: value})}} className="dv-layout-panel">
          {panel.content}
        </Panel>
      </Fragment>)}
    </Group>
  </div>
}
