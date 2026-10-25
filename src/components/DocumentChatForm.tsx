import { useEffect, useId, useState } from 'react'
import { Check, Download, FileText, Save } from 'lucide-react'
import { documentsApi } from '../features/documents/api'
import { editChatField, refreshChatProject, resolveChatConflict, saveChatProject, useChatProject } from '../features/documents/chatProjectStore'
import type { DocumentProject } from '../features/documents/types'
import { DocumentLivePreview } from './DocumentLivePreview'
import { Button } from './ui'

export function DocumentChatForm({projectId, disabled, onOpenEditor}: {projectId: string; disabled?: boolean; onOpenEditor: (project: DocumentProject) => void}) {
  const {project, template, edits, busy, error, conflict} = useChatProject(projectId)
  const [action, setAction] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState(false), [confirm, setConfirm] = useState<number>()
  const prefix = useId()
  useEffect(() => { void refreshChatProject(projectId) }, [projectId])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void refreshChatProject(projectId) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh)}
  }, [projectId])
  async function perform(name: string, operation: () => Promise<void>) {
    setAction(name); setNotice('')
    try { await operation() }
    catch { setNotice('Действие не выполнено. Проверьте актуальность проекта и сохранение полей.') }
    finally { setAction('') }
  }
  if (!project || !template) return <section className="document-chat-form" aria-busy={!error}>
    <p role={error ? 'alert' : 'status'}>{error || 'Загружаю форму проекта…'}</p>
    {error && <Button onClick={() => void refreshChatProject(projectId)}>Повторить</Button>}
  </section>
  const values = {...project.fields, ...edits}
  const sections = [...new Set(template.fields.map(f => f.section))]
  const blocked = disabled || Boolean(action)
  const dirty = Object.keys(edits).length > 0
  const filled = template.fields.filter(f => f.required && values[f.key]?.trim()).length
  const total = template.fields.filter(f => f.required).length
  const artifact = project.artifacts.find(a => a.projectVersion === project.version && project.status === 'generated')
  return <section className="document-chat-form" aria-label={`Форма: ${template.title}`} aria-busy={busy || Boolean(action)}>
    <header><FileText size={19}/><div><h3>{template.title}</h3><p>{project.status === 'generated' ? 'DOCX сформирован' : 'Черновик'} · Версия {project.version}</p></div></header>
    <div className="chat-form-progress"><span>Заполнено {filled} из {total} обязательных полей</span><progress value={filled} max={total}/></div>
    <p className="chat-form-status" role="status">{action || (busy ? 'Сохраняю реквизиты…' : dirty ? 'Изменения ожидают сохранения' : 'Все изменения сохранены')}</p>
    {error && <p role="alert" className="error-state">{error}</p>}
    {notice && <p role="alert" className="error-state">{notice}</p>}
    {conflict && <div className="chat-form-conflict">
      <strong>На сервере версия {conflict.version}</strong>
      <dl>{Object.entries(edits).map(([key, value]) => <div key={key}><dt>{template.fields.find(f => f.key === key)?.label}</dt><dd>Ваше: {value || 'пусто'}</dd><dd>На сервере: {conflict.fields[key] || 'пусто'}</dd></div>)}</dl>
      <Button disabled={blocked} onClick={() => void perform('Сохраняю выбранные правки…', () => resolveChatConflict(projectId, true))}>Применить мои поля к новой версии</Button>
      <Button disabled={blocked} onClick={() => void resolveChatConflict(projectId, false)}>Принять серверную версию</Button>
    </div>}
    <fieldset disabled={blocked} className="chat-form-fields">
      {sections.map((section, index) => <details key={section} open={index === 0}>
        <summary>{section}<small>{template.fields.filter(f => f.section === section && f.required && !values[f.key]?.trim()).length || <Check size={13}/>}</small></summary>
        <div className="chat-form-section">{template.fields.filter(f => f.section === section).map(field => {
          const issues = project.validation.issues.filter(i => i.field === field.key && !(i.code === 'required' && values[field.key]?.trim()))
          const id = `${prefix}-${field.key}`
          const common = {id, value: values[field.key] || '', required: field.required, 'aria-invalid': issues.length > 0, 'aria-describedby': issues.length ? `${id}-error` : undefined,
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {setConfirm(undefined); editChatField(projectId, field.key, event.target.value)},
            onBlur: () => { void saveChatProject(projectId).catch(() => {}) }}
          return <div className={`chat-form-field ${field.multiline ? 'wide' : ''}`} key={field.key}>
            <label htmlFor={id}>{field.label} <span>{field.required ? '*' : 'необязательно'}</span></label>
            {field.inputType === 'select' ? <select {...common}><option value="">Выберите значение</option>{field.options.map(o => <option key={o}>{o}</option>)}</select>
              : field.multiline ? <textarea {...common} maxLength={4000} rows={3}/>
              : <input {...common} type={field.inputType} maxLength={4000}/>}
            {issues.length > 0 && <span id={`${id}-error`} className="chat-field-error">{issues.map(i => i.message).join('. ')}</span>}
          </div>
        })}</div>
      </details>)}
    </fieldset>
    <div className="chat-form-actions">
      <Button disabled={blocked || busy || Boolean(conflict)} onClick={() => void perform('Сохраняю…', async () => {await saveChatProject(projectId)})}><Save size={14}/>Сохранить</Button>
      <Button disabled={blocked || Boolean(conflict)} onClick={() => void perform('Проверяю реквизиты…', async () => {await saveChatProject(projectId); await documentsApi.validate(projectId); await refreshChatProject(projectId)})}>Проверить заполнение</Button>
      <Button disabled={blocked || Boolean(conflict)} onClick={() => void perform('Открываю предпросмотр…', async () => {await saveChatProject(projectId); setPreview(v => !v)})}>Предпросмотр</Button>
      <Button disabled={blocked || Boolean(conflict)} onClick={() => void perform('Проверяю готовность…', async () => {
        await saveChatProject(projectId)
        const p = await documentsApi.validate(projectId)
        await refreshChatProject(projectId)
        if (p.validation.ready) setConfirm(p.version)
        else setNotice('Заполните обязательные поля и исправьте отмеченные ошибки перед формированием DOCX.')
      })}>Сформировать DOCX</Button>
      <Button disabled={blocked || Boolean(conflict)} onClick={() => void perform('Открываю редактор…', async () => {const p = await saveChatProject(projectId); if (p) onOpenEditor(p)})}>Открыть полный редактор</Button>
    </div>
    {confirm !== undefined && <div className="chat-form-confirm" role="group" aria-label="Подтверждение генерации">
      <p>Сформировать DOCX из сохранённой версии {confirm}? Согласование и подписание выполняются отдельно.</p>
      <Button variant="primary" disabled={blocked || busy || dirty} onClick={() => void perform('Формирую DOCX…', async () => {
        const current = await documentsApi.get(projectId)
        if (current.version !== confirm) {await refreshChatProject(projectId); setConfirm(undefined); throw new Error('version_conflict')}
        await documentsApi.generate(projectId, confirm); await refreshChatProject(projectId); setConfirm(undefined)
      })}>Подтвердить формирование DOCX</Button>
      <Button disabled={blocked} onClick={() => setConfirm(undefined)}>Отмена</Button>
    </div>}
    {artifact && <Button variant="primary" disabled={blocked} onClick={() => void perform('Скачиваю…', () => documentsApi.download(projectId, artifact.artifactId, artifact.filename))}><Download size={14}/>Скачать DOCX</Button>}
    {project.validation.issues.some(i => !i.field) && <p className="error-state">{project.validation.issues.filter(i => !i.field).map(i => i.message).join('. ')}</p>}
    {preview && <div className="chat-form-preview"><DocumentLivePreview projectId={projectId} fields={project.fields}/></div>}
    <small className="chat-form-footnote">Синтетический модуль · Статус в реестре не проверен · * Обязательное поле</small>
  </section>
}
