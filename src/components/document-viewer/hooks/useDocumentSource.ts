import { useEffect, useRef, useState } from 'react'
import { loadLocalSource, resolveSource } from '../source'
import type { DocumentViewerProps } from '../types'

export function useDocumentSource({source, format, filename, loadSource = loadLocalSource}: DocumentViewerProps, retry: number) {
  const sequence = useRef(0)
  const [state, setState] = useState<{source?: typeof source; revision?: number; value?: Awaited<ReturnType<typeof resolveSource>>; error?: string}>({})
  useEffect(() => {
    const controller = new AbortController()
    const revision = ++sequence.current
    setState({source, revision})
    resolveSource(source, controller.signal, loadSource, format, filename).then(value => {
      if (!controller.signal.aborted) setState({source, revision, value})
    }).catch(error => {if (!controller.signal.aborted) setState({source, revision, error: error instanceof Error ? error.message : 'Не удалось загрузить документ.'})})
    return () => controller.abort()
  }, [source, format, filename, loadSource, retry])
  // Do not show a previous document for a frame after a source change.
  return state.source === source ? state : {}
}
