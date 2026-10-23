import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, FileText, ListChecks } from 'lucide-react'
import type { ChatBlock, SourceReference, WorkspaceTab } from '../features/assistant/types'

interface Props {
  blocks: ChatBlock[]
  sources: SourceReference[]
  onSource: (id: string) => void
  onTab: (tab: WorkspaceTab) => void
  onStartDocument: () => void
}

export function ChatBlocks({ blocks, sources, onSource, onTab, onStartDocument }: Props) {
  return <div className="chat-blocks">
    {blocks.map((block, index) => {
      if (block.type === 'citation') {
        const source = sources.find((item) => item.id === block.sourceId)
        if (!source) return null
        return <a key={index} className="citation-card" href={'#source-' + source.id} onClick={() => onSource(source.id)}>
          <BookOpen size={16} /><span><strong>{source.title} · {source.locator}</strong><small>{source.excerpt}</small><em>Выдержка из условий кейса · оригинал не загружен</em></span><ArrowRight size={15} />
        </a>
      }
      if (block.type === 'task_progress') return <section key={index} className="result-card"><h3><ListChecks size={16} />{block.title}</h3><ol className="progress-list">{block.steps.map((step) => <li key={step.label} className={step.state}>{step.label}</li>)}</ol></section>
      if (block.type === 'clarification') return <section key={index} className="result-card clarification-card"><h3><CircleHelp size={16} />Нужно уточнить</h3><p>{block.question}</p><button type="button" onClick={() => onTab('document')}>Открыть поля проекта <ArrowRight size={14} /></button></section>
      if (block.type === 'document_card') return <section key={index} className="result-card"><h3><FileText size={16} />{block.title}</h3><p>{block.summary}</p><small>Демо · {block.status === 'draft' ? 'черновик, не DOCX' : 'ожидает данные'}</small><button type="button" onClick={() => onTab('document')}>Открыть проект <ArrowRight size={14} /></button></section>
      return <section key={index} className="result-card"><h3><CheckCircle2 size={16} />Проверка: {block.outcome === 'pass' ? 'пройдено' : block.outcome === 'blocked' ? 'не выполнено' : 'нужна проверка'}</h3><ul className="validation-list">{block.checks.map((check) => <li key={check.label}><strong>{check.label}:</strong> {check.detail}</li>)}</ul></section>
    })}
    {blocks.some((block) => block.type === 'citation') && !blocks.some((block) => block.type === 'document_card') && <button className="document-next" type="button" onClick={onStartDocument}>Создать проект распоряжения <ArrowRight size={14} /></button>}
  </div>
}
