import { useEffect, useRef } from 'react'
import { CircleHelp, FileText, Sparkles } from 'lucide-react'
import { scenarios } from '../features/assistant/scenarios'
import type { DocumentProject } from '../features/documents/types'
import type { ChatSession } from '../features/assistant/types'
import { formatFileSize, formatTime } from '../shared/format'
import { MessageMarkdown } from './MessageMarkdown'
import { ChatBlocks } from './ChatBlocks'

interface Props {
  session: ChatSession
  onSource: (id: string) => void
  onStartDocument: () => void
  onCreateDocument: (templateId: string, requestId: string) => Promise<void>
  onConfirmAction: (id: string) => Promise<void>
  onOpenEditor: (project: DocumentProject) => void
  disabled?: boolean
  onCompleteWorkingGroup: (projectId: string, expectedVersion: number, fields: Record<string, string>) => Promise<void>
}
export function ConversationView({ session, onSource, onStartDocument, onCreateDocument, onCompleteWorkingGroup, onConfirmAction, onOpenEditor, disabled }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }, [session.messages.length])

  return (
    <div className="conversation-area">
      <div className="conversation-inner">
        <div className="conversation-heading">
          <div className="small-spark">
            <Sparkles size={17} />
          </div>
          <div>
            <h1>{session.title}</h1>
            <p>Рабочий диалог · Источники и документы</p>
          </div>
        </div>
        <div className="messages">
          {session.messages.map((message) => (
            <div className={`message-row ${message.role === 'assistant' ? 'assistant' : ''}`} key={message.id}>
              <div className="message-bubble">
                {message.scenario && <span className="message-scenario">{scenarios[message.scenario].title}</span>}

                {message.text && <MessageMarkdown text={message.text} />}
                {message.file && (
                  <span className="message-file">
                    <FileText size={16} />
                    <span>{message.file.name}</span>
                    <small>{formatFileSize(message.file.size)}</small>
                  </span>
                )}
                {message.blocks && (
                  <ChatBlocks
                    blocks={message.blocks.filter(block => block.type !== 'document_form' || !session.messages.slice(session.messages.indexOf(message) + 1).some(m => m.blocks?.some(b => b.type === 'document_form' && b.projectId === block.projectId)))}
                    sources={session.sources ?? []}
                    onSource={onSource}
                    onStartDocument={onStartDocument}
                    onCreateDocument={templateId => onCreateDocument(templateId, message.id)}
                    onConfirmAction={onConfirmAction}
                    onOpenEditor={onOpenEditor}
                    disabled={disabled}
                    onCompleteWorkingGroup={onCompleteWorkingGroup}
                  />
                )}
                <time>{formatTime(message.createdAt)}</time>
              </div>
            </div>
          ))}
        </div>
        {!session.messages.some((message) => message.role === 'assistant') && (
          <div className="integration-note">
            <span className="note-icon">
              <CircleHelp size={18} />
            </span>
            <div>
              <strong>Источники из базы знаний</strong>
              <p>Поиск использует оригинальные материалы. Результаты поиска содержат ссылки на оригиналы.</p>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
