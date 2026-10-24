import type { ReactNode } from 'react'
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link && /^(https?:\/\/|\/#)/i.test(link[2]))
      return (
        <a key={index} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      )
    return part
  })
}
/** A deliberately small Markdown subset: raw HTML is always plain text. */
export function MessageMarkdown({ text }: { text: string }) {
  const lines = text.split('\n'),
    nodes: ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const code: string[] = []
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i])
      nodes.push(
        <pre key={i}>
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }
    if (/^#{1,6}\s/.test(line)) {
      nodes.push(<h3 key={i}>{inline(line.replace(/^#{1,6}\s/, ''))}</h3>)
      continue
    }
    if (/^>\s?/.test(line)) {
      nodes.push(<blockquote key={i}>{inline(line.replace(/^>\s?/, ''))}</blockquote>)
      continue
    }
    if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line),
        items: ReactNode[] = []
      const pattern = ordered ? /^\s*\d+\.\s/ : /^\s*[-*]\s/
      do {
        items.push(<li key={i}>{inline(lines[i].replace(pattern, ''))}</li>)
        i++
      } while (i < lines.length && pattern.test(lines[i]))
      i--
      nodes.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>)
      continue
    }
    if (i + 1 < lines.length && line.includes('|') && /^\s*\|?\s*:?-+/.test(lines[i + 1])) {
      const cells = (value: string) =>
        value
          .replace(/^\s*\||\|\s*$/g, '')
          .split('|')
          .map((s) => s.trim())
      const headings = cells(line),
        rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(cells(lines[i]))
        i++
      }
      i--
      nodes.push(
        <div className="message-table" key={i}>
          <table>
            <thead>
              <tr>
                {headings.map((v, n) => (
                  <th key={n}>{inline(v)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, n) => (
                <tr key={n}>
                  {row.map((v, j) => (
                    <td key={j}>{inline(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    if (line.trim()) nodes.push(<p key={i}>{inline(line)}</p>)
  }
  return <div className="message-markdown">{nodes}</div>
}
