import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { DocumentProject, FieldSpec } from '../features/documents/types'
import { documentsApi } from '../features/documents/api'
import { DocumentSuggestions } from './DocumentSuggestions'
import { Button, EmptyState, LoadingState, SegmentedControl } from './ui'
const DocumentViewer = lazy(() =>
  import('./document-viewer/DocumentViewer').then((module) => ({ default: module.DocumentViewer })),
)
export type Panel = 'properties' | 'structure' | 'issues' | 'assistant'
const panels: { value: Panel; label: string }[] = [
  { value: 'properties', label: 'Свойства' },
  { value: 'structure', label: 'Структура' },
  { value: 'issues', label: 'Замечания' },
  { value: 'assistant', label: 'Помощник' },
]
function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: string; onChange: (value: string) => void }) {
  const props = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(e.target.value),
    'aria-label': spec.label,
  }
  return spec.multiline ? (
    <textarea {...props} maxLength={4000} rows={5} />
  ) : spec.inputType === 'select' ? (
    <select {...props}>
      <option value="">Выберите значение</option>
      {spec.options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  ) : (
    <input {...props} type={spec.inputType} maxLength={4000} />
  )
}
interface InspectorProps {
  project: DocumentProject
  fields: FieldSpec[]
  selected: string
  panel: Panel
  dirty: boolean
  saving: boolean
  setPanel: (panel: Panel) => void
  onClose: () => void
  selectField: (key: string, navigate?: boolean) => void
  editField: (key: string, value: string) => void
  onOpenChat: (project: DocumentProject) => void
  showError: (cause: unknown) => void
  onApplied: () => Promise<void>
}
export function DocumentInspector({
  project,
  fields,
  selected,
  panel,
  dirty,
  saving,
  setPanel,
  onClose,
  selectField,
  editField,
  onOpenChat,
  showError,
  onApplied,
}: InspectorProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0
  }, [selected, panel])
  const selectedSpec = fields.find((spec) => spec.key === selected)
  return (
    <aside className="docs-inspector" aria-label="Контекстная панель">
      <div className="inspector-heading">
        <strong>Документ</strong>
        <Button variant="ghost" aria-label="Закрыть контекстную панель" onClick={() => onClose()}>
          <X size={16} />
        </Button>
      </div>
      <SegmentedControl value={panel} items={panels} onChange={setPanel} label="Режим контекстной панели" />
      <div className="inspector-body" ref={body}>
        {panel === 'properties' && (
          <>
            <h2>{selectedSpec ? 'Выбранное поле' : 'Реквизиты документа'}</h2>
            {selectedSpec && (
              <div className="field-editor" key={selectedSpec.key}>
                <label>
                  {selectedSpec.label}
                  {selectedSpec.required ? ' *' : ''}
                  <FieldInput
                    spec={selectedSpec}
                    value={project.fields[selectedSpec.key] || ''}
                    onChange={(value) => editField(selectedSpec.key, value)}
                  />
                </label>
                <p>{selectedSpec.required ? 'Обязательное поле' : 'Необязательное поле'} · До 4000 символов</p>
                <small>{selectedSpec.section}</small>
              </div>
            )}
            <p className="docs-note">Выберите выделенное поле в документе или реквизит из списка.</p>
            <div className="inspector-field-list">
              {fields.map((spec) => (
                <button
                  key={spec.key}
                  data-field-key={spec.key}
                  className={selected === spec.key ? 'selected' : ''}
                  onClick={() => selectField(spec.key, true)}
                >
                  <span>
                    {spec.label}
                    {spec.required && ' *'}
                  </span>
                  <small>{project.fields[spec.key] || 'Не заполнено'}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {panel === 'structure' && (
          <>
            <h2>Структура и реквизиты</h2>
            {[...new Set(fields.map((f) => f.section))].map((section) => (
              <div className="structure-group" key={section}>
                <h3>{section}</h3>
                {fields
                  .filter((f) => f.section === section)
                  .map((spec) => (
                    <button key={spec.key} onClick={() => selectField(spec.key, true)}>
                      {spec.label}
                    </button>
                  ))}
              </div>
            ))}
            <p className="docs-note">Постоянные положения защищены исходным шаблоном.</p>
          </>
        )}
        {panel === 'issues' && (
          <>
            <h2>Проверка реквизитов</h2>
            <p className="docs-note">
              Проверяются обязательные поля, даты и правила шаблона. Соответствие нормативным требованиям отдельно не
              оценивалось.
            </p>
            {project.validation.issues.length ? (
              <div className="issue-list">
                {project.validation.issues.map((issue, i) => (
                  <button
                    key={`${issue.field}-${i}`}
                    disabled={!issue.field}
                    onClick={() => issue.field && selectField(issue.field, true)}
                  >
                    <span className="issue-category">Реквизиты</span>
                    <span>{issue.message}</span>
                    {issue.field && <small>Перейти к полю →</small>}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="Реквизиты заполнены">Документ готов к формированию DOCX.</EmptyState>
            )}
          </>
        )}
        {panel === 'assistant' && (
          <>
            <h2>Контекст документа</h2>
            <DocumentSuggestions
              projectId={project.projectId}
              version={project.version}
              dirty={dirty}
              onApplied={onApplied}
            />
            <p className="docs-note">
              Обсудите документ в диалоге и обратитесь к подтверждённым источникам базы знаний.
            </p>
            <Button disabled={dirty || saving} onClick={() => onOpenChat(project)}>
              Открыть в чате
            </Button>
            {dirty && <p className="docs-note">Сохраните изменения перед переходом.</p>}
            <div className="inspector-details">
              <h3>Последние версии</h3>
              {project.artifacts.length ? (
                project.artifacts.map((item) => (
                  <Button
                    key={item.artifactId}
                    onClick={() =>
                      documentsApi.download(project.projectId, item.artifactId, item.filename).catch(showError)
                    }
                  >
                    Версия {item.projectVersion} · {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                  </Button>
                ))
              ) : (
                <p className="docs-note">После формирования DOCX здесь появится сохранённая версия.</p>
              )}
            </div>
          </>
        )}
        {project.artifacts[0] && (
          <div className="docs-artifact-preview">
            <Button aria-expanded={previewOpen} onClick={() => setPreviewOpen((v) => !v)}>
              {previewOpen ? 'Закрыть просмотр DOCX' : 'Просмотреть DOCX'}
            </Button>
            {previewOpen && (
              <>
                <p className="docs-note">Сохранённый DOCX · версия {project.artifacts[0].projectVersion}</p>
                <Suspense fallback={<LoadingState />}>
                  <DocumentViewer
                    source={documentsApi.artifactUrl(project.projectId, project.artifacts[0].artifactId)}
                    filename={project.artifacts[0].filename}
                    documentId={`${project.projectId}-artifact`}
                    mode="editor"
                  />
                </Suspense>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
