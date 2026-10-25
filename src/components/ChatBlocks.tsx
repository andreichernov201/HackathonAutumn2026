import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, FilePlus2, FileText, ListChecks } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChatBlock, SourceReference } from '../features/assistant/types'
import { documentsApi } from '../features/documents/api'
import type { DocumentProject } from '../features/documents/types'
import { DocumentChatForm } from './DocumentChatForm'
import { WorkingGroupWizard } from './WorkingGroupWizard'

interface Props {
  blocks: ChatBlock[]
  sources: SourceReference[]
  onSource: (id: string) => void
  onStartDocument: () => void
  onCreateDocument: (templateId: string) => Promise<void>
  onConfirmAction: (id: string) => Promise<void>
  onOpenEditor: (project: DocumentProject) => void
  disabled?: boolean
  onCompleteWorkingGroup: (projectId: string, expectedVersion: number, fields: Record<string, string>) => Promise<void>
}

export function ChatBlocks({ blocks, sources, onSource, onStartDocument, onCreateDocument, onCompleteWorkingGroup, onConfirmAction, onOpenEditor, disabled }: Props) {
  const [creatingTemplateId, setCreatingTemplateId] = useState<string>()
  const [createError, setCreateError] = useState('')
  const creating = useRef(false)
  const [created, setCreated] = useState(false)
  const [confirming, setConfirming] = useState(false)
  async function create(templateId: string) {
    if (creating.current || created || disabled) return
    creating.current = true
    setCreatingTemplateId(templateId)
    setCreateError('')
    try { await onCreateDocument(templateId); setCreated(true) } catch { setCreateError('Не удалось создать проект. Попробуйте ещё раз.') }
    finally { creating.current = false; setCreatingTemplateId(undefined) }
  }
  return (
    <div className="chat-blocks">
      {blocks.map((block, index) => {
        if (block.type === 'document_form') return <DocumentChatForm key={block.projectId} projectId={block.projectId} disabled={disabled} onOpenEditor={onOpenEditor}/>
        if (block.type === 'document_preview') return <DocumentChatForm key={index} projectId={block.projectId} disabled={disabled} onOpenEditor={onOpenEditor}/>
        if (block.type === 'download_artifact') return <button type="button" className="ui-button ui-button-primary" key={index} disabled={disabled} onClick={() => {void documentsApi.get(block.projectId).then(project => {if (project.version !== block.projectVersion) throw new Error('version_conflict'); return documentsApi.download(block.projectId, block.artifactId, block.filename)}).catch(() => setCreateError('Файл относится к предыдущей версии. Сформируйте DOCX для актуального проекта.'))}}>Скачать DOCX · версия {block.projectVersion}</button>
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
              {block.confirmation ? <button type="button" disabled={disabled || confirming} onClick={() => {setConfirming(true); void onConfirmAction(block.confirmation!.id).catch(() => setCreateError('Не удалось сформировать DOCX. Проверьте версию и повторите запрос.')).finally(() => setConfirming(false))}}>Подтвердить формирование DOCX</button> : block.fields.length > 0 && <button type="button" onClick={onStartDocument}>Открыть редактор <ArrowRight size={14}/></button>}
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
              <button type="button" disabled={disabled || created || template.sourceStatus !== 'ready' || Boolean(creatingTemplateId)} onClick={() => void create(template.templateId)}><FilePlus2 size={14}/>{creatingTemplateId === template.templateId ? 'Создаём…' : created ? 'Проект создан' : 'Создать в чате'}</button>
            </article>)}</div>
            {createError && <p className="template-create-error" role="alert">{createError}</p>}
          </section>
        if (block.type === 'working_group_wizard') return <WorkingGroupWizard key={index} projectId={block.projectId} projectTitle={block.projectTitle} projectVersion={block.projectVersion} initialFields={block.fields} fieldSpecs={block.fieldSpecs} completed={block.completed} onComplete={onCompleteWorkingGroup}/>
        return (
          <section key={index} className="result-card">
            <h3>
              <CheckCircle2 size={16} />
              Проверка:{' '}
              {block.outcome === 'pass' ? 'пройдено' : block.outcome === 'blocked' ? 'не выполнено' : 'нужна проверка'}
            </h3>
            <details open={block.checks.length <= 4}><summary>Результаты проверки: {block.checks.length}</summary>
            <ul className="validation-list">
              {block.checks.map((check) => (
                <li key={check.label}>
                  <strong>{check.label}:</strong> {check.detail}
                </li>
              ))}
            </ul></details>
          </section>
        )
      })}
      {createError && <p className="error-state" role="alert">{createError}</p>}
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
