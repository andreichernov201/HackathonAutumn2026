import { useEffect, useState } from 'react'
import { loadLocalSource } from '../../components/document-viewer/source'
export function KnowledgeTextOriginal({url, onError}: {url: string; onError: (message: string) => void}) {
  const [state, setState] = useState<{text?: string; error?: string}>({})
  useEffect(() => {
    const controller = new AbortController(); setState({})
    loadLocalSource(url, controller.signal).then(blob => blob.text()).then(text => {if (!controller.signal.aborted) setState({text})}).catch(() => {if (!controller.signal.aborted) {setState({error: 'Не удалось загрузить текстовый оригинал.'}); onError('Не удалось загрузить текстовый оригинал.')}})
    return () => controller.abort()
  }, [url, onError])
  return <div className="kw-txt" role="region" aria-label="Просмотр TXT">{state.error ? <p className="kb-error" role="alert">{state.error}</p> : state.text !== undefined ? <pre>{state.text}</pre> : <p className="kw-state" role="status">Загрузка TXT…</p>}</div>
}
