import { useRef, type RefObject, type KeyboardEvent } from 'react'
import { Check, FileText, Paperclip, Send, Sparkles, X } from 'lucide-react'
import { scenarios } from '../features/assistant/scenarios'
import type { Scenario } from '../features/assistant/types'
import { formatFileSize } from '../shared/format'

interface ComposerProps {
  inputRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  file: File | null
  scenario?: Scenario
  submitting: boolean
  onDraft: (value: string) => void
  onFile: (file: File | null) => void
  onScenario: (value: Scenario | undefined) => void
  onSubmit: () => void
}

export function Composer({ inputRef, draft, file, scenario, submitting, onDraft, onFile, onScenario, onSubmit }: ComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit()
    }
  }

  return <div className="composer-wrap">
    <form className="composer" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
      {file && <div className="attached-file"><FileText size={16} /><span>{file.name}</span><small>{formatFileSize(file.size)}</small><button type="button" aria-label="Убрать файл" onClick={() => onFile(null)}><X size={15} /></button></div>}
      {scenario && <div className="scenario-chip"><Sparkles size={14} />{scenarios[scenario].title}<button type="button" onClick={() => onScenario(undefined)} aria-label="Убрать сценарий"><X size={13} /></button></div>}
      <div className="composer-row">
        <input ref={fileRef} type="file" className="visually-hidden" onChange={(event) => { onFile(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} aria-label="Выбрать файл" />
        <button className="attach-button" type="button" aria-label="Прикрепить файл" title="Прикрепить файл" onClick={() => fileRef.current?.click()}><Paperclip size={20} /></button>
        <textarea ref={inputRef} rows={1} value={draft} onChange={(event) => onDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Задайте вопрос или опишите задачу..." aria-label="Ваш запрос" />
        <button className="send-button" type="submit" aria-label="Отправить запрос" title="Отправить запрос" disabled={(!draft.trim() && !file) || submitting}><Send size={19} fill="currentColor" strokeWidth={1.6} /></button>
      </div>
    </form>
    <p className="composer-caption"><Check size={13} />Демо на выдержках из условий кейса. Файлы не читаются; AI, DOCX и согласование не подключены.</p>
  </div>
}

