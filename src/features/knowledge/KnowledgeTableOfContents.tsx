import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, Sparkles } from 'lucide-react'
import { Highlight } from './Highlight'
import type { SectionSummary } from './types'
export function KnowledgeTableOfContents({items, selectedId, onSelect, onAsk}: {items: SectionSummary[]; selectedId?: string; onSelect: (id: string) => void; onAsk: (id: string) => void}) {
  const [query, setQuery] = useState(''), [closed, setClosed] = useState<Set<string>>(new Set())
  const tree = useMemo(() => {
    const byId = new Map(items.map(item => [item.id, item])), visible = new Set<string>()
    for (const item of items) if (!query.trim() || `${item.sectionNumber || ''} ${item.heading}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))) {
      let current: SectionSummary | undefined = item
      while (current && !visible.has(current.id)) {visible.add(current.id); current = current.parentId ? byId.get(current.parentId) : undefined}
    }
    const groups = new Map<string | null, SectionSummary[]>()
    for (const item of items) if (visible.has(item.id)) {const parent = item.parentId && byId.has(item.parentId) ? item.parentId : null; groups.set(parent, [...groups.get(parent) || [], item])}
    return groups
  }, [items, query])
  function toggle(id: string) {setClosed(previous => {const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next})}
  function branch(parent: string | null): React.ReactNode {
    return <ul>{tree.get(parent)?.map(item => {
      const children = tree.has(item.id), expanded = !!query || !closed.has(item.id)
      return <li key={item.id}><div className={`kw-toc-row ${selectedId === item.id ? 'selected' : ''}`}>
        {children ? <button className="kb-icon" aria-label={`${expanded ? 'Свернуть' : 'Раскрыть'} ${item.heading}`} aria-expanded={expanded} onClick={() => toggle(item.id)}>{expanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</button> : <span className="kw-tree-spacer"/>}
        <button className="kw-toc-target" onClick={() => onSelect(item.id)} aria-current={selectedId === item.id ? 'location' : undefined}><span><Highlight text={item.heading} query={query}/></span><small>{item.sectionNumber && !item.heading.startsWith(item.sectionNumber) ? `Пункт ${item.sectionNumber} · ` : ''}{item.pageStart ? `Стр. ${item.pageStart}` : 'Страница не определена'}</small></button>
        <button className="kb-icon" title="Спросить AI по этому пункту" aria-label={`Спросить AI: ${item.locator}`} onClick={() => onAsk(item.id)}><Sparkles size={15}/></button>
      </div>{children && expanded && branch(item.id)}</li>
    })}</ul>
  }
  return <div className="kw-toc-panel"><div className="kw-section-heading"><div><h2>Содержание</h2><p>{items.length} пунктов · структура из оригинального источника</p></div><button className="kb-button" onClick={() => setClosed(closed.size ? new Set() : new Set(items.map(item => item.id)))}>{closed.size ? 'Раскрыть всё' : 'Свернуть всё'}</button></div>
    <label className="kw-search"><Search size={16}/><input aria-label="Поиск по содержанию" placeholder="Найти раздел или пункт" value={query} onChange={event => setQuery(event.target.value)}/></label>
    <nav className="kw-toc" aria-label="Содержание документа">{tree.size ? branch(null) : <p className="kw-state">{query ? 'Разделы не найдены.' : 'В документе нет извлечённого содержания.'}</p>}</nav>
  </div>
}
