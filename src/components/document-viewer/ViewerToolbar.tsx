import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Download, Maximize2, Minimize2, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DocumentFormat, SearchState, ViewerTools } from './types'

interface Props {
  format: DocumentFormat
  ready: boolean
  page: number
  count: number
  scale: number
  onPage: (page: number) => void
  onZoom: (scale: number | 'width') => void
  onSearch: (query: string) => void
  onNextMatch: (backward?: boolean) => void
  search: SearchState
  onDownload: () => void
  onExpand: () => void
  expanded: boolean
  tools?: ViewerTools
  extra?: ReactNode
}
export function ViewerToolbar({
  format,
  ready,
  page,
  count,
  scale,
  onPage,
  onZoom,
  onSearch,
  onNextMatch,
  search,
  onDownload,
  onExpand,
  expanded,
  tools,
  extra,
}: Props) {
  const label = format.toUpperCase()
  const [draft, setDraft] = useState(String(page)),
    [query, setQuery] = useState(''),
    [searchOpen, setSearchOpen] = useState(false)
  useEffect(() => setDraft(String(page)), [page])
  function submitPage() {
    onPage(Number(draft))
    setDraft(String(Math.max(1, Math.min(count, Number(draft) || 1))))
  }
  return (
    <div className="dv-toolbar">
      <div className="dv-controls">
        <button
          type="button"
          aria-label={`Предыдущая страница ${label}`}
          disabled={!ready || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ArrowLeft size={16} />
        </button>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submitPage()
          }}
        >
          <label>
            Страница{' '}
            <input
              aria-label={`Номер страницы ${label}`}
              type="number"
              min={1}
              max={count || 1}
              value={draft}
              disabled={!ready}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={submitPage}
            />
            <span>из {count || '…'}</span>
          </label>
        </form>
        <button
          type="button"
          aria-label={`Следующая страница ${label}`}
          disabled={!ready || page >= count}
          onClick={() => onPage(page + 1)}
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          aria-label={`Уменьшить ${label}`}
          disabled={!ready || scale <= 0.25}
          onClick={() => onZoom(Math.max(0.25, scale - 0.25))}
        >
          <ZoomOut size={16} />
        </button>
        <output aria-label={`Масштаб ${label}`}>{Math.round(scale * 100)}%</output>
        <button
          type="button"
          aria-label={`Увеличить ${label}`}
          disabled={!ready || scale >= 3}
          onClick={() => onZoom(Math.min(3, scale + 0.25))}
        >
          <ZoomIn size={16} />
        </button>
        <button type="button" disabled={!ready} onClick={() => onZoom('width')}>
          По ширине
        </button>
        <button type="button" aria-label="Сбросить масштаб" disabled={!ready} onClick={() => onZoom(1)}>
          <RotateCcw size={15} /> 100%
        </button>
        {tools?.fullscreen !== false && (
          <button
            type="button"
            aria-label={expanded ? `Свернуть ${label}` : `Развернуть ${label}`}
            title={expanded ? `Свернуть ${label}` : `Развернуть ${label}`}
            onClick={onExpand}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}
        {tools?.download !== false && (
          <button type="button" onClick={onDownload}>
            <Download size={15} /> Скачать оригинал
          </button>
        )}
        {tools?.search !== false && (
          <button
            type="button"
            aria-label={searchOpen ? 'Закрыть поиск по документу' : 'Поиск по документу'}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search size={16} />
          </button>
        )}
        {extra}
      </div>
      {tools?.search !== false && searchOpen && (
        <form
          className="dv-search"
          onSubmit={(event) => {
            event.preventDefault()
            onSearch(query)
          }}
        >
          <Search size={16} />
          <input
            aria-label={`Поиск в ${label}`}
            placeholder="Найти в документе"
            disabled={!ready}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              onSearch('')
            }}
          />
          <button disabled={!ready}>Найти</button>
          <button
            type="button"
            aria-label={`Предыдущее совпадение ${label}`}
            disabled={!search.total || search.busy}
            onClick={() => onNextMatch(true)}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            type="button"
            aria-label={`Следующее совпадение ${label}`}
            disabled={!search.total || search.busy}
            onClick={() => onNextMatch()}
          >
            <ArrowRight size={15} />
          </button>
          <span role="status">
            {search.busy
              ? 'Поиск…'
              : search.searched
                ? search.total
                  ? `${search.current} из ${search.total}`
                  : 'Совпадений нет'
                : 'Поиск по всем страницам'}
          </span>
        </form>
      )}
    </div>
  )
}
