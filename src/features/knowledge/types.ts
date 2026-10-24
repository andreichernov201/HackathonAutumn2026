export type Category = 'instruction' | 'matrix' | 'guidance' | 'template' | 'other'
export type VersionStatus = 'unverified' | 'active' | 'archived'
export interface KnowledgeVersion {
  id: string; documentId: string; versionLabel: string | null
  effectiveFrom: string | null; effectiveUntil: string | null
  status: VersionStatus; statusEvidence: string | null
  checksum: string; filename: string; fileType: 'pdf' | 'docx' | 'txt'
  pageCount: number | null; createdAt: string; indexedAt: string | null
  processingStatus: 'indexed'; extractionWarnings: string[]; extractor: string; originalUrl: string
}
export interface KnowledgeDocument {
  id: string; title: string; category: Category; description: string; owner: string | null
  accessLevel: 'internal' | 'restricted'; materialNature: 'synthetic' | 'corporate'
  createdAt: string; updatedAt: string; latestVersion: KnowledgeVersion
}
export interface KnowledgeCitation {
  id: string; documentId: string; versionId: string; sectionId: string
  title: string; locator: string; excerpt: string; provenance: 'knowledge'
  sourceReference: string; originalUrl: string; versionLabel: string | null
  status: VersionStatus; checksum: string; materialNature: 'synthetic' | 'corporate'
}
export interface SectionSummary {
  id: string; documentVersionId: string; parentId: string | null; sectionNumber: string | null
  heading: string; locator: string; pageStart: number | null; pageEnd: number | null
  position: number; locatorConfidence: 'numbered' | 'table' | 'fragment'
}
export interface KnowledgeSection extends SectionSummary {
  text: string; table: string[][] | null; source: KnowledgeCitation
}
export interface Page<T> {items: T[]; total: number; limit: number; offset: number}
export interface SearchHit {section: SectionSummary; citation: KnowledgeCitation; snippet: string; score: number; matchReason: 'full_text_fts5'}
export interface KnowledgeSession {mode: 'demo'; role: 'reader' | 'knowledge_admin'; adminConfigured: boolean; corporateAuthentication: false}
export const categories: Record<Category, string> = {instruction: 'Инструкции', matrix: 'Матрицы', guidance: 'Методические рекомендации', template: 'Шаблоны', other: 'Другие документы'}
export const statusLabels: Record<VersionStatus, string> = {unverified: 'Не подтверждён', active: 'Подтверждён метаданными', archived: 'Архивная редакция'}
