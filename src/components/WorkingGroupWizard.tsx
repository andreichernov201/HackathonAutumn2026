import { Check, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FieldSpec } from '../features/documents/types'

type ItRelation = 'yes' | 'no' | 'unknown'

interface Props {
  projectId: string
  projectTitle: string
  projectVersion: number
  initialFields: Record<string, string>
  fieldSpecs: FieldSpec[]
  completed?: boolean
  onComplete: (projectId: string, expectedVersion: number, fields: Record<string, string>) => Promise<void>
}

const relationLabels: Record<ItRelation, string> = {yes: 'Да', no: 'Нет', unknown: 'Не знаю'}

export function WorkingGroupWizard({projectId, projectTitle, projectVersion, initialFields, fieldSpecs, completed, onComplete}: Props) {
  const [step, setStep] = useState(0)
  const [itRelation, setItRelation] = useState<ItRelation>()
  const [fields, setFields] = useState<Record<string, string>>(initialFields)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const missingSpecs = useMemo(() => fieldSpecs.filter(spec => spec.required && !initialFields[spec.key]?.trim()), [fieldSpecs, initialFields])
  const missingComplete = missingSpecs.every(spec => fields[spec.key]?.trim())

  if (completed) return <section className="working-group-wizard completed" aria-label="Мастер рабочей группы"><Check size={17}/><div><strong>Реквизиты сохранены</strong><p>Существующий проект заполнен и готов к продолжению в редакторе.</p></div></section>

  async function save() {
    setSaving(true); setError('')
    try { await onComplete(projectId, projectVersion, fields) }
    catch { setError('Не удалось сохранить реквизиты. Проект не изменён; попробуйте ещё раз.') }
    finally { setSaving(false) }
  }

  return <section className="working-group-wizard" aria-label="Мастер рабочей группы">
    <div className="wizard-head"><div><small>Проект рабочей группы</small><h3>{projectTitle}</h3></div><span>Шаг {step + 1} из 3</span></div>
    <ol className="wizard-progress" aria-label="Шаги мастера"><li className={step >= 0 ? 'active' : ''}>Связь с ИТ</li><li className={step >= 1 ? 'active' : ''}>Реквизиты</li><li className={step >= 2 ? 'active' : ''}>Подтверждение</li></ol>

    {step === 0 && <div className="wizard-step"><h4>Рабочая группа связана с ИТ?</h4><p>Ответ нужен для контекста мастера. Он не попадёт в DOCX, потому что такого поля нет в действующей схеме.</p><div className="wizard-choice">{(['yes', 'no', 'unknown'] as ItRelation[]).map(value => <button type="button" className={itRelation === value ? 'selected' : ''} onClick={() => setItRelation(value)} key={value}>{relationLabels[value]}</button>)}</div></div>}

    {step === 1 && <div className="wizard-step"><h4>Недостающие реквизиты</h4>{missingSpecs.length ? <div className="wizard-fields">{missingSpecs.map(spec => <label key={spec.key}><span>{spec.label} <b>*</b></span>{spec.multiline ? <textarea value={fields[spec.key] || ''} onChange={event => setFields(current => ({...current, [spec.key]: event.target.value}))}/> : spec.inputType === 'select' ? <select value={fields[spec.key] || ''} onChange={event => setFields(current => ({...current, [spec.key]: event.target.value}))}><option value="">Выберите вариант</option>{spec.options.map(option => <option key={option}>{option}</option>)}</select> : <input type={spec.inputType} value={fields[spec.key] || ''} onChange={event => setFields(current => ({...current, [spec.key]: event.target.value}))}/>}</label>)}</div> : <p className="wizard-ready">Все обязательные реквизиты проекта уже заполнены.</p>}</div>}

    {step === 2 && <div className="wizard-step"><h4>Подтвердите заполнение проекта</h4><dl className="wizard-summary"><div><dt>Связь с ИТ</dt><dd>{itRelation && relationLabels[itRelation]}</dd></div>{missingSpecs.map(spec => <div key={spec.key}><dt>{spec.label}</dt><dd>{fields[spec.key]}</dd></div>)}</dl><p>Будет обновлён проект <code>{projectId}</code>. Новый проект создаваться не будет.</p></div>}

    {error && <p className="wizard-error" role="alert">{error}</p>}
    <div className="wizard-actions">{step > 0 && <button type="button" className="secondary" disabled={saving} onClick={() => setStep(value => value - 1)}><ChevronLeft size={14}/>Назад</button>}<span/>{step < 2 ? <button type="button" disabled={(step === 0 && !itRelation) || (step === 1 && !missingComplete)} onClick={() => setStep(value => value + 1)}>Далее<ChevronRight size={14}/></button> : <button type="button" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={14}/> : <Check size={14}/>}Заполнить проект</button>}</div>
  </section>
}
