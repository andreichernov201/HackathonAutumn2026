import { Copy, ExternalLink, RefreshCw, Upload } from 'lucide-react'
import { categories, statusLabels, type KnowledgeDocument, type KnowledgeVersion } from './types'
export const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('ru-RU') : 'Не установлена'
export function KnowledgeDocumentInfo({
  document,
  version,
  versions,
  admin,
  onVersion,
  onCopy,
  onUpload,
  onReindex,
  busy,
}: {
  document: KnowledgeDocument
  version: KnowledgeVersion
  versions: KnowledgeVersion[]
  admin: boolean
  onVersion: (id: string) => void
  onCopy: () => void
  onUpload: () => void
  onReindex: () => void
  busy: boolean
}) {
  return (
    <article className="kw-info">
      <h2>Сведения об источнике</h2>
      <h3>{document.title}</h3>
      <p>{document.description || 'Описание не предоставлено.'}</p>
      <label className="kw-edition">
        Редакция документа
        <select aria-label="Редакция документа" value={version.id} onChange={(event) => onVersion(event.target.value)}>
          {versions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.versionLabel || 'Без обозначения'} · добавлена {dateLabel(item.createdAt)} ·{' '}
              {statusLabels[item.status]}
            </option>
          ))}
        </select>
      </label>
      <p className="kw-hint">Последняя загрузка не подтверждает применимость редакции.</p>
      <dl className="kw-info-grid">
        <dt>Категория</dt>
        <dd>{categories[document.category]}</dd>
        <dt>Формат</dt>
        <dd>{version.fileType.toUpperCase()}</dd>
        <dt>Страницы</dt>
        <dd>{version.pageCount || 'Не определены'}</dd>
        <dt>Статус редакции</dt>
        <dd>
          <span className={'kb-status ' + version.status}>{statusLabels[version.status]}</span>
        </dd>
        <dt>Обозначение редакции</dt>
        <dd>{version.versionLabel || 'Не установлено'}</dd>
        <dt>Начало действия</dt>
        <dd>{dateLabel(version.effectiveFrom)}</dd>
        <dt>Окончание действия</dt>
        <dd>{dateLabel(version.effectiveUntil)}</dd>
        <dt>Основание статуса</dt>
        <dd>{version.statusEvidence || 'Не предоставлено'}</dd>
        <dt>Добавлен</dt>
        <dd>{dateLabel(document.createdAt)}</dd>
        <dt>Обновлён</dt>
        <dd>{dateLabel(document.updatedAt)}</dd>
        <dt>Редакция добавлена</dt>
        <dd>{dateLabel(version.createdAt)}</dd>
        <dt>Доступ</dt>
        <dd>{document.accessLevel === 'restricted' ? 'Только администраторы базы' : 'Сотрудники организации'}</dd>
        <dt>Материал</dt>
        <dd>{document.materialNature === 'synthetic' ? 'Синтетический учебный материал' : 'Корпоративный документ'}</dd>
        <dt>Владелец</dt>
        <dd>{document.owner || 'Не указан'}</dd>
        <dt>Исходное имя</dt>
        <dd>{version.filename}</dd>
      </dl>
      <details className="kw-technical">
        <summary>Технические сведения и обработка</summary>
        <dl>
          <dt>SHA-256</dt>
          <dd>{version.checksum}</dd>
          <dt>ID документа</dt>
          <dd>{document.id}</dd>
          <dt>ID редакции</dt>
          <dd>{version.id}</dd>
          <dt>Индексация</dt>
          <dd>{dateLabel(version.indexedAt)}</dd>
          <dt>Извлечение</dt>
          <dd>{version.extractor}</dd>
        </dl>
        {version.extractionWarnings.length ? (
          <ul>
            {version.extractionWarnings.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>Предупреждений обработки нет.</p>
        )}
      </details>
      <div className="kw-info-actions">
        <button className="kb-button" onClick={onCopy}>
          <Copy size={15} /> Скопировать ссылку
        </button>
        <a className="kb-button" href={version.originalUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> Открыть оригинал в новой вкладке
        </a>
        {admin && (
          <>
            <button className="kb-button" onClick={onUpload}>
              <Upload size={15} /> Новая редакция
            </button>
            <button className="kb-button" disabled={busy} onClick={onReindex}>
              <RefreshCw size={15} /> {busy ? 'Индексация…' : 'Обновить индекс'}
            </button>
          </>
        )}
      </div>
    </article>
  )
}
