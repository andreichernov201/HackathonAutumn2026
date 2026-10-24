import { useEffect, useRef, useState } from 'react'
import { type Section } from './app/navigation'
import { Composer } from './components/Composer'
import { ConversationView } from './components/ConversationView'
import { SectionView } from './components/SectionView'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { WelcomeView } from './components/WelcomeView'
import { WorkspacePanel } from './components/WorkspacePanel'
import { assistantGateway } from './features/assistant/gateway'
import { scenarios } from './features/assistant/scenarios'
import { sessionStore } from './features/assistant/sessionStore'
import type { ChatMessage, ChatSession, FileReference, ProjectDraft, Scenario, WorkspaceTab } from './features/assistant/types'

const closedWorkspace = { open: false, tab: 'sources' as WorkspaceTab }

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(sessionStore.load)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('assistant')
  const [draft, setDraft] = useState('')
  const [scenario, setScenario] = useState<Scenario | undefined>()
  const [file, setFile] = useState<File | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeSession = sessions.find((item) => item.id === activeSessionId)
  const workspace = activeSession?.workspace ?? closedWorkspace

  useEffect(() => sessionStore.save(sessions), [sessions])

  function updateSession(id: string, update: (session: ChatSession) => ChatSession) {
    setSessions((previous) => previous.map((item) => item.id === id ? update(item) : item))
  }

  function startNewChat() {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    setSection('assistant')
    setActiveSessionId(null)
    setDraft('')
    setScenario(undefined)
    setFile(null)
    setRequestError('')
    setMobileOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function chooseScenario(id: Scenario) {
    setSection('assistant')
    setScenario(id)
    setDraft(scenarios[id].prompt)
    setMobileOpen(false)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      const end = inputRef.current?.value.length ?? 0
      inputRef.current?.setSelectionRange(end, end)
    })
  }

  function setWorkspaceTab(tab: WorkspaceTab) {
    if (!activeSessionId) return
    updateSession(activeSessionId, (session) => ({ ...session, workspace: { ...session.workspace ?? closedWorkspace, open: true, tab } }))
  }

  function selectSource(sourceId: string) {
    if (!activeSessionId) return
    updateSession(activeSessionId, (session) => ({ ...session, workspace: { open: true, tab: 'sources', selectedSourceId: sourceId } }))
  }

  function updateProject(patch: Partial<Pick<ProjectDraft, 'title' | 'chair' | 'projectType'>>) {
    if (!activeSessionId) return
    updateSession(activeSessionId, (session) => session.project ? {
      ...session,
      project: { ...session.project, ...patch, status: 'collecting-data' },
    } : session)
  }

  async function submit() {
    const text = draft.trim()
    if ((!text && !file) || submitting) return
    const now = new Date().toISOString()
    const id = activeSessionId ?? crypto.randomUUID()
    const existing = sessions.find((item) => item.id === id)
    const fileReference: FileReference | undefined = file ? { name: file.name, size: file.size, type: file.type } : undefined
    const message: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, createdAt: now, scenario, ...(fileReference ? { file: fileReference } : {}) }
    const title = text.replace(/\s+/g, ' ').slice(0, 54) || file?.name || 'Новый диалог'
    setSessions((previous) => {
      const current = previous.find((item) => item.id === id)
      const updated: ChatSession = current
        ? { ...current, updatedAt: now, messages: [...current.messages, message] }
        : { id, title, updatedAt: now, messages: [message], workspace: closedWorkspace }
      return [updated, ...previous.filter((item) => item.id !== id)]
    })
    setActiveSessionId(id)
    setSection('assistant')
    setDraft('')
    setFile(null)
    setScenario(undefined)
    setRequestError('')
    setSubmitting(true)

    try {
      const result = await assistantGateway.submit({
        conversationId: id, message: text, scenario,
        history: existing?.messages ?? [],
        context: { project: existing?.project, workspace: existing?.workspace ?? closedWorkspace, file: fileReference },
      })
      if (result.status !== 'completed') {
        setRequestError(result.message)
        return
      }
      const reply: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', text: result.text, blocks: result.blocks, origin: result.origin, createdAt: new Date().toISOString() }
      updateSession(id, (session) => ({
        ...session, updatedAt: reply.createdAt, messages: [...session.messages, reply],
        sources: [...(session.sources ?? []).filter((source) => !result.sources.some((item) => item.id === source.id)), ...result.sources],
        project: result.project ?? session.project,
        workspace: result.workspace ?? session.workspace,
      }))
    } catch {
      setRequestError('Не удалось получить ответ. Проверьте соединение с сервером или попробуйте снова.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="app-shell selection:bg-blue-100">
    <Sidebar
      open={mobileOpen}
      section={section}
      sessions={sessions}
      activeSessionId={activeSessionId}
      onClose={() => setMobileOpen(false)}
      onNewChat={startNewChat}
      onSection={(id) => { setSection(id); setMobileOpen(false) }}
      onSession={(id) => { setActiveSessionId(id); setSection('assistant'); setMobileOpen(false) }}
      onClearHistory={() => { setSessions([]); setActiveSessionId(null); setRequestError('') }}
    />
    <main className="main-panel">
      <Topbar section={section} onMenu={() => setMobileOpen(true)} onNewChat={startNewChat}
        workspaceOpen={section === 'assistant' && workspace.open} canOpenWorkspace={Boolean(activeSession)} onWorkspace={() => activeSessionId && updateSession(activeSessionId, (session) => ({ ...session, workspace: { ...session.workspace ?? closedWorkspace, open: true } }))} />
      {section === 'assistant'
        ? activeSession
          ? <ConversationView session={activeSession} onSource={selectSource} onTab={setWorkspaceTab} onStartDocument={() => chooseScenario('document')} />
          : <WelcomeView onChooseScenario={chooseScenario} />
        : <SectionView section={section} onChooseScenario={chooseScenario} />}
      {requestError && <p className="request-error" role="alert">{requestError}</p>}
      <Composer inputRef={inputRef} draft={draft} file={file} scenario={scenario} submitting={submitting}
        onDraft={setDraft} onFile={setFile} onScenario={setScenario} onSubmit={() => void submit()} />
    </main>
    {section === 'assistant' && activeSession && <WorkspacePanel state={workspace} sources={activeSession.sources ?? []} project={activeSession.project}
      onClose={() => updateSession(activeSession.id, (session) => ({ ...session, workspace: { ...session.workspace ?? closedWorkspace, open: false } }))}
      onTab={setWorkspaceTab} onProject={updateProject} />}
  </div>
}
