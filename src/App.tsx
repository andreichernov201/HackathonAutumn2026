import { useEffect, useRef, useState } from 'react'
import { type Section } from './app/navigation'
import { Composer } from './components/Composer'
import { ConversationView } from './components/ConversationView'
import { ReviewPage } from './components/ReviewPage'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { WelcomeView } from './components/WelcomeView'
import { WorkspacePanel } from './components/WorkspacePanel'
import { DocumentsPage } from './components/DocumentsPage'
import { KnowledgePage } from './features/knowledge/KnowledgePage'
import type { KnowledgeCitation } from './features/knowledge/types'
import type { DocumentProject } from './features/documents/types'
import { assistantGateway } from './features/assistant/gateway'
import { scenarios } from './features/assistant/scenarios'
import { sessionStore } from './features/assistant/sessionStore'
import type { ChatMessage, ChatSession, FileReference, Scenario, WorkspaceTab } from './features/assistant/types'

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
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | undefined>()
  const [documentOpenVersion, setDocumentOpenVersion] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeSession = sessions.find((item) => item.id === activeSessionId)
  const workspace = activeSession?.workspace ?? closedWorkspace

  useEffect(() => sessionStore.save(sessions), [sessions])
  useEffect(() => {
    const onHash = () => {if (location.hash.startsWith('#knowledge')) setSection('knowledge')}
    onHash(); window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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
      if (scenario === 'document' || /созда(ть|й|м|ю).*?(документ|распоряжен)/i.test(text)) {
        setSection('documents')
        setSelectedDocumentId(undefined)
        setDocumentOpenVersion(value => value + 1)
        const reply: ChatMessage = {id: crypto.randomUUID(), role: 'assistant', text: 'Открыл раздел «Документы». Выберите модуль и создайте серверный проект. Затем его можно открыть обратно в чате.', createdAt: new Date().toISOString(), origin: 'api'}
        updateSession(id, session => ({...session, messages: [...session.messages, reply]}))
        return
      }
      const result = await assistantGateway.submit({
        conversationId: id, message: text, scenario,
        history: existing?.messages ?? [],
        context: { documentProjectId: existing?.documentProjectId, workspace: existing?.workspace ?? closedWorkspace, file: fileReference, knowledgeSource: existing?.knowledgeSource },
      })
      if (result.status !== 'completed') {
        setRequestError(result.message)
        return
      }
      const reply: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', text: result.text, blocks: result.blocks, origin: result.origin, createdAt: new Date().toISOString() }
      updateSession(id, (session) => ({
        ...session, updatedAt: reply.createdAt, messages: [...session.messages, reply],
        sources: [...(session.sources ?? []).filter((source) => !result.sources.some((item) => item.id === source.id)), ...result.sources],
        workspace: result.workspace ?? session.workspace,
      }))
    } catch {
      setRequestError('Не удалось получить ответ. Проверьте соединение с сервером или попробуйте снова.')
    } finally {
      setSubmitting(false)
    }
  }

  function openDocumentInChat(project: DocumentProject) {
    const id = activeSessionId ?? crypto.randomUUID()
    const time = new Date().toISOString()
    const message: ChatMessage = {id: crypto.randomUUID(), role: 'assistant', text: `Открыт серверный проект «${project.title}» (версия ${project.version}). Редактирование, проверка и DOCX доступны в разделе «Документы».`, createdAt: time, origin: 'api'}
    setSessions(previous => {
      const current = previous.find(item => item.id === id)
      const next: ChatSession = current ? {...current, documentProjectId: project.projectId, messages: [...current.messages, message], updatedAt: time, workspace: {open: true, tab: 'document'}} : {id, title: project.title, documentProjectId: project.projectId, messages: [message], updatedAt: time, workspace: {open: true, tab: 'document'}}
      return [next, ...previous.filter(item => item.id !== id)]
    })
    setActiveSessionId(id); setSelectedDocumentId(project.projectId); setSection('assistant')
  }

  function askKnowledge(source: KnowledgeCitation) {
    const id = crypto.randomUUID()
    const time = new Date().toISOString()
    const session: ChatSession = {
      id, title: source.title.slice(0, 54), updatedAt: time, knowledgeSource: source,
      sources: [source], workspace: {open: true, tab: 'sources', selectedSourceId: source.id},
      messages: [{id: crypto.randomUUID(), role: 'assistant', createdAt: time, origin: 'api',
        text: 'Источник закреплён в контексте диалога. Оригинальный пункт доступен справа. Автоматическое объяснение требует подключения AI-сервиса.',
        blocks: [{type: 'citation', sourceId: source.id}]}],
    }
    setSessions(previous => [session, ...previous]); setActiveSessionId(id)
    setSection('assistant'); setDraft('Объясни этот пункт простым языком: ' + source.locator)
    setScenario('requirement'); setFile(null); setRequestError('')
    history.pushState(null, '', location.pathname + location.search)
    requestAnimationFrame(() => inputRef.current?.focus())
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
          ? <ConversationView session={activeSession} onSource={selectSource} onStartDocument={() => {setSelectedDocumentId(activeSession.documentProjectId); setDocumentOpenVersion(value => value + 1); setSection('documents')}} />
          : <WelcomeView onChooseScenario={chooseScenario} />
        : section === 'check' ? <ReviewPage/> : null}
      <div className="documents-host" hidden={section !== 'documents'}><DocumentsPage initialProjectId={selectedDocumentId} openVersion={documentOpenVersion} onOpenChat={openDocumentInChat} /></div>
      <div className="knowledge-host" hidden={section !== 'knowledge'}><KnowledgePage onAsk={askKnowledge}/></div>
      {requestError && <p className="request-error" role="alert">{requestError}</p>}
      {section === 'assistant' && <Composer inputRef={inputRef} draft={draft} file={file} scenario={scenario} submitting={submitting}
        onDraft={setDraft} onFile={setFile} onScenario={setScenario} onSubmit={() => void submit()} />
      }
    </main>
    {section === 'assistant' && activeSession && <WorkspacePanel state={workspace} sources={activeSession.sources ?? []} documentProjectId={activeSession.documentProjectId} onOpenDocument={() => {setSelectedDocumentId(activeSession.documentProjectId); setDocumentOpenVersion(value => value + 1); setSection('documents')}}
      onOpenKnowledge={(sectionId) => {setSection('knowledge'); location.hash = `knowledge/sections/${sectionId}`}}
      onClose={() => updateSession(activeSession.id, (session) => ({ ...session, workspace: { ...session.workspace ?? closedWorkspace, open: false } }))}
      onTab={setWorkspaceTab} />}
  </div>
}

