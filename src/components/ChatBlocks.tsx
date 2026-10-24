import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, FilePlus2, FileText, ListChecks } from 'lucide-react'
import { useState } from 'react'
import type { ChatBlock, SourceReference } from '../features/assistant/types'

interface Props {
  blocks: ChatBlock[]
  sources: SourceReference[]
  onSource: (id: string) => void
  onStartDocument: () => void
  onCreateDocument: (templateId: string) => Promise<void>
}

export function ChatBlocks({ blocks, sources, onSource, onStartDocument, onCreateDocument }: Props) {
  const [creatingTemplateId, setCreatingTemplateId] = useState<string>()
  const [createError, setCreateError] = useState('')
  async function create(templateId: string) {
    setCreatingTemplateId(templateId)
    setCreateError('')
    try { await onCreateDocument(templateId) } catch { setCreateError('Не удалось создать проект. Попробуйте ещё раз.') }
    finally { setCreatingTemplateId(undefined) }
  }
  return (
    <div className="chat-blocks">
      {blocks.map((block, index) => {
        if (block.type === 'citation') {
          const source = sources.find((item) => item.id === block.sourceId)
          if (!source) return null
          return (
            <a
              key={index}
              className="citation-card"
              href={source.sourceReference || '#source-' + source.id}
              onClick={(event) => {
                event.preventDefault()
                onSource(source.id)
              }}
            >
              <BookOpen size={16} />
              <span>
                <strong>
                  {source.title} · {source.locator}
                </strong>
                <small>{source.excerpt}</small>
                <em>
                  {source.provenance === 'knowledge'
                    ? `Источник из базы знаний · редакция: ${source.versionLabel || 'не установлена'}`
                    : 'Выдержка из условий кейса · оригинал не загружен'}
                </em>
              </span>
              <ArrowRight size={15} />
            </a>
          )
        }
        if (block.type === 'task_progress')
          return (
            <section key={index} className="result-card">
              <h3>
                <ListChecks size={16} />
                {block.title}
              </h3>
              <ol className="progress-list">
                {block.steps.map((step) => (
                  <li key={step.label} className={step.state}>
                    {step.label}
                  </li>
                ))}
              </ol>
            </section>
          )
        if (block.type === 'clarification')
          return (
            <section key={index} className="result-card clarification-card">
              <h3>
                <CircleHelp size={16} />
                Нужно уточнить
              </h3>
              <p>{block.question}</p>
              <button type="button" onClick={onStartDocument}>
                Открыть редактор <ArrowRight size={14} />
              </button>
            </section>
          )
        if (block.type === 'document_card')
          return (
            <section key={index} className="result-card">
              <h3>
                <FileText size={16} />
                {block.title}
              </h3>
              <p>{block.summary}</p>
              <small>{block.status === 'draft' ? 'Черновик' : 'ожидает данные'}</small>
              <button type="button" onClick={onStartDocument}>
                Открыть редактор <ArrowRight size={14} />
              </button>
            </section>
          )
        if (block.type === 'template_suggestions')
          return <section key={index} className="template-suggestions" aria-label="Модули DOCX">
            <h3><FileText size={16} />Выберите модуль DOCX</h3>
            <p>{block.recommendedTemplateId ? 'Подходящий модуль отмечен по формулировке запроса. Можно выбрать другой из доступного каталога.' : 'В запросе не удалось однозначно определить тип. Выберите один из доступных модулей.'}</p>
            <div className="template-suggestion-list">{block.templates.map(template => <article className={`template-suggestion ${template.templateId === block.recommendedTemplateId ? 'recommended' : ''}`} key={template.templateId}>
              <div><small>{template.templateId === block.recommendedTemplateId ? 'Рекомендуется' : template.kind}</small><strong>{template.title}</strong><span>{template.note}</span></div>
              <button type="button" disabled={template.sourceStatus !== 'ready' || Boolean(creatingTemplateId)} onClick={() => void create(template.templateId)}><FilePlus2 size={14}/>{creatingTemplateId === template.templateId ? 'Создаём…' : 'Создать и открыть'}</button>
            </article>)}</div>
            {createError && <p className="template-create-error" role="alert">{createError}</p>}
          </section>
        return (
          <section key={index} className="result-card">
            <h3>
              <CheckCircle2 size={16} />
              Проверка:{' '}
              {block.outcome === 'pass' ? 'пройдено' : block.outcome === 'blocked' ? 'не выполнено' : 'нужна проверка'}
            </h3>
            <ul className="validation-list">
              {block.checks.map((check) => (
                <li key={check.label}>
                  <strong>{check.label}:</strong> {check.detail}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {blocks.some(
        (block) =>
          block.type === 'citation' &&
          sources.find((source) => source.id === block.sourceId)?.provenance === 'case-excerpt',
      ) &&
        !blocks.some((block) => block.type === 'document_card') && (
          <button className="document-next" type="button" onClick={onStartDocument}>
            Создать проект распоряжения <ArrowRight size={14} />
          </button>
        )}
    </div>
  )
}
