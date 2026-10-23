import { useEffect, useRef } from 'react'
import { CircleHelp, FileText, Sparkles } from 'lucide-react'
import { scenarios } from '../features/assistant/scenarios'
import type { ChatSession } from '../features/assistant/types'
import { formatFileSize, formatTime } from '../shared/format'

export function ConversationView({ session }: { session: ChatSession }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages.length])

  return <div className="conversation-area">
    <div className="conversation-inner">
      <div className="conversation-heading"><div className="small-spark"><Sparkles size={17} /></div><div><h1>{session.title}</h1><p>Диалог</p></div></div>
      <div className="messages">
        {session.messages.map((message) => (
          <div className={`message-row ${message.role === 'assistant' ? 'assistant' : ''}`} key={message.id}>
            <div className="message-bubble">
              {message.scenario && <span className="message-scenario">{scenarios[message.scenario].title}</span>}
              {message.text && <p>{message.text}</p>}
              {message.file && <span className="message-file"><FileText size={16} /><span>{message.file.name}</span><small>{formatFileSize(message.file.size)}</small></span>}
              <time>{formatTime(message.createdAt)}</time>
            </div>
          </div>
        ))}
      </div>
      {!session.messages.some((message) => message.role === 'assistant') && <div className="integration-note"><span className="note-icon"><CircleHelp size={18} /></span><div><strong>Ответ недоступен</strong><p>Запрос сохранён только в этом браузере. Обработка файла и поиск по нормативной базе сейчас недоступны.</p></div></div>}
      <div ref={endRef} />
    </div>
  </div>
}
