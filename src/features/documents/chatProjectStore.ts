import { useSyncExternalStore } from 'react'
import { documentsApi } from './api'
import type { DocumentProject, DocumentTemplate } from './types'

interface Snapshot {
  project?: DocumentProject
  template?: DocumentTemplate
  edits: Record<string, string>
  busy: boolean
  error: string
  conflict?: DocumentProject
}
interface Entry {
  snapshot: Snapshot
  listeners: Set<() => void>
  saving?: Promise<DocumentProject | undefined>
  loading?: Promise<void>
  timer?: ReturnType<typeof setTimeout>
  baseVersion?: number
}
const entries = new Map<string, Entry>()
const draftKey = (id: string) => `regula-chat-draft:${id}`
function entry(id: string): Entry {
  let result = entries.get(id)
  if (!result) {
    result = { snapshot: { edits: {}, busy: false, error: '' }, listeners: new Set() }
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey(id)) || 'null')
      if (draft && typeof draft.version === 'number' && draft.fields && Object.values(draft.fields).every(v => typeof v === 'string')) {
        result.snapshot.edits = draft.fields
        result.baseVersion = draft.version
      }
    } catch { /* Server remains authoritative when local draft storage is unavailable. */ }
    entries.set(id, result)
  }
  return result
}
function publish(id: string, update: Partial<Snapshot>) {
  const e = entry(id)
  e.snapshot = { ...e.snapshot, ...update }
  try {
    if (Object.keys(e.snapshot.edits).length) sessionStorage.setItem(draftKey(id), JSON.stringify({version: e.baseVersion, fields: e.snapshot.edits}))
    else sessionStorage.removeItem(draftKey(id))
  } catch { /* Keep the in-memory draft. */ }
  e.listeners.forEach(listener => listener())
}
export async function refreshChatProject(id: string) {
  const e = entry(id)
  if (e.loading) return e.loading
  e.loading = (async () => {
    try {
      const p = await documentsApi.get(id)
      const template = e.snapshot.template?.templateId === p.templateId ? e.snapshot.template : await documentsApi.template(p.templateId)
      const dirty = Object.keys(e.snapshot.edits).length > 0
      if (dirty && e.baseVersion !== undefined && e.baseVersion !== p.version) {
        publish(id, {template, conflict: p, project: e.snapshot.project || p, error: 'Документ изменился. Сравните значения перед сохранением.'})
      } else {
        if (!dirty) e.baseVersion = p.version
        publish(id, {project: p, template, error: '', conflict: undefined})
      }
    } catch {
      publish(id, {error: 'Не удалось загрузить проект. Введённые значения сохранены на этом устройстве.'})
    }
  })().finally(() => { e.loading = undefined })
  return e.loading
}
export function editChatField(id: string, key: string, value: string) {
  const e = entry(id)
  if (!e.snapshot.template?.fields.some(f => f.key === key)) return
  if (!Object.keys(e.snapshot.edits).length) e.baseVersion = e.snapshot.project?.version
  publish(id, {edits: {...e.snapshot.edits, [key]: value}})
  clearTimeout(e.timer)
  e.timer = setTimeout(() => { void saveChatProject(id).catch(() => {}) }, 650)
}
export async function saveChatProject(id: string): Promise<DocumentProject | undefined> {
  const e = entry(id)
  clearTimeout(e.timer)
  if (e.saving) {
    await e.saving
    if (Object.keys(e.snapshot.edits).length) return saveChatProject(id)
    return e.snapshot.project
  }
  if (!Object.keys(e.snapshot.edits).length) return e.snapshot.project
  if (e.snapshot.conflict) throw new Error('version_conflict')
  const fields = {...e.snapshot.edits}, version = e.baseVersion
  if (!version) throw new Error('project_not_loaded')
  publish(id, {busy: true, error: ''})
  e.saving = (async () => {
    try {
      const project = await documentsApi.patch(id, version, fields)
      const edits = Object.fromEntries(Object.entries(e.snapshot.edits).filter(([key, value]) => value !== fields[key]))
      e.baseVersion = project.version
      publish(id, {project, edits, busy: false, conflict: undefined})
      return project
    } catch (error) {
      if (error instanceof Error && error.message === 'version_conflict') {
        try {
          const conflict = await documentsApi.get(id)
          publish(id, {conflict, busy: false, error: 'Проект изменился. Ваши правки сохранены; выберите способ продолжения.'})
        } catch {publish(id, {busy:false, error:'Проект изменился, но актуальная версия пока недоступна. Ваши правки сохранены.'})}
      } else publish(id, {busy: false, error: 'Не удалось сохранить реквизиты. Повторите сохранение перед отправкой запроса.'})
      throw error
    }
  })().finally(() => { e.saving = undefined })
  const result = await e.saving
  if (Object.keys(e.snapshot.edits).length) return saveChatProject(id)
  return result
}
export async function flushChatProjects() {
  for (const [id, e] of entries) if (e.saving || Object.keys(e.snapshot.edits).length) await saveChatProject(id)
}
export async function resolveChatConflict(id: string, keepMine: boolean) {
  const e = entry(id), latest = e.snapshot.conflict
  if (!latest) return
  e.baseVersion = latest.version
  publish(id, {project: latest, edits: keepMine ? e.snapshot.edits : {}, conflict: undefined, error: ''})
  if (keepMine) await saveChatProject(id)
}
export function useChatProject(id: string) {
  return useSyncExternalStore(listener => {
    const e = entry(id)
    e.listeners.add(listener)
    return () => { e.listeners.delete(listener) }
  }, () => entry(id).snapshot)
}
