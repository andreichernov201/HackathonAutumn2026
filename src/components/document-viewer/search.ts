export interface TextMatch {start: number; end: number}
export function findTextMatches(text: string, query: string): TextMatch[] {
  // Keep offsets into the original text while tolerating line breaks and NBSP.
  const offsets: number[] = []
  let normalized = ''
  for (let i = 0; i < text.length; i++) {
    const char = /\s/.test(text[i]) ? ' ' : text[i].toLocaleLowerCase('ru')
    if (char === ' ' && normalized.endsWith(' ')) continue
    normalized += char; offsets.push(i)
  }
  const needle = query.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru')
  if (!needle) return []
  const matches: TextMatch[] = []
  let from = 0
  while (from < normalized.length) {
    const index = normalized.indexOf(needle, from)
    if (index < 0) break
    matches.push({start: offsets[index], end: offsets[index + needle.length - 1] + 1})
    from = index + needle.length
  }
  return matches
}
export function escapeHtml(text: string) {return text.replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]!))}
export function highlightText(text: string, offset: number, matches: TextMatch[], selected?: TextMatch) {
  let result = '', cursor = 0
  for (const match of matches) {
    const start = Math.max(0, match.start - offset), end = Math.min(text.length, match.end - offset)
    if (start >= end) continue
    result += escapeHtml(text.slice(cursor, start)) + `<mark class="highlight${match === selected ? ' selected' : ''}">${escapeHtml(text.slice(start, end))}</mark>`
    cursor = end
  }
  return result + escapeHtml(text.slice(cursor))
}
export function clampPage(page: number, count: number) {return Math.max(1, Math.min(count || 1, Number.isFinite(page) ? Math.trunc(page) : 1))}
