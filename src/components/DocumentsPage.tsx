import { useEffect, useState } from 'react'
import { ArrowLeft, Download, FilePlus2, Search, ShieldAlert } from 'lucide-react'
import { documentsApi } from '../features/documents/api'
import type { DocumentProject, DocumentTemplate, Session } from '../features/documents/types'

const statusLabel = {awaiting_source: 'Ожидает исходный DOCX', awaiting_review: 'Ожидает проверки', awaiting_schema: 'Схема готовится', ready: 'Источник подключён'}
const errorLabel: Record<string,string> = { version_conflict: 'Проект изменился в другом окне. Обновите его и повторите правку.', validation_failed: 'Заполните обязательные поля и проверьте источник.', source_not_ready: 'Исходный DOCX ещё не готов.', authentication_required: 'Войдите в систему.' }

interface Props { initialProjectId?: string; onOpenChat: (project: DocumentProject) => void }
export function DocumentsPage({initialProjectId, onOpenChat}: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [username, setUsername] = useState<'user' | 'admin'>('user')
  const [password, setPassword] = useState('')
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [projects, setProjects] = useState<DocumentProject[]>([])
  const [project, setProject] = useState<DocumentProject | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const template = templates.find(item => item.templateId === project?.templateId)

  async function load(openId?: string) {
    const [nextTemplates, nextProjects] = await Promise.all([documentsApi.templates(), documentsApi.projects()])
    setTemplates(nextTemplates); setProjects(nextProjects)
    if (openId) setProject(await documentsApi.get(openId))
  }
  useEffect(() => { documentsApi.session().then(async s => {setSession(s); await load(initialProjectId)}).catch(() => {}) }, [initialProjectId])
  useEffect(() => {
    if (!project) return
    const id = project.projectId, snapshot = project.fields
    const timer = setTimeout(() => { documentsApi.preview(id, snapshot).then(preview => setProject(current => current?.projectId === id && current.fields === snapshot ? {...current, preview} : current)).catch(() => {}) }, 120)
    return () => clearTimeout(timer)
  }, [project?.projectId, project?.fields])
  function showError(cause: unknown) { const text = cause instanceof Error ? cause.message : String(cause); setError(errorLabel[text] || text) }
  async function login(event: React.FormEvent) { event.preventDefault(); setError(''); try {const s = await documentsApi.login(username, password); setSession(s); setPassword(''); await load(initialProjectId)} catch(cause) {showError(cause)} }
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
    const current = project
    setProject({...current, fields: {...current.fields, [key]: value}})
    setSaveState('Есть несохранённые изменения')
  }
  async function saveAll() {
    if (!project) return
    setSaveState('Сохранение…')
    try {const next = await documentsApi.patch(project.projectId, project.version, project.fields, project.title); setProject(next); setProjects(p => p.map(item => item.projectId === next.projectId ? next : item)); setSaveState('Сохранено')} catch(cause) {setSaveState('Не сохранено'); showError(cause)}
  }
  async function action(kind: 'validate' | 'generate') {
    if (!project) return
    setBusy(true); setError('')
    try { const next = await documentsApi[kind](project.projectId); setProject(next); await load(); } catch(cause) {showError(cause)} finally {setBusy(false)}
  }
  async function upload() {
    if (!uploadFile) return
    setBusy(true); setError('')
    try { await documentsApi.upload(uploadFile); await load(project?.projectId); setUploadFile(null) } catch(cause) {showError(cause)} finally {setBusy(false)}
  }
  if (!session) return <div className="docs-page"><div className="docs-login"><h1>Документы</h1><p>Войдите, чтобы видеть свои проекты и исходные модули.</p><form onSubmit={login}><label>Роль<select value={username} onChange={e => setUsername(e.target.value as 'user' | 'admin')}><option value="user">Пользователь</option><option value="admin">Администратор</option></select></label><label>Пароль<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="docs-primary">Войти</button></form>{error && <p role="alert" className="docs-error">{error}</p>}</div></div>
  return <div className="docs-page">
    <div className="docs-heading"><div><span className="section-overline">Рабочее пространство</span><h1>Документы</h1><p>Проекты сохраняются на сервере. Подписи, визы и номер не присваиваются.</p></div>{project && <button className="docs-secondary" onClick={() => {setProject(null); setError('')}}><ArrowLeft size={16}/> Каталог и проекты</button>}</div>
    {error && <p role="alert" className="docs-error">{error}</p>}
    {!project ? <>
      <div className="docs-section-head"><h2>Каталог модулей</h2><label className="docs-search"><Search size={16}/><input aria-label="Поиск по модулям" placeholder="Найти модуль" value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      <div className="docs-catalog">{templates.filter(item => item.title.toLowerCase().includes(search.toLowerCase())).map(item => <article className="docs-card" key={item.templateId}><span className="docs-kicker">{item.kind}</span><h3>{item.title}</h3><p>{item.note}</p><div className="docs-card-meta"><span>{statusLabel[item.sourceStatus]}</span><span>Реестр: не проверен</span><span>Файл: SHA-256 {item.sourceSha256?.slice(0, 12) || 'нет'}</span></div><button className="docs-primary" disabled={busy || item.sourceStatus !== 'ready'} onClick={() => void create(item.templateId)}><FilePlus2 size={16}/> {item.sourceStatus === 'ready' ? 'Создать проект' : 'Ожидает схему'}</button></article>)}</div>
      <p className="docs-note">Все семь исходных модулей загружены из синтетического кейса. Рабочая схема сейчас подготовлена для распоряжения о рабочей группе; статус редакций в реестре не подтверждён.</p>
      <div className="docs-section-head"><h2>Мои проекты</h2><span>{projects.length}</span></div>
      {projects.length ? <div className="docs-project-list">{projects.map(item => <article className="docs-project-row" key={item.projectId}><div><strong>{item.title}</strong><small>Черновик · версия {item.version} · {new Date(item.updatedAt).toLocaleString('ru-RU')}</small></div><div><button className="docs-secondary" onClick={() => setProject(item)}>Открыть</button><button className="docs-secondary" disabled={busy} onClick={() => void create(item.templateId, item)}>Дублировать</button></div></article>)}</div> : <p className="docs-note">Сохранённых проектов пока нет.</p>}
      {session.role === 'admin' && <div className="docs-admin"><h2>Обновить исходный модуль рабочей группы</h2><p>Загрузите подлинный DOCX. Сервис проверит структуру и сохранит копию; после предметной сверки подтвердите её. Официальную редакцию и статус реестра это не устанавливает.</p><input type="file" accept=".docx" onChange={e => setUploadFile(e.target.files?.[0] || null)} /><button className="docs-secondary" disabled={busy || !uploadFile} onClick={() => void upload()}>Загрузить исходник</button>{templates[0]?.sourceStatus === 'awaiting_review' && <button className="docs-primary" onClick={() => documentsApi.approve().then(() => load()).catch(showError)}>Подтвердить после проверки</button>}</div>}
    </> : <>
      <div className="docs-editor-head"><div><span className="docs-kicker">ЧЕРНОВИК · БЕЗ ПОДПИСИ</span><h2>{project.title}</h2><small>Проект {project.projectId} · версия {project.version} · {saveState || 'Сохранено'} · статус в реестре не подтверждён</small></div><button className="docs-secondary" disabled={saveState.includes('несохранённые')} onClick={() => onOpenChat(project)}>Открыть в чате</button></div>
      <div className="docs-progress"><div><strong>{project.validation.completed} из {project.validation.total}</strong> обязательных полей</div><progress value={project.validation.completed} max={project.validation.total}/><span>{statusLabel[project.sourceStatus as keyof typeof statusLabel]}</span></div>
      <div className="docs-editor-grid"><div className="docs-form"><label>Название проекта<input value={project.title} onChange={e => {setProject({...project, title: e.target.value}); setSaveState('Есть несохранённые изменения')}} /></label>{template && [...new Set(template.fields.map(f => f.section))].map(section => <fieldset key={section}><legend>{section}</legend>{template.fields.filter(f => f.section === section).map(spec => <label key={spec.key}>{spec.label}{spec.required && <span className="docs-required"> *</span>}{spec.multiline ? <textarea value={project.fields[spec.key] || ''} onChange={e => editField(spec.key, e.target.value)} /> : <input type={spec.inputType} value={project.fields[spec.key] || ''} onChange={e => editField(spec.key, e.target.value)} />}</label>)}</fieldset>)}</div>
      <aside className="docs-preview"><div className="docs-paper"><span>ПРЕДПРОСМОТР · ПРОЕКТ</span><h3>Распоряжение о создании рабочей группы</h3><p className="docs-blank">Зона даты и регистрационного номера — без заполнения</p>{project.preview.map((item, index) => <div key={index}><small>{item.label}</small><p>{item.value || 'Не заполнено'}</p></div>)}<p className="docs-blank">Зона визуализации ЭП сохраняется. Подписи и визы отсутствуют.</p></div><p className="docs-note">Это экранный предпросмотр, сформированный сервером, а не изображение утверждённого документа.</p></aside></div>
      <div className="docs-actions"><button className="docs-secondary" onClick={() => void saveAll()} disabled={busy}>Сохранить</button><button className="docs-secondary" onClick={() => void action('validate')} disabled={busy || saveState.includes('несохранённые')}>Проверить</button><button className="docs-primary" onClick={() => void action('generate')} disabled={busy || saveState.includes('несохранённые') || !project.validation.ready}>Сформировать DOCX</button>{project.artifacts[0] && <button className="docs-secondary" onClick={() => documentsApi.download(project.projectId, project.artifacts[0].artifactId, project.artifacts[0].filename).catch(showError)}><Download size={16}/> Скачать версию {project.artifacts[0].projectVersion}</button>}</div>
      <div className="docs-issues"><h3>Проверка</h3>{project.validation.issues.length ? <ul>{project.validation.issues.map((item, i) => <li key={i}><ShieldAlert size={15}/>{item.message}</li>)}</ul> : <p>Поля и исходный шаблон готовы к генерации. Это не подтверждение согласования.</p>}</div>
      {project.artifacts.length > 0 && <div className="docs-versions"><h3>Сохранённые версии</h3>{project.artifacts.map(item => <button key={item.artifactId} onClick={() => documentsApi.download(project.projectId, item.artifactId, item.filename).catch(showError)}>{item.filename} · {new Date(item.createdAt).toLocaleString('ru-RU')}</button>)}</div>}
    </>}
  </div>
}
