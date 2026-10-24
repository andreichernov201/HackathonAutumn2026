import { lazy, Suspense, useEffect, useState } from 'react'
import { documentsApi } from '../features/documents/api'
import type { DocumentFieldEditing, DocumentViewerHandle } from './document-viewer/types'
import { Button, LoadingState } from './ui'
import type { Ref } from 'react'
const DocumentViewer = lazy(() =>
  import('./document-viewer/DocumentViewer').then((module) => ({
    default: module.DocumentViewer,
  })),
)

export function DocumentLivePreview({
  projectId,
  fields,
  fieldEditing,
  editing,
  viewerRef,
}: {
  projectId: string
  fields: Record<string, string>
  fieldEditing?: DocumentFieldEditing
  editing?: boolean
  viewerRef?: Ref<DocumentViewerHandle>
}) {
  const [preview, setPreview] = useState<{ projectId: string; blob: Blob }>()
  const [pending, setPending] = useState(true)
  const [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  const blob = preview?.projectId === projectId ? preview.blob : undefined
  useEffect(() => {
    if (editing) return
    const controller = new AbortController()
    let active = true
    setPending(true)
    setError('')
    const timer = setTimeout(async () => {
      try {
        const result = await documentsApi.previewFile(projectId, fields, controller.signal)
        if (active) setPreview({ projectId, blob: result })
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          const code = cause instanceof Error ? cause.message : ''
          setError(
            [
              'invalid_date',
              'invalid_option',
              'invalid_appointees',
              'date_order',
              'placeholder_syntax',
              'invalid_fields',
            ].includes(code)
              ? 'Проверьте формат отмеченных полей, чтобы обновить документ.'
              : 'Не удалось обновить документ. Попробуйте ещё раз.',
          )
        }
      } finally {
        if (active) setPending(false)
      }
    }, 450)
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [projectId, fields, editing, retry])
  return (
    <div className="docs-live-preview">
      <div className="docs-preview-state" role="status">
        {editing
          ? 'Редактирование поля'
          : pending
            ? 'Обновление документа…'
            : error
              ? blob
                ? 'Показана предыдущая версия'
                : 'Документ не загружен'
              : 'Поля выделены синим · Tab — следующее поле'}
      </div>
      {error && (
        <p role="alert" className="error-state">
          {error}
          <Button onClick={() => setRetry((value) => value + 1)}>Повторить</Button>
        </p>
      )}
      {blob ? (
        <Suspense fallback={<LoadingState />}>
          <DocumentViewer
            ref={viewerRef}
            source={blob}
            filename="preview.docx"
            documentId={projectId}
            mode="editor"
            fieldEditing={fieldEditing}
            tools={{ download: false }}
          />
        </Suspense>
      ) : (
        !error && <LoadingState>Открываем исходный шаблон…</LoadingState>
      )}
    </div>
  )
}
