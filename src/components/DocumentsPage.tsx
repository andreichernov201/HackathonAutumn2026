import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Download, FilePlus2, List, PanelRight, Search, ShieldCheck, Undo2 } from 'lucide-react'
import { documentsApi } from '../features/documents/api'
import type { DocumentProject, DocumentTemplate } from '../features/documents/types'
import type { DocumentViewerHandle } from './document-viewer/types'
import { DocumentInspector, type Panel } from './DocumentInspector'
import { DocumentLivePreview } from './DocumentLivePreview'
import { Button, EmptyState, ErrorState, LoadingState, PageHeader } from './ui'
const errors: Record<string, string> = {
  version_conflict:
    'Документ изменился в другом окне. Ваши правки сохранены на экране. Сравните их с актуальной версией.',
  validation_failed: 'Проверьте обязательные поля и формат значений.',
  source_not_ready: 'Исходный документ недоступен.',
  csrf_required: 'Обновите страницу, чтобы продолжить.',
  invalid_fields: 'Значение поля не соответствует шаблону.',
  invalid_date: 'Укажите корректную дату.',
  placeholder_syntax: 'Уберите квадратные скобки и подсказки из значений полей.',
}
interface Props {
  initialProjectId?: string
  initialProject?: DocumentProject
  openVersion?: number
  onOpenChat: (project: DocumentProject) => void
}
export function DocumentsPage({ initialProjectId, initialProject, openVersion, onOpenChat }: Props) {
  const [loading, setLoading] = useState(true),
    [templates, setTemplates] = useState<DocumentTemplate[]>([]),
    [projects, setProjects] = useState<DocumentProject[]>([])
  const [project, setProject] = useState<DocumentProject | null>(null),
    [search, setSearch] = useState(''),
    [error, setError] = useState('')
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false),
    [panelOpen, setPanelOpen] = useState(true)
  const [panel, setPanel] = useState<Panel>('properties'),
    [selected, setSelected] = useState(''),
    [editing, setEditing] = useState(false)
  const [undo, setUndo] = useState<Record<string, string>[]>([]),
    [conflict, setConflict] = useState<DocumentProject>()
  const revision = useRef(0),
    current = useRef(project),
    viewer = useRef<DocumentViewerHandle>(null),
    saveRef = useRef<() => void>(() => {})
  current.current = project
  const template = templates.find((item) => item.templateId === project?.templateId)
  const fields = template?.fields || []
  function showError(cause: unknown) {
    const code = cause instanceof Error ? cause.message : String(cause)
    setError(errors[code] || 'Не удалось выполнить действие. Проверьте соединение и попробуйте снова.')
  }
  async function load() {
    const [ts, ps] = await Promise.all([documentsApi.templates(), documentsApi.projects()])
    setTemplates(ts)
    setProjects(ps)
  }
  useEffect(() => {
    let active = true
    documentsApi
      .session()
      .then(async () => {
        await load()
        if (initialProject) {
          if (active) open(initialProject)
        } else if (initialProjectId) {
          const next = await documentsApi.get(initialProjectId)
          if (active && (current.current?.projectId !== next.projectId || (!dirty && current.current?.version !== next.version))) open(next)
        }
      })
      .catch(showError)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [initialProjectId, initialProject, openVersion])
  useEffect(() => {
    if (!project || editing) return
    const id = project.projectId,
      snapshot = project.fields
    const controller = new AbortController()
    const timer = setTimeout(() => {
      documentsApi
        .preview(id, snapshot, controller.signal)
        .then((result) => setProject((p) => (p?.projectId === id && p.fields === snapshot ? { ...p, ...result } : p)))
        .catch((cause) => {
          if (!controller.signal.aborted) showError(cause)
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [project?.projectId, project?.fields, editing])
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', unload)
    return () => window.removeEventListener('beforeunload', unload)
  }, [dirty])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && current.current) {
        event.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  function open(next: DocumentProject) {
    if (dirty && !window.confirm('Открыть другой документ и отменить несохранённые изменения?')) return
    setProject(next)
    setDirty(false)
    setError('')
    setUndo([])
    setSelected('')
    setPanel('properties')
    setEditing(false)
    setConflict(undefined)
  }
  async function create(templateId: string, copy?: DocumentProject) {
    setBusy(true)
    setError('')
    try {
      let next = await documentsApi.create(templateId, copy ? `${copy.title} (копия)`.slice(0, 200) : undefined)
      if (copy) next = await documentsApi.patch(next.projectId, next.version, copy.fields)
      open(next)
      await load()
    } catch (cause) {
      showError(cause)
    } finally {
      setBusy(false)
    }
  }
  function editField(key: string, value: string) {
    const p = current.current
    if (!p || p.fields[key] === value) return
    setUndo((history) => [...history.slice(-49), p.fields])
    revision.current++
    setDirty(true)
    const next = { ...p, fields: { ...p.fields, [key]: value } }
    current.current = next
    setProject(next)
  }
  async function saveAll(): Promise<DocumentProject | undefined> {
    const snapshot = current.current
    if (!snapshot || saving) return
    const rev = revision.current
    setSaving(true)
    setError('')
    try {
      const next = await documentsApi.patch(snapshot.projectId, snapshot.version, snapshot.fields, snapshot.title)
      setProject((p) =>
        p?.projectId !== next.projectId
          ? p
          : revision.current !== rev
            ? {
                ...next,
                title: p.title,
                fields: p.fields,
                preview: p.preview,
                validation: p.validation,
              }
            : next,
      )
      setProjects((ps) => ps.map((item) => (item.projectId === next.projectId ? next : item)))
      if (current.current?.projectId === snapshot.projectId) {
        setDirty(revision.current !== rev)
        setConflict(undefined)
      }
      return next
    } catch (cause) {
      if (current.current?.projectId === snapshot.projectId) {
        showError(cause)
        if (cause instanceof Error && cause.message === 'version_conflict') {
          try {
            const next = await documentsApi.get(snapshot.projectId)
            if (current.current?.projectId === next.projectId) setConflict(next)
          } catch (reloadError) {
            showError(reloadError)
          }
        }
      }
      return undefined
    } finally {
      setSaving(false)
    }
  }
  saveRef.current = () => {
    void saveAll()
  }
  async function action(kind: 'validate' | 'generate') {
    const snapshot = current.current
    if (!snapshot || dirty || saving || busy) return
    const rev = revision.current
    setBusy(true)
    setError('')
    try {
      const next = await documentsApi[kind](snapshot.projectId)
      setProject((p) =>
        p?.projectId !== next.projectId
          ? p
          : revision.current !== rev
            ? {
                ...next,
                title: p.title,
                fields: p.fields,
                preview: p.preview,
                validation: p.validation,
              }
            : next,
      )
      if (kind === 'validate' && current.current?.projectId === snapshot.projectId) {
        setPanel('issues')
        setPanelOpen(true)
      }
      await load()
    } catch (cause) {
      showError(cause)
    } finally {
      setBusy(false)
    }
  }
  function selectField(key: string, navigate = false) {
    setSelected(key)
    setPanel('properties')
    setPanelOpen(true)
    if (navigate) void viewer.current?.goToLocation({ sectionId: `field:${key}` })
  }
  if (loading) return <LoadingState>Открываем документы…</LoadingState>
  if (!project)
    return (
      <section className="docs-page docs-catalog-page">
        <PageHeader title="Документы" description="Шаблоны и проекты в одном рабочем пространстве" />
        {error && (
          <ErrorState>
            {error}
            <Button
              onClick={() => {
                setError('')
                void load().catch(showError)
              }}
            >
              Повторить
            </Button>
          </ErrorState>
        )}
        <div className="docs-section-head">
          <h2>
            Мои проекты <span>{projects.length}</span>
          </h2>
        </div>
        {projects.length ? (
          <div className="docs-project-list">
            {projects.map((item) => (
              <article className="docs-project-row" key={item.projectId}>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    Версия {item.version} · {new Date(item.updatedAt).toLocaleString('ru-RU')}
                  </small>
                </div>
                <div>
                  <Button onClick={() => open(item)}>Открыть</Button>
                  <Button disabled={busy} onClick={() => void create(item.templateId, item)}>
                    Дублировать
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Начните с шаблона">Созданные документы появятся здесь.</EmptyState>
        )}
        <div className="docs-section-head">
          <h2>Создать по шаблону</h2>
          <label className="docs-search">
            <Search size={16} />
            <input
              aria-label="Поиск по модулям"
              placeholder="Найти шаблон"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="docs-catalog">
          {templates
            .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
            .map((item) => (
              <article className="docs-card" key={item.templateId}>
                <span className="docs-kicker">{item.kind}</span>
                <h3>{item.title}</h3>
                <p>
                  {item.sourceStatus === 'ready'
                    ? 'Заполнение реквизитов с сохранением исходного оформления'
                    : 'Исходный документ недоступен'}
                </p>
                {item.sourceStatus === 'ready' && (
                  <Button variant="secondary" disabled={busy} onClick={() => void create(item.templateId)}>
                    <FilePlus2 size={16} />
                    Создать проект
                  </Button>
                )}
              </article>
            ))}
        </div>
        {!templates.filter((item) => item.title.toLowerCase().includes(search.toLowerCase())).length && (
          <EmptyState title="Шаблоны не найдены">Измените поисковый запрос.</EmptyState>
        )}
        <p className="docs-note">
          Шаблоны из учебных материалов кейса. Актуальность редакции проверяйте по реестру организации.
        </p>
      </section>
    )
  return (
    <section className="docs-editor" aria-label="Редактор документа">
      <header className="docs-editor-head">
        <Button
          variant="ghost"
          aria-label="Каталог и проекты"
          onClick={() => {
            if (!dirty || window.confirm('Вернуться в каталог и отменить несохранённые изменения?')) {
              setProject(null)
              setDirty(false)
              setError('')
            }
          }}
        >
          <ArrowLeft size={17} />
        </Button>
        <div className="docs-title">
          <input
            aria-label="Название проекта"
            maxLength={200}
            value={project.title}
            onChange={(e) => {
              revision.current++
              setProject({ ...project, title: e.target.value })
              setDirty(true)
            }}
          />
          <small role="status">
            Версия {project.version} · {saving ? 'Сохранение…' : dirty ? 'Есть несохранённые изменения' : 'Сохранено'}
          </small>
        </div>
        <Button onClick={() => onOpenChat(project)} disabled={dirty || saving}>
          Открыть в чате
        </Button>
        <Button variant="primary" onClick={() => void saveAll()} disabled={saving || busy}>
          <Check size={16} />
          Сохранить
        </Button>
        <Button
          variant="ghost"
          aria-label={panelOpen ? 'Скрыть свойства' : 'Показать свойства'}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <PanelRight size={18} />
        </Button>
      </header>
      <div className="docs-editor-toolbar" role="toolbar" aria-label="Действия документа">
        <Button
          variant="ghost"
          aria-label="Отменить правку поля"
          disabled={!undo.length}
          onClick={() => {
            const previous = undo[undo.length - 1]
            if (previous) {
              revision.current++
              setProject({ ...project, fields: previous })
              setUndo(undo.slice(0, -1))
              setDirty(true)
            }
          }}
        >
          <Undo2 size={16} />
        </Button>
        <span className="toolbar-divider" />
        <Button onClick={() => void action('validate')} disabled={busy || dirty || saving}>
          <ShieldCheck size={16} />
          Проверить
        </Button>
        <Button onClick={() => void action('generate')} disabled={busy || dirty || saving || !project.validation.ready}>
          Сформировать DOCX
        </Button>
        {project.artifacts[0] && (
          <Button
            onClick={() =>
              documentsApi
                .download(project.projectId, project.artifacts[0].artifactId, project.artifacts[0].filename)
                .catch(showError)
            }
          >
            <Download size={16} />
            Скачать версию {project.artifacts[0].projectVersion}
          </Button>
        )}
        <span className="toolbar-spacer" />
        <span className="docs-completion">
          {project.validation.completed} из {project.validation.total} полей
        </span>
        <Button
          variant="ghost"
          aria-label="Структура документа"
          onClick={() => {
            setPanel('structure')
            setPanelOpen(true)
          }}
        >
          <List size={17} />
        </Button>
      </div>
      {error && (
        <ErrorState>
          {error}
          {conflict && (
            <div className="conflict-review">
              <p>
                На сервере: «{conflict.title}», версия {conflict.version}.
              </p>
              <dl>
                {fields
                  .filter((f) => conflict.fields[f.key] !== project.fields[f.key])
                  .map((f) => (
                    <div key={f.key}>
                      <dt>{f.label}</dt>
                      <dd>На сервере: {conflict.fields[f.key] || 'Пусто'}</dd>
                      <dd>Ваша правка: {project.fields[f.key] || 'Пусто'}</dd>
                    </div>
                  ))}
              </dl>
              <Button
                onClick={() => {
                  revision.current++
                  setProject({ ...project, version: conflict.version })
                  setConflict(undefined)
                  setError('')
                  setDirty(true)
                }}
              >
                Оставить мои правки для сохранения
              </Button>
              <Button
                onClick={() => {
                  if (window.confirm('Заменить правки версией с сервера?')) {
                    setDirty(false)
                    setProject(conflict)
                    setConflict(undefined)
                    setError('')
                    setUndo([])
                  }
                }}
              >
                Загрузить версию сервера
              </Button>
            </div>
          )}
        </ErrorState>
      )}
      <div className={`docs-workspace ${panelOpen ? 'has-panel' : ''}`}>
        <div className="docs-document">
          <DocumentLivePreview
            projectId={project.projectId}
            fields={project.fields}
            editing={editing}
            viewerRef={viewer}
            fieldEditing={
              template
                ? {
                    specs: fields,
                    values: project.fields,
                    onChange: editField,
                    onSelect: (key) => selectField(key),
                    onEditing: setEditing,
                    onSave: () => saveRef.current(),
                    onConstraintError: setError,
                  }
                : undefined
            }
          />
        </div>
        {panelOpen && (
          <DocumentInspector
            project={project}
            fields={fields}
            selected={selected}
            panel={panel}
            dirty={dirty}
            saving={saving}
            setPanel={setPanel}
            onClose={() => setPanelOpen(false)}
            selectField={selectField}
            editField={editField}
            onOpenChat={onOpenChat}
            showError={showError}
            onApplied={async () => {
              const next = await documentsApi.get(project.projectId)
              setProject((p) =>
                p?.projectId !== next.projectId
                  ? p
                  : p.fields !== project.fields || p.title !== project.title
                    ? { ...next, fields: p.fields, title: p.title, preview: p.preview, validation: p.validation }
                    : next,
              )
              await load()
            }}
          />
        )}
      </div>
      <footer className="docs-editor-status">
        <span>Черновик · Без подписи</span>
        <span>Оформление исходного шаблона · Подсветка не печатается</span>
      </footer>
    </section>
  )
}
