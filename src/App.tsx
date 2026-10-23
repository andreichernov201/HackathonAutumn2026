import { useEffect, useRef, useState } from 'react'
import { type Section } from './app/navigation'
import { Composer } from './components/Composer'
import { ConversationView } from './components/ConversationView'
import { SectionView } from './components/SectionView'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { WelcomeView } from './components/WelcomeView'
import { assistantGateway } from './features/assistant/gateway'
import { scenarios } from './features/assistant/scenarios'
import { sessionStore } from './features/assistant/sessionStore'
import type { ChatMessage, ChatSession, Scenario } from './features/assistant/types'

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

  useEffect(() => sessionStore.save(sessions), [sessions])

  function startNewChat() {
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

  function chooseSection(id: Section) {
    setSection(id)
    setMobileOpen(false)
  }

  async function submit() {
    const text = draft.trim()
    if ((!text && !file) || submitting) return

    const now = new Date().toISOString()
    const id = activeSessionId ?? crypto.randomUUID()
    const title = text.replace(/\s+/g, ' ').slice(0, 54) || file?.name || 'Новый диалог'
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      createdAt: now,
      scenario,
      ...(file ? { file: { name: file.name, size: file.size, type: file.type } } : {}),
    }

    setSessions((previous) => {
      const existing = previous.find((item) => item.id === id)
      const updated: ChatSession = existing
        ? { ...existing, updatedAt: now, messages: [...existing.messages, message] }
        : { id, title, updatedAt: now, messages: [message] }
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
      const result = await assistantGateway.submit({ text, scenario, ...(file ? { file } : {}) })
      if (result.status === 'completed') {
        const reply: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', text: result.text, createdAt: new Date().toISOString() }
        setSessions((previous) => previous.map((item) => item.id === id ? { ...item, updatedAt: reply.createdAt, messages: [...item.messages, reply] } : item))
      }
    } catch {
      setRequestError('Не удалось отправить запрос. Попробуйте ещё раз позже.')
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
      onSection={chooseSection}
      onSession={(id) => { setActiveSessionId(id); chooseSection('assistant') }}
      onClearHistory={() => { setSessions([]); setActiveSessionId(null); setRequestError('') }}
    />
    <main className="main-panel">
      <Topbar section={section} onMenu={() => setMobileOpen(true)} onNewChat={startNewChat} />
      {section === 'assistant'
        ? activeSession
          ? <ConversationView session={activeSession} />
          : <WelcomeView onChooseScenario={chooseScenario} />
        : <SectionView section={section} onChooseScenario={chooseScenario} />}
      {requestError && <p className="request-error" role="alert">{requestError}</p>}
      <Composer
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
    </main>
  </div>
}
