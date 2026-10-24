import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, FilePlus2, Search, ShieldAlert } from 'lucide-react'
import { documentsApi } from '../features/documents/api'
import type { DocumentProject, DocumentTemplate } from '../features/documents/types'

const DocumentViewer = lazy(() => import('./document-viewer/DocumentViewer').then(module => ({default: module.DocumentViewer})))

const statusLabel = {awaiting_source: 'Ожидает исходный DOCX', awaiting_review: 'Ожидает проверки', awaiting_schema: 'Схема готовится', ready: 'Источник подключён'}
const errorLabel: Record<string,string> = { version_conflict: 'Проект изменился в другом окне. Сравните правки перед повторным сохранением.', validation_failed: 'Заполните обязательные поля и проверьте источник.', source_not_ready: 'Исходный DOCX ещё не готов.', csrf_required: 'Сеанс изменился. Обновите страницу.' }

interface Props { initialProjectId?: string; openVersion?: number; onOpenChat: (project: DocumentProject) => void }
export function DocumentsPage({initialProjectId, openVersion, onOpenChat}: Props) {
  const [loading, setLoading] = useState(true)
  const editRevision = useRef(0)
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [projects, setProjects] = useState<DocumentProject[]>([])
  const [project, setProject] = useState<DocumentProject | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saveState, setSaveState] = useState('')
  const template = templates.find(item => item.templateId === project?.templateId)

  async function load(openId?: string) {
    const [nextTemplates, nextProjects] = await Promise.all([documentsApi.templates(), documentsApi.projects()])
    setTemplates(nextTemplates); setProjects(nextProjects)
    if (openId) setProject(await documentsApi.get(openId))
  }
  useEffect(() => { if (!initialProjectId) setProject(null); documentsApi.session().then(() => load(initialProjectId)).catch(showError).finally(() => setLoading(false)) }, [initialProjectId, openVersion])
  useEffect(() => {
    if (!project) return
    const id = project.projectId, snapshot = project.fields
    const timer = setTimeout(() => { documentsApi.preview(id, snapshot).then(result => setProject(current => current?.projectId === id && current.fields === snapshot ? {...current, preview: result.preview, validation: result.validation} : current)).catch(() => {}) }, 120)
    return () => clearTimeout(timer)
  }, [project?.projectId, project?.fields])
  function showError(cause: unknown) { const text = cause instanceof Error ? cause.message : String(cause); setError(errorLabel[text] || text) }
  async function create(templateId: string, copy?: DocumentProject) {
    setBusy(true); setError('')
    try {
      let next = await documentsApi.create(templateId, copy ? `${copy.title} (копия)` : undefined)
      if (copy && Object.keys(copy.fields).length) next = await documentsApi.patch(next.projectId, next.version, copy.fields)
      setProject(next); await load(); setSaveState('Сохранено')
    } catch(cause) {showError(cause)} finally {setBusy(false)}
  }
  function editField(key: string, value: string) {
    if (!project) return
    editRevision.current += 1
    const current = project
    setProject({...current, fields: {...current.fields, [key]: value}})
    setSaveState('Есть несохранённые изменения')
  }
  async function saveAll() {
    if (!project) return
    const revision = editRevision.current
    const snapshot = project
    setSaveState('Сохранение…')
    try {const next = await documentsApi.patch(snapshot.projectId, snapshot.version, snapshot.fields, snapshot.title); setProject(current => current?.projectId === next.projectId && editRevision.current !== revision ? {...next, title: current.title, fields: current.fields, preview: current.preview, validation: current.validation} : next); setProjects(p => p.map(item => item.projectId === next.projectId ? next : item)); setSaveState(editRevision.current === revision ? 'Сохранено' : 'Есть несохранённые изменения'); setError('')} catch(cause) {setSaveState('Не сохранено'); showError(cause)}
  }
  async function action(kind: 'validate' | 'generate') {
    if (!project) return
    const revision = editRevision.current
    const snapshot = project
    setBusy(true); setError('')
    try { const next = await documentsApi[kind](snapshot.projectId); setProject(current => current?.projectId !== next.projectId ? current : editRevision.current !== revision ? {...next, title: current.title, fields: current.fields, preview: current.preview, validation: current.validation} : next); await load(); } catch(cause) {showError(cause)} finally {setBusy(false)}
  }
  if (loading) return <div className="docs-page"><h1>Документы</h1><p>Загружаем рабочее пространство…</p></div>
  return <div className="docs-page">
    <div className="docs-heading"><div><span className="section-overline">Рабочее пространство</span><h1>Документы</h1><p>Демо-пространство этого браузера: проекты сохраняются на сервере и привязаны к устройству. Подписи, визы и номер не присваиваются.</p></div>{project && <button className="docs-secondary" onClick={() => {setProject(null); setError('')}}><ArrowLeft size={16}/> Каталог и проекты</button>}</div>
    {error && <div role="alert" className="docs-error">{error}{error.includes('другом окне') && project && <button className="docs-secondary" onClick={() => documentsApi.get(project.projectId).then(next => {setProject(next); setSaveState('Загружена версия сервера'); setError('')}).catch(showError)}>Загрузить версию сервера</button>}</div>}
    {!project ? <>
      <div className="docs-section-head"><h2>Каталог модулей</h2><label className="docs-search"><Search size={16}/><input aria-label="Поиск по модулям" placeholder="Найти модуль" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      <div className="docs-catalog">{templates.filter(item => item.title.toLowerCase().includes(search.toLowerCase())).map(item => <article className="docs-card" key={item.templateId}><span className="docs-kicker">{item.kind}</span><h3>{item.title}</h3><p>{item.note}</p><div className="docs-card-meta"><span>{statusLabel[item.sourceStatus]}</span><span>Реестр: не проверен</span><span>Файл: SHA-256 {item.sourceSha256?.slice(0, 12) || 'нет'}</span></div><button className="docs-primary" disabled={busy || item.sourceStatus !== 'ready'} onClick={() => void create(item.templateId)}><FilePlus2 size={16}/> {item.sourceStatus === 'ready' ? 'Создать проект' : 'Ожидает схему'}</button></article>)}</div>
      <p className="docs-note">Семь исходных модулей загружены из синтетического кейса. Схемы заполнения работают с копиями DOCX. Статус редакций в реестре не подтверждён; приложение к приказу об утверждении локального акта готовится отдельно.</p>
      <div className="docs-section-head"><h2>Мои проекты</h2><span>{projects.length}</span></div>
      {projects.length ? <div className="docs-project-list">{projects.map(item => <article className="docs-project-row" key={item.projectId}><div><strong>{item.title}</strong><small>{item.status === 'generated' ? 'Черновик с DOCX' : 'Черновик'} · версия {item.version} · {new Date(item.updatedAt).toLocaleString('ru-RU')}</small></div><div><button className="docs-secondary" onClick={() => {setProject(item); setSaveState('Сохранено')}}>Открыть</button><button className="docs-secondary" disabled={busy} onClick={() => void create(item.templateId, item)}>Дублировать</button></div></article>)}</div> : <p className="docs-note">Сохранённых проектов пока нет.</p>}
    </> : <>
      <div className="docs-editor-head"><div><span className="docs-kicker">ЧЕРНОВИК · БЕЗ ПОДПИСИ</span><h2>{project.title}</h2><small>Проект {project.projectId} · версия {project.version} · {saveState || 'Сохранено'} · статус в реестре не подтверждён</small></div><button className="docs-secondary" disabled={saveState.includes('несохранённые')} onClick={() => onOpenChat(project)}>Открыть в чате</button></div>
      <div className="docs-progress"><div><strong>{project.validation.completed} из {project.validation.total}</strong> обязательных полей</div><progress value={project.validation.completed} max={project.validation.total}/><span>{statusLabel[project.sourceStatus as keyof typeof statusLabel]}</span></div>
      <div className="docs-editor-grid"><div className="docs-form"><label>Название проекта<input value={project.title} onChange={e => {editRevision.current += 1; setProject({...project, title: e.target.value}); setSaveState('Есть несохранённые изменения')}} /></label>{template && [...new Set(template.fields.map(f => f.section))].map(section => <fieldset key={section}><legend>{section}</legend>{template.fields.filter(f => f.section === section).map(spec => <label key={spec.key}>{spec.label}{spec.required && <span className="docs-required"> *</span>}{spec.multiline ? <textarea value={project.fields[spec.key] || ''} onChange={e => editField(spec.key, e.target.value)} /> : spec.inputType === 'select' ? <select value={project.fields[spec.key] || ''} onChange={e => editField(spec.key, e.target.value)}><option value=''>Выберите вариант</option>{spec.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : <input type={spec.inputType} value={project.fields[spec.key] || ''} onChange={e => editField(spec.key, e.target.value)} />}</label>)}</fieldset>)}</div>
      <aside className="docs-preview"><div className="docs-paper"><span>ПРЕДПРОСМОТР · ПРОЕКТ</span><h3>{template?.title || 'Документ'}</h3><p className="docs-blank">Зона даты и регистрационного номера — без заполнения</p>{project.preview.map((item, index) => <div key={index}><small>{item.label}</small><p>{item.value || 'Не заполнено'}</p></div>)}<p className="docs-blank">Зона визуализации ЭП сохраняется. Подписи и визы отсутствуют.</p></div><p className="docs-note">Это экранный предпросмотр, сформированный сервером, а не изображение утверждённого документа.</p></aside></div>
      <div className="docs-actions"><button className="docs-secondary" onClick={() => void saveAll()} disabled={busy}>Сохранить</button><button className="docs-secondary" onClick={() => void action('validate')} disabled={busy || !['Сохранено', '', 'Загружена версия сервера'].includes(saveState)}>Проверить</button><button className="docs-primary" onClick={() => void action('generate')} disabled={busy || !['Сохранено', '', 'Загружена версия сервера'].includes(saveState) || !project.validation.ready}>Сформировать DOCX</button>{project.artifacts[0] && <button className="docs-secondary" onClick={() => documentsApi.download(project.projectId, project.artifacts[0].artifactId, project.artifacts[0].filename).catch(showError)}><Download size={16}/> Скачать версию {project.artifacts[0].projectVersion}</button>}</div>
      {project.artifacts[0] && <div className="docs-artifact-preview"><button className="docs-secondary" type="button" aria-expanded={previewOpen} onClick={() => setPreviewOpen(value => !value)}>{previewOpen ? 'Закрыть просмотр DOCX' : 'Просмотреть DOCX'}</button>{previewOpen && <><p className="docs-note">Сохранённый DOCX · версия {project.artifacts[0].projectVersion}. Последующие правки полей появятся после сохранения и формирования новой версии.</p><Suspense fallback={<p>Загрузка просмотрщика…</p>}><DocumentViewer source={documentsApi.artifactUrl(project.projectId, project.artifacts[0].artifactId)} filename={project.artifacts[0].filename} documentId={project.projectId} mode="editor"/></Suspense></>}</div>}
      <div className="docs-issues"><h3>Проверка</h3>{project.validation.issues.length ? <ul>{project.validation.issues.map((item, i) => <li key={i}><ShieldAlert size={15}/>{item.message}</li>)}</ul> : <p>Поля и исходный шаблон готовы к генерации. Это не подтверждение согласования.</p>}</div>
      {project.artifacts.length > 0 && <div className="docs-versions"><h3>Сохранённые версии</h3>{project.artifacts.map(item => <button key={item.artifactId} onClick={() => documentsApi.download(project.projectId, item.artifactId, item.filename).catch(showError)}>{item.filename} · {new Date(item.createdAt).toLocaleString('ru-RU')}</button>)}</div>}
    </>}
  </div>
}
