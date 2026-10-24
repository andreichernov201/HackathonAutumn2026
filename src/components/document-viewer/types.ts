import type { ReactNode, Ref } from 'react'

export type ViewerMode = 'knowledge' | 'editor' | 'review'
export type DocumentFormat = 'pdf' | 'docx'
export type DocumentSource = string | Blob | ArrayBuffer | Uint8Array
export type SourceLoader = (url: string, signal: AbortSignal) => Promise<Blob>
export interface DocumentLocation {
  page?: number
  /** A DOCX bookmark, when present in the original. Never a fabricated PDF anchor. */
  sectionId?: string
  quote?: string
  textOffsetStart?: number
  textOffsetEnd?: number
}
export type AnnotationSeverity = 'critical' | 'warning' | 'suggestion' | 'info'
export interface DocumentAnnotation {
  id: string
  severity: AnnotationSeverity
  message: string
  location: DocumentLocation
  suggestedText?: string
  sourceReference?: string
  metadata?: Record<string, string>
  /** Optional visual hint, independent of the semantic location; normalized PDF coordinates. */
  visual?: {page: number; rects: Array<{x: number; y: number; width: number; height: number}>}
}
export interface NavigationResult { exact: boolean; page?: number; message?: string }
export interface DocumentViewerHandle {
  goToPage(page: number): Promise<NavigationResult>
  goToLocation(location: DocumentLocation): Promise<NavigationResult>
  highlightAnnotation(annotation: DocumentAnnotation): Promise<NavigationResult>
  clearHighlight(): void
}
export interface ViewerTools { search?: boolean; download?: boolean; fullscreen?: boolean }
export interface DocumentViewerProps {
  source: DocumentSource
  filename?: string
  format?: DocumentFormat
  mode?: ViewerMode
  /** Keep the same ID across Blob updates to preserve the reading position. */
  documentId?: string
  initialLocation?: DocumentLocation
  loadSource?: SourceLoader
  updating?: boolean
  tools?: ViewerTools
  toolbarExtra?: ReactNode
  className?: string
  onReady?: (info: {format: DocumentFormat; pages: number}) => void
  onLocationChange?: (location: DocumentLocation) => void
  onError?: (message: string) => void
  ref?: Ref<DocumentViewerHandle>
}
export interface SearchState {current: number; total: number; busy: boolean; searched: boolean}
export interface ViewerEngine extends DocumentViewerHandle {
  search(query: string): void
  nextMatch(backward?: boolean): void
}
export interface EngineProps {
  blob: Blob
  scrollRef: React.RefObject<HTMLDivElement | null>
  zoom: number | 'width'
  engineRef: React.RefObject<ViewerEngine | null>
  onReady: (pages: number) => void
  onPage: (page: number) => void
  onScale: (scale: number) => void
  onSearch: (state: SearchState) => void
  onError: (message: string) => void
}
