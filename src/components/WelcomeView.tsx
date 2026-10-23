import { ArrowRight, ClipboardCheck, FileCheck2, FilePlus2, Search, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { scenarios } from '../features/assistant/scenarios'
import type { Scenario } from '../features/assistant/types'

const quickActions: { id: Scenario; icon: LucideIcon; accent: string }[] = [
  { id: 'requirement', icon: Search, accent: 'blue' },
  { id: 'document', icon: FilePlus2, accent: 'violet' },
  { id: 'file-check', icon: FileCheck2, accent: 'teal' },
  { id: 'approval', icon: ClipboardCheck, accent: 'amber' },
]

export function WelcomeView({ onChooseScenario }: { onChooseScenario: (id: Scenario) => void }) {
  return <div className="welcome-area">
    <div className="welcome-inner">
      <div className="hero-symbol"><Sparkles size={28} strokeWidth={1.8} /></div>
      <div className="welcome-kicker">ВАШ РАБОЧИЙ АССИСТЕНТ</div>
      <h1>Чем могу помочь?</h1>
      <p className="welcome-description text-pretty">Найдите нужное требование, подготовьте документ или начните проверку — всё в одном рабочем пространстве.</p>
      <div className="quick-grid" aria-label="Быстрые действия">
        {quickActions.map(({ id, icon: Icon, accent }) => (
          <button className="quick-card" key={id} onClick={() => onChooseScenario(id)}>
            <span className={`quick-icon ${accent}`}><Icon size={22} strokeWidth={1.9} /></span>
            <span className="quick-copy"><strong>{scenarios[id].title}</strong><small>{scenarios[id].description}</small></span>
            <ArrowRight size={17} className="quick-arrow" />
          </button>
        ))}
      </div>
    </div>
  </div>
}
