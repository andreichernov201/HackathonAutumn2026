import { Copy, Sparkles } from 'lucide-react'
import type { KnowledgeSection } from './types'
export function KnowledgeSectionExcerpt({section, onAsk, onCopy}: {section: KnowledgeSection; onAsk: () => void; onCopy: () => void}) {
  return <details className="kw-excerpt" open><summary>{section.source.locator} · извлечённый текст пункта</summary><div className="kw-excerpt-body"><p className="kw-hint">Точная цитата из выбранной редакции. Если визуальное совпадение не найдено, используйте этот текст и оригинал.</p>
    <article className="kb-source-text">{section.table ? <div className="kw-table-scroll"><table><tbody>{section.table.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div> : <pre>{section.text}</pre>}</article>
    <div className="kw-info-actions"><button className="kb-button" onClick={onAsk}><Sparkles size={15}/> Спросить AI об этом пункте</button><button className="kb-button" onClick={onCopy}><Copy size={15}/> Ссылка на пункт</button></div>
  </div></details>
}
