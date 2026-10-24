import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { errorText, knowledgeApi } from './api'
import { categories, type KnowledgeDocument } from './types'

export function UploadDialog({
  document: existing,
  onClose,
  onDone,
}: {
  document?: KnowledgeDocument
  onClose: () => void
  onDone: (document: KnowledgeDocument) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('unverified')
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const file = form.get('file') as File
    if (!file?.size || file.size > 20 * 1024 * 1024) {
      setError('Выберите непустой файл размером до 20 МБ.')
      return
    }
    const text = (name: string) => String(form.get(name) || '').trim()
    const metadata = {
      title: existing?.title || text('title'),
      category: existing?.category || text('category'),
      description: existing?.description || text('description'),
      owner: existing?.owner || text('owner') || null,
      accessLevel: existing?.accessLevel || text('accessLevel'),
      materialNature: existing?.materialNature || text('materialNature'),
      versionLabel: text('versionLabel') || null,
      effectiveFrom: text('effectiveFrom') || null,
      effectiveUntil: text('effectiveUntil') || null,
      status,
      statusEvidence: text('statusEvidence') || null,
    }
    setBusy(true)
    setError('')
    try {
      onDone(await knowledgeApi.upload(file, metadata, existing?.id))
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      className="kb-dialog"
      ref={dialog}
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="kb-dialog-head">
          <div>
            <span className="kb-eyebrow">УПРАВЛЕНИЕ ИСТОЧНИКАМИ</span>
            <h2>{existing ? 'Добавить редакцию' : 'Загрузить документ'}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Закрыть" disabled={busy} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <p className="kb-muted">
          Оригинал и сведения о редакции сохраняются в базе знаний. Указывайте только подтверждённые даты и реквизиты.
        </p>
        {existing ? (
          <p className="kb-note">{existing.title}. Предыдущие редакции и ссылки сохранятся.</p>
        ) : (
          <>
            <label>
              Название документа
              <input name="title" required maxLength={300} />
            </label>
            <div className="kb-form-row">
              <label>
                Категория
                <select name="category" aria-label="Категория">
                  {Object.entries(categories).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Уровень доступа
                <select name="accessLevel" aria-label="Уровень доступа">
                  <option value="internal">Сотрудники организации</option>
                  <option value="restricted">Только администраторы базы</option>
                </select>
              </label>
            </div>
            <label>
              Краткое описание
              <textarea name="description" maxLength={2000} rows={2} />
            </label>
            <div className="kb-form-row">
              <label>
                Владелец, если известен
                <input name="owner" maxLength={200} />
              </label>
              <label>
                Происхождение
                <select name="materialNature" aria-label="Происхождение">
                  <option value="synthetic">Синтетический учебный материал</option>
                  <option value="corporate">Корпоративный документ</option>
                </select>
              </label>
            </div>
          </>
        )}
        <label className="kb-file-field">
          <span>
            <Upload size={19} /> PDF, DOCX или TXT · до 20 МБ
          </span>
          <input name="file" type="file" required accept=".pdf,.docx,.txt" disabled={busy} />
        </label>
        <label>
          Обозначение редакции, если установлено
          <input name="versionLabel" maxLength={100} placeholder="Не установлено" />
        </label>
        <div className="kb-form-row">
          <label>
            Начало действия, если известно
            <input name="effectiveFrom" type="date" required={status === 'active'} />
          </label>
          <label>
            Окончание действия, если известно
            <input name="effectiveUntil" type="date" />
          </label>
        </div>
        <label>
          Подтверждённый статус
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="unverified">Не подтверждён</option>
            <option value="active">Подтверждён метаданными</option>
            <option value="archived">Архивная редакция</option>
          </select>
        </label>
        {status !== 'unverified' && (
          <label>
            Основание подтверждения статуса
            <textarea
              name="statusEvidence"
              required
              maxLength={2000}
              placeholder="Ссылка на решение, реквизиты или другое проверяемое основание"
            />
          </label>
        )}
        <p className="kb-muted">
          Новая загрузка не делает редакцию действующей автоматически. Синтетические материалы кейса не являются
          нормативными актами Банка России.
        </p>
        {error && (
          <p role="alert" className="kb-error">
            {error}
          </p>
        )}
        <div className="kb-dialog-actions">
          <button type="button" className="kb-button" disabled={busy} onClick={onClose}>
            Отмена
          </button>
          <button className="kb-button primary" disabled={busy}>
            {busy ? 'Извлечение и индексация…' : 'Загрузить и проиндексировать'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
