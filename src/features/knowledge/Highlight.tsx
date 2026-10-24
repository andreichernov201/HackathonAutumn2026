export function Highlight({ text, query }: { text: string; query: string }) {
  const tokens =
    query
      .match(/[\p{L}\p{N}.]+/gu)
      ?.filter((value) => value.length > 1)
      .slice(0, 30) || []
  if (!tokens.length) return <>{text}</>
  const pattern = new RegExp(
    '(' + tokens.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
    'gi',
  )
  return <>{text.split(pattern).map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part))}</>
}
