import { useEffect, useRef } from 'react'
import { CircleHelp, FileText, Sparkles } from 'lucide-react'
import { scenarios } from '../features/assistant/scenarios'
import type { ChatSession } from '../features/assistant/types'
import { formatFileSize, formatTime } from '../shared/format'
import { ChatBlocks } from './ChatBlocks'

interface Props { session: ChatSession; onSource: (id: string) => void; onStartDocument: () => void }
export function ConversationView({ session, onSource, onStartDocument }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages.length])

  return <div className="conversation-area">
    <div className="conversation-inner">
      <div className="conversation-heading"><div className="small-spark"><Sparkles size={17} /></div><div><h1>{session.title}</h1><p>Локальный диалог · демонстрационные ответы помечены</p></div></div>
      <div className="messages">
        {session.messages.map((message) => (
          <div className={`message-row ${message.role === 'assistant' ? 'assistant' : ''}`} key={message.id}>
            <div className="message-bubble">
              {message.scenario && <span className="message-scenario">{scenarios[message.scenario].title}</span>}
              {message.origin === 'demo' && <span className="demo-label">Демо · мок-данные</span>}
              {message.text && <p>{message.text}</p>}
              {message.file && <span className="message-file"><FileText size={16} /><span>{message.file.name}</span><small>{formatFileSize(message.file.size)}</small></span>}
              {message.blocks && <ChatBlocks blocks={message.blocks} sources={session.sources ?? []} onSource={onSource} onStartDocument={onStartDocument} />}
              <time>{formatTime(message.createdAt)}</time>
            </div>
          </div>
        ))}
      </div>
      {!session.messages.some((message) => message.role === 'assistant') && <div className="integration-note"><span className="note-icon"><CircleHelp size={18} /></span><div><strong>Демосценарий</strong><p>Чат пока отвечает по выдержкам из кейса. Документы создаются в отдельном серверном редакторе.</p></div></div>}
      <div ref={endRef} />
    </div>
  </div>
}


