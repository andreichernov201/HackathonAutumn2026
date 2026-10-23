import { ArrowRight } from 'lucide-react'
import { sectionDetails, type Section } from '../app/navigation'
import type { Scenario } from '../features/assistant/types'

interface SectionViewProps {
  section: Exclude<Section, 'assistant'>
  onChooseScenario: (id: Scenario) => void
}

export function SectionView({ section, onChooseScenario }: SectionViewProps) {
  const details = sectionDetails[section]
  const Icon = details.icon

  return <div className="section-area">
    <div className="section-empty">
      <div className="section-icon"><Icon size={27} /></div>
      <h1>{details.title}</h1>
      <p>{details.text}</p>
      <button onClick={() => onChooseScenario(details.scenario)}>{details.action}<ArrowRight size={17} /></button>
    </div>
  </div>
}
