import { Menu, PanelRightOpen, Plus } from 'lucide-react'
import { navigation, type Section } from '../app/navigation'

interface TopbarProps {
  section: Section
  onMenu: () => void
  onNewChat: () => void
  workspaceOpen: boolean
  canOpenWorkspace: boolean
  onWorkspace: () => void
}

export function Topbar({ section, onMenu, onNewChat, workspaceOpen, canOpenWorkspace, onWorkspace }: TopbarProps) {
  return <header className="topbar">
    <div className="topbar-left">
      <button className="mobile-menu icon-button" aria-label="Открыть меню" onClick={onMenu}><Menu size={22} /></button>
      <div className="topbar-title"><span className="eyebrow">Рабочее пространство</span><strong>{navigation.find((item) => item.id === section)?.label}</strong></div>
    </div>
    <div className="topbar-right"><span className="prototype-pill"><span />Демо</span>{section === 'assistant' && canOpenWorkspace && !workspaceOpen && <button className="top-new panel-open" onClick={onWorkspace} title="Открыть рабочую панель"><PanelRightOpen size={17} />Панель</button>}<button className="top-new" onClick={onNewChat}><Plus size={17} />Новый диалог</button></div>
  </header>
}

