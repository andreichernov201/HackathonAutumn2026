import { useEffect, useRef, useState } from 'react'
import { errorText, knowledgeApi } from '../api'
import type { ViewerTarget } from '../routing'
import type { KnowledgeDocument, KnowledgeSection, KnowledgeVersion, SectionSummary } from '../types'
export interface KnowledgeDocumentData {document: KnowledgeDocument; version: KnowledgeVersion; versions: KnowledgeVersion[]; items: SectionSummary[]; section?: KnowledgeSection}
export function useKnowledgeDocument(target: ViewerTarget, revision: number) {
  const [state, setState] = useState<{data?: KnowledgeDocumentData; loading: boolean; error?: string}>({loading: false})
  const cache = useRef<{data?: KnowledgeDocumentData; revision: number}>({revision})
  useEffect(() => {
    const controller = new AbortController(), signal = controller.signal
    if (!target.documentId && !target.sectionId) {setState({loading: false}); return () => controller.abort()}
    setState(previous => ({data: previous.data, loading: true}))
    async function load() {
      const previous = cache.current.revision === revision ? cache.current.data : undefined
      const section = target.sectionId ? await knowledgeApi.section(target.sectionId, signal) : undefined
      const id = section?.source.documentId || target.documentId!
      const same = previous?.document.id === id
      const [document, versions] = same ? [previous.document, previous.versions] : await Promise.all([knowledgeApi.get(id, signal), knowledgeApi.versions(id, signal)])
      const versionId = section?.documentVersionId || target.versionId || document.latestVersion.id
      const version = versions.find(item => item.id === versionId)
      if (!version) throw new Error('Редакция не найдена или недоступна.')
      const items = previous?.version.id === versionId ? previous.items : await knowledgeApi.sections(versionId, signal)
      signal.throwIfAborted()
      const data = {document, versions, version, items, section}
      cache.current = {data, revision}; setState({data, loading: false})
    }
    load().catch(error => {if (!signal.aborted) setState({loading: false, error: errorText(error)})})
    return () => controller.abort()
  }, [target.documentId, target.sectionId, target.versionId, revision])
  return state
}
