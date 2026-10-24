import { lazy, Suspense, useEffect, useState } from 'react'
import { documentsApi } from '../features/documents/api'

const DocumentViewer = lazy(() => import('./document-viewer/DocumentViewer').then(module => ({default: module.DocumentViewer})))

export function DocumentLivePreview({projectId, fields}: {projectId: string; fields: Record<string, string>}) {
  const [preview, setPreview] = useState<{projectId: string; blob: Blob}>()
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const blob = preview?.projectId === projectId ? preview.blob : undefined

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setPending(true)
    setError('')
    const timer = setTimeout(async () => {
      try {
        const result = await documentsApi.previewFile(projectId, fields, controller.signal)
        if (active) setPreview({projectId, blob: result})
      } catch (cause) {
        if (active && !controller.signal.aborted) {
          const code = cause instanceof Error ? cause.message : ''
          setError(['invalid_date', 'invalid_option', 'invalid_appointees', 'date_order', 'placeholder_syntax', 'invalid_fields'].includes(code)
            ? 'Проверьте формат заполненных полей, чтобы обновить предпросмотр.'
            : 'Не удалось обновить предпросмотр документа.')
        }
      } finally {
        if (active) setPending(false)
      }
    }, 450)
    return () => {active = false; clearTimeout(timer); controller.abort()}
  }, [projectId, fields])

  return <div className="docs-live-preview" aria-busy={pending}>
    <div className="docs-preview-legend" aria-label="Обозначения полей">
      <span><i className="docs-field-empty" aria-hidden="true"/>Не заполнено</span>
      <span><i className="docs-field-filled" aria-hidden="true"/>Заполнено</span>
    </div>
    <p className="docs-preview-state" role="status">{pending ? 'Обновляем предпросмотр…' : error ? 'Предпросмотр не обновлён' : 'Предпросмотр текущих значений'}</p>
    {error && <p role="alert" className="docs-error">{error}{blob && ' Показана предыдущая версия.'}</p>}
    {blob ? <Suspense fallback={<p>Загрузка просмотрщика…</p>}>
      <DocumentViewer source={blob} filename="preview.docx" documentId={projectId} mode="editor" tools={{download: false}}/>
    </Suspense> : !error && <p className="docs-note">Готовим документ из исходного шаблона…</p>}
    <p className="docs-note">Подсветка отмечает поля формы только в предпросмотре. В скачанном DOCX её не будет.</p>
  </div>
}
