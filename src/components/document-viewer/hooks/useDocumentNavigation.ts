import { useCallback, useImperativeHandle, useRef, useState, type Ref, type RefObject } from 'react'
import type { DocumentAnnotation, DocumentLocation, DocumentViewerHandle, NavigationResult, ViewerEngine } from '../types'

export function useDocumentNavigation(ref: Ref<DocumentViewerHandle> | undefined, engine: RefObject<ViewerEngine | null>, ready: boolean) {
  const [notice, setNotice] = useState<{text: string; quote?: string; annotation?: DocumentAnnotation}>()
  const run = useRef(0)
  const navigate = useCallback(async (location: DocumentLocation, annotation?: DocumentAnnotation): Promise<NavigationResult> => {
    const id = ++run.current
    if (!ready || !engine.current) return {exact: false, message: 'Документ ещё загружается.'}
    setNotice(undefined)
    let result: NavigationResult
    try {result = await (annotation ? engine.current.highlightAnnotation(annotation) : engine.current.goToLocation(location))}
    catch {result = {exact: false, message: 'Не удалось определить место фрагмента. Показан извлечённый текст.'}}
    if (id === run.current && (!result.exact || annotation)) setNotice({text: annotation ? annotation.message + (!result.exact && result.message ? ` ${result.message}` : '') : result.message || '', quote: !result.exact ? location.quote : undefined, annotation})
    return result
  }, [engine, ready])
  const clear = useCallback(() => {run.current++; engine.current?.clearHighlight(); setNotice(undefined)}, [engine])
  useImperativeHandle(ref, () => ({
    goToPage: page => engine.current?.goToPage(page) || Promise.resolve({exact: false, message: 'Документ ещё загружается.'}),
    goToLocation: location => navigate(location),
    highlightAnnotation: annotation => navigate(annotation.location, annotation),
    clearHighlight: clear,
  }), [engine, navigate, clear])
  return {notice, navigate, clear}
}
