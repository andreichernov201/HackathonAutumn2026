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
import { documentsApi } from './features/documents/api'
import { flushChatProjects, refreshChatProject } from './features/documents/chatProjectStore'
import { aiConfiguration, type AIConfiguration, assistantGateway } from './features/assistant/gateway'
import { scenarios } from './features/assistant/scenarios'
import { sessionStore } from './features/assistant/sessionStore'
import type { ChatMessage, ChatSession, FileReference, Scenario, WorkspaceTab } from './features/assistant/types'

const closedWorkspace = { open: false, tab: 'sources' as WorkspaceTab }

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(sessionStore.load)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('home')
  const [draft, setDraft] = useState('')
  const [scenario, setScenario] = useState<Scenario | undefined>()
  const [file, setFile] = useState<File | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [progress, setProgress] = useState('')
  const [aiConfig, setAiConfig] = useState<AIConfiguration>()
  const [syntheticAcknowledged, setSyntheticAcknowledged] = useState(() => {try {return sessionStorage.getItem('regula-synthetic-only') === '1'} catch {return false}})
  const retryRequest = useRef<Parameters<typeof assistantGateway.submit>[0] | undefined>(undefined)
  const submittingRef = useRef(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | undefined>()
  const [selectedDocument, setSelectedDocument] = useState<DocumentProject | undefined>()
  const [documentOpenVersion, setDocumentOpenVersion] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const activeSession = sessions.find((item) => item.id === activeSessionId)
  const workspace = activeSession?.workspace ?? closedWorkspace

  useEffect(() => sessionStore.save(sessions), [sessions])
  useEffect(() => { void aiConfiguration().then(setAiConfig).catch(() => {}) }, [])
  useEffect(() => {
    const onHash = () => setSection(location.hash.startsWith('#knowledge') ? 'knowledge' : 'assistant')
    if (location.hash.startsWith('#knowledge')) onHash()
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onHash)
    }
  }, [])

  function updateSession(id: string, update: (session: ChatSession) => ChatSession) {
    setSessions((previous) => previous.map((item) => (item.id === id ? update(item) : item)))
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
    updateSession(activeSessionId, (session) => ({
      ...session,
      workspace: { ...(session.workspace ?? closedWorkspace), open: true, tab },
    }))
  }

  function selectSource(sourceId: string) {
    if (!activeSessionId) return
    updateSession(activeSessionId, (session) => ({
      ...session,
      workspace: { open: true, tab: 'sources', selectedSourceId: sourceId },
    }))
  }

  async function submit() {
    const text = draft.trim()
    if ((!text && !file) || submittingRef.current) return
    if (aiConfig?.configured && aiConfig.processing === 'cloud' && !syntheticAcknowledged) {setRequestError('Подтвердите использование только синтетических материалов под полем ввода.'); return}
    submittingRef.current = true
    try { await flushChatProjects() } catch {submittingRef.current = false; setRequestError('Сохраните изменения в форме и разрешите конфликт версии перед запросом к AI.'); return}
    const now = new Date().toISOString()
    const id = activeSessionId ?? crypto.randomUUID()
    const existing = sessions.find((item) => item.id === id)
    const fileReference: FileReference | undefined = file
      ? { name: file.name, size: file.size, type: file.type }
      : undefined
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      createdAt: now,
      scenario,
      ...(fileReference ? { file: fileReference } : {}),
    }
    const title = text.replace(/\s+/g, ' ').slice(0, 54) || file?.name || 'Новый диалог'
    setSessions((previous) => {
      const current = previous.find((item) => item.id === id)
      const updated: ChatSession = current
        ? {
            ...current,
            updatedAt: now,
            messages: [...current.messages, message],
          }
        : {
            id,
            title,
            updatedAt: now,
            messages: [message],
            workspace: closedWorkspace,
          }
      return [updated, ...previous.filter((item) => item.id !== id)]
    })
    setActiveSessionId(id)
    setSection('assistant')
    setDraft('')
    setFile(null)
    setScenario(undefined)
    setRequestError('')
    setSubmitting(true)
    submittingRef.current = true
    setProgress('Запрос отправлен серверу…')

    try {
      const request = {
        conversationId: id,
        requestId: message.id,
        syntheticOnlyAcknowledged: syntheticAcknowledged,
        message: text,
        scenario,
        history: existing?.messages ?? [],
        context: {
          documentProjectId: existing?.documentProjectId,
          workspace: existing?.workspace ?? closedWorkspace,
          file: fileReference,
          knowledgeSource: existing?.knowledgeSource,
        },
      }
      retryRequest.current = request
      const result = await assistantGateway.submit(request, setProgress)
      retryRequest.current = undefined
      if (result.status !== 'completed') {
        setRequestError(result.message)
        return
      }
      if (result.documentProjectId) await refreshChatProject(result.documentProjectId)
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: result.text,
        blocks: result.blocks,
        origin: result.origin,
        createdAt: new Date().toISOString(),
      }
      updateSession(id, (session) => ({
        ...session,
        updatedAt: reply.createdAt,
        messages: [...session.messages, reply],
        sources: [
          ...(session.sources ?? []).filter((source) => !result.sources.some((item) => item.id === source.id)),
          ...result.sources,
        ],
        workspace: result.workspace ?? session.workspace,
        documentProjectId: result.documentProjectId ?? session.documentProjectId,
      }))
    } catch {
      setRequestError('Не удалось получить ответ. Проверьте соединение с сервером или попробуйте снова.')
    } finally {
      setSubmitting(false)
      submittingRef.current = false
      setProgress('')
    }
  }

  async function chatAction(action: {selectTemplateId?: string; confirmActionId?: string; requestId?: string}) {
    if (!activeSessionId || submittingRef.current) return
    submittingRef.current = true
    try { await flushChatProjects() } catch (error) {submittingRef.current = false; throw error}
    const request = {conversationId: activeSessionId, requestId: crypto.randomUUID(), message: '', history: [], syntheticOnlyAcknowledged: syntheticAcknowledged, context: {documentProjectId: activeSession?.documentProjectId, workspace: activeSession?.workspace ?? closedWorkspace}, ...action}
    submittingRef.current = true; setSubmitting(true); setProgress('Выполняю выбранное действие…')
    try {
      retryRequest.current = request
      const result = await assistantGateway.submit(request, setProgress)
      retryRequest.current = undefined
      if (result.status !== 'completed') throw new Error(result.message)
      const reply: ChatMessage = {id: crypto.randomUUID(), role: 'assistant', text: result.text, blocks: result.blocks, origin: 'api', createdAt: new Date().toISOString()}
      updateSession(activeSessionId, session => ({...session, documentProjectId: result.documentProjectId ?? session.documentProjectId, updatedAt: reply.createdAt, messages: [...session.messages, reply]}))
      if (result.documentProjectId) await refreshChatProject(result.documentProjectId)
    } finally { submittingRef.current = false; setSubmitting(false); setProgress('') }
  }

  function openFullEditor(project: DocumentProject) {
    setSelectedDocumentId(project.projectId)
    setSelectedDocument(project)
    setDocumentOpenVersion(value => value + 1)
    setSection('documents')
  }

  async function retryChatRequest() {
    const request = retryRequest.current
    if (!request || submittingRef.current) return
    submittingRef.current = true; setSubmitting(true)
    try {
      const result = await assistantGateway.submit(request, setProgress)
      if (result.status !== 'completed') throw new Error(result.message)
      const reply: ChatMessage = {id: crypto.randomUUID(), role: 'assistant', text: result.text, blocks: result.blocks, origin: 'api', createdAt: new Date().toISOString()}
      updateSession(request.conversationId, session => ({...session, messages: [...session.messages, reply], sources: [...(session.sources ?? []).filter(s => !result.sources.some(x => x.id === s.id)), ...result.sources], documentProjectId: result.documentProjectId ?? session.documentProjectId, workspace: result.workspace ?? session.workspace}))
      retryRequest.current = undefined; setRequestError('')
      if (result.documentProjectId) await refreshChatProject(result.documentProjectId)
    } catch {setRequestError('Не удалось получить результат. Проверьте проект: повторный запрос с тем же ID не выполняет операции заново.')}
    finally {submittingRef.current = false; setSubmitting(false); setProgress('')}
  }

  async function completeWorkingGroup(projectId: string, expectedVersion: number, fields: Record<string, string>) {
    const project = await documentsApi.patch(projectId, expectedVersion, fields)
    const id = activeSessionId
    if (id) {
      const time = new Date().toISOString()
      const reply: ChatMessage = {id: crypto.randomUUID(), role: 'assistant', createdAt: time, origin: 'api', text: `Реквизиты сохранены в проекте «${project.title}». Открываю его в редакторе.`}
      updateSession(id, session => ({
        ...session,
        documentProjectId: project.projectId,
        updatedAt: time,
        messages: [
          ...session.messages.map(message => ({...message, blocks: message.blocks?.map(block => block.type === 'working_group_wizard' && block.projectId === projectId ? {...block, completed: true} : block)})),
          reply,
        ],
      }))
    }
    setSelectedDocumentId(project.projectId)
    setSelectedDocument(project)
    setDocumentOpenVersion(value => value + 1)
    setSection('documents')
  }

  function openDocumentInChat(project: DocumentProject) {
    const id = activeSessionId ?? crypto.randomUUID()
    const time = new Date().toISOString()
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: `Открыт проект «${project.title}» (версия ${project.version}). Реквизиты можно менять в форме или через помощника.`,
      blocks: [{type: 'document_form', projectId: project.projectId}],
      createdAt: time,
      origin: 'api',
    }
    setSessions((previous) => {
      const current = previous.find((item) => item.id === id)
      const next: ChatSession = current
        ? {
            ...current,
            documentProjectId: project.projectId,
            messages: [...current.messages, message],
            updatedAt: time,
            workspace: { open: true, tab: 'document' },
          }
        : {
            id,
            title: project.title,
            documentProjectId: project.projectId,
            messages: [message],
            updatedAt: time,
            workspace: { open: true, tab: 'document' },
          }
      return [next, ...previous.filter((item) => item.id !== id)]
    })
    setActiveSessionId(id)
    setSelectedDocumentId(project.projectId)
    setSection('assistant')
  }

  function askKnowledge(source: KnowledgeCitation, scope: 'document' | 'section' = 'section') {
    const id = crypto.randomUUID()
    const time = new Date().toISOString()
    const session: ChatSession = {
      id,
      title: source.title.slice(0, 54),
      updatedAt: time,
      knowledgeSource: source,
      sources: [source],
      workspace: { open: true, tab: 'sources', selectedSourceId: source.id },
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          createdAt: time,
          origin: 'api',
          text:
            scope === 'document'
              ? 'Документ выбран для обсуждения. Его редакция и начальный пункт закреплены в контексте диалога.'
              : 'Источник закреплён в диалоге. Оригинальный пункт и редакция документа доступны в панели источников.',
          blocks: [{ type: 'citation', sourceId: source.id }],
        },
      ],
    }
    setSessions((previous) => [session, ...previous])
    setActiveSessionId(id)
    setSection('assistant')
    setDraft(
      scope === 'document'
        ? `Помоги разобраться с документом «${source.title}», редакция: ${source.versionLabel || 'не установлена'}.`
        : 'Объясни этот пункт простым языком: ' + source.locator,
    )
    setScenario('requirement')
    setFile(null)
    setRequestError('')
    history.pushState(null, '', location.pathname + location.search)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="app-shell selection:bg-blue-100">
      <Sidebar
        open={mobileOpen}
        section={section}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onClose={() => setMobileOpen(false)}
        onNewChat={startNewChat}
        onSection={(id) => {
          setSection(id)
          setMobileOpen(false)
          if (id === 'knowledge') {
            if (!location.hash.startsWith('#knowledge')) location.hash = '#knowledge'
          } else if (location.hash.startsWith('#knowledge'))
            history.pushState(null, '', location.pathname + location.search)
        }}
        onSession={(id) => {
          setActiveSessionId(id)
          setSection('assistant')
          setMobileOpen(false)
          if (location.hash.startsWith('#knowledge')) history.pushState(null, '', location.pathname + location.search)
        }}
        onClearHistory={() => {
          setSessions([])
          setActiveSessionId(null)
          setRequestError('')
        }}
      />
      <main className={`main-panel ${section === 'knowledge' ? 'main-panel-knowledge' : ''}`}>
        <Topbar
          section={section}
          onMenu={() => setMobileOpen(true)}
          onNewChat={startNewChat}
          workspaceOpen={section === 'assistant' && workspace.open}
          canOpenWorkspace={Boolean(activeSession)}
          onWorkspace={() =>
            activeSessionId &&
            updateSession(activeSessionId, (session) => ({
              ...session,
              workspace: {
                ...(session.workspace ?? closedWorkspace),
                open: true,
              },
            }))
          }
        />
        {section === 'assistant' ? (
          activeSession ? (
            <ConversationView
              session={activeSession}
              onSource={selectSource}
              onStartDocument={() => {
                setSelectedDocument(undefined)
                setSelectedDocumentId(activeSession.documentProjectId)
                setDocumentOpenVersion((value) => value + 1)
                setSection('documents')
              }}
              onCreateDocument={(templateId, requestId) => chatAction({selectTemplateId: templateId, requestId})}
              onConfirmAction={confirmActionId => chatAction({confirmActionId})}
              onOpenEditor={openFullEditor}
              disabled={submitting}
              onCompleteWorkingGroup={completeWorkingGroup}
            />
          ) : (
            <div className="chat-empty">
              <h1>Новый диалог</h1>
              <p>Задайте вопрос по базе знаний или опишите задачу.</p>
            </div>
          )
        ) : section === 'home' ? (
          <WelcomeView
            onChooseScenario={chooseScenario}
            onNavigate={setSection}
            sessions={sessions}
            onSession={(id) => {
              setActiveSessionId(id)
              setSection('assistant')
            }}
            onDocument={(id) => {
              setSelectedDocument(undefined)
              setSelectedDocumentId(id)
              setDocumentOpenVersion((v) => v + 1)
              setSection('documents')
            }}
          />
        ) : section === 'check' ? (
          <ReviewPage />
        ) : null}
        <div className="documents-host" hidden={section !== 'documents'}>
          <DocumentsPage
            initialProjectId={selectedDocumentId}
            initialProject={selectedDocument}
            openVersion={documentOpenVersion}
            onOpenChat={openDocumentInChat}
          />
        </div>
        <div className="knowledge-host" hidden={section !== 'knowledge'}>
          <KnowledgePage onAsk={askKnowledge} active={section === 'knowledge'} />
        </div>
        {requestError && (
          <p className="request-error" role="alert">
            {requestError}
            {retryRequest.current && <button type="button" disabled={submitting} onClick={() => void retryChatRequest()}>Получить результат повторно</button>}
          </p>
        )}
        {section === 'assistant' && submitting && <p className="chat-request-progress" role="status">{progress}</p>}
        {section === 'assistant' && (
          <Composer
            aiConfig={aiConfig}
            syntheticAcknowledged={syntheticAcknowledged}
            onSyntheticAcknowledged={value => {setSyntheticAcknowledged(value); try {sessionStorage.setItem('regula-synthetic-only', value ? '1' : '0')} catch { /* Consent remains in memory. */ }}}
            inputRef={inputRef}
            draft={draft}
            file={file}
            scenario={scenario}
            submitting={submitting}
            onDraft={setDraft}
            onFile={setFile}
            onScenario={setScenario}
            onSubmit={() => void submit()}
          />
        )}
      </main>
      {section === 'assistant' && activeSession && (
        <WorkspacePanel
          state={workspace}
          sources={activeSession.sources ?? []}
          documentProjectId={activeSession.documentProjectId}
          onOpenDocument={() => {
            setSelectedDocument(undefined)
            setSelectedDocumentId(activeSession.documentProjectId)
            setDocumentOpenVersion((value) => value + 1)
            setSection('documents')
          }}
          onOpenKnowledge={(sectionId) => {
            setSection('knowledge')
            location.hash = `knowledge/sections/${sectionId}`
          }}
          onClose={() =>
            updateSession(activeSession.id, (session) => ({
              ...session,
              workspace: {
                ...(session.workspace ?? closedWorkspace),
                open: false,
              },
            }))
          }
          onTab={setWorkspaceTab}
        />
      )}
    </div>
  )
}
