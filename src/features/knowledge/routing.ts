export type KnowledgeTab = 'view' | 'contents' | 'info'
export interface ViewerTarget {documentId?: string; sectionId?: string; versionId?: string; tab?: KnowledgeTab}
export function readKnowledgeTarget(hash = window.location.hash): ViewerTarget {
  const [path, query = ''] = hash.split('?')
  const match = path.match(/^#knowledge\/(sections|documents)\/([\w-]+)$/)
  const params = new URLSearchParams(query), tab = params.get('tab')
  return {...match ? match[1] === 'sections' ? {sectionId: match[2]} : {documentId: match[2]} : {},
    versionId: params.get('version') || undefined,
    tab: tab === 'contents' || tab === 'info' ? tab : 'view'}
}
export function knowledgeHash(target: ViewerTarget) {
  const path = target.sectionId ? `#knowledge/sections/${encodeURIComponent(target.sectionId)}` : target.documentId ? `#knowledge/documents/${encodeURIComponent(target.documentId)}` : '#knowledge'
  const params = new URLSearchParams()
  if (target.versionId && !target.sectionId) params.set('version', target.versionId)
  if (target.tab && target.tab !== 'view') params.set('tab', target.tab)
  return path + (params.size ? '?' + params.toString() : '')
}
