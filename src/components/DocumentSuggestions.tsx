import { useEffect, useState } from 'react'
import { editorApi, type DocumentModel } from '../features/documents/editor'
import { Button, EmptyState, ErrorState } from './ui'
export function DocumentSuggestions({
  projectId,
  version,
  dirty,
  onApplied,
}: {
  projectId: string
  version: number
  dirty: boolean
  onApplied: () => Promise<void>
}) {
  const [model, setModel] = useState<DocumentModel>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [drafts, setDrafts] = useState<Record<string, string>>({})
  useEffect(() => {
    const controller = new AbortController()
    editorApi
      .get(projectId, controller.signal)
      .then(setModel)
      .catch(() => {
        if (!controller.signal.aborted) setError('Не удалось загрузить предложения.')
      })
    return () => controller.abort()
  }, [projectId, version])
  async function respond(id: string, accept: boolean) {
    if (!model) return
    setBusy(true)
    setError('')
    try {
      setModel(
        await editorApi.apply({
          document_id: projectId,
          base_version: model.version,
          operation: accept ? 'accept_suggestion' : 'reject_suggestion',
          suggestion_id: id,
          ...(accept && drafts[id] !== undefined ? { value: drafts[id] } : {}),
        }),
      )
      await onApplied()
    } catch {
      setError('Предложение не применено. Проверьте актуальность документа и повторите действие.')
    } finally {
      setBusy(false)
    }
  }
  const pending = model?.suggestions.filter((s) => s.status === 'pending') || []
  return (
    <div className="document-suggestions">
      <h3>Предложения</h3>
      {error && <ErrorState>{error}</ErrorState>}
      {pending.length
        ? pending.map((item) => (
            <article className="suggestion-card" key={item.id}>
              <span className="docs-kicker">
                {item.base_version === version ? 'На рассмотрении' : 'Для предыдущей версии'}
              </span>
              <h4>Исходный текст</h4>
              <p>{item.original || 'Пустое поле'}</p>
              <h4>Предлагаемый текст</h4>
              <textarea
                aria-label="Предлагаемый текст"
                maxLength={4000}
                rows={5}
                value={drafts[item.id] ?? item.proposed}
                disabled={busy || dirty || item.base_version !== version}
                onChange={(event) => setDrafts((values) => ({ ...values, [item.id]: event.target.value }))}
              />
              {item.reason && <p className="docs-note">{item.reason}</p>}
              {item.source && (
                <a href={item.source.sourceReference}>
                  {item.source.title} · {item.source.locator} · {item.source.versionLabel || 'Редакция не установлена'}
                </a>
              )}
              <div>
                <Button
                  disabled={busy || dirty || item.base_version !== version}
                  onClick={() => void respond(item.id, true)}
                >
                  Принять
                </Button>
                <Button disabled={busy || dirty} onClick={() => void respond(item.id, false)}>
                  Отклонить
                </Button>
              </div>
            </article>
          ))
        : model && (
            <EmptyState title="Предложений нет">Изменения содержательных полей требуют вашего решения.</EmptyState>
          )}
    </div>
  )
}
