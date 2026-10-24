import { useState } from 'react'
import { ChevronDown, ShieldCheck, MessageSquareText, Plus, X } from 'lucide-react'
import { navigation, type Section } from '../app/navigation'
import type { ChatSession } from '../features/assistant/types'
import { formatTime } from '../shared/format'

interface SidebarProps {
  open: boolean
  section: Section
  sessions: ChatSession[]
  activeSessionId: string | null
  onClose: () => void
  onNewChat: () => void
  onSection: (section: Section) => void
  onSession: (id: string) => void
  onClearHistory: () => void
}

export function Sidebar({
  open,
  section,
  sessions,
  activeSessionId,
  onClose,
  onNewChat,
  onSection,
  onSession,
  onClearHistory,
}: SidebarProps) {
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <>
      {open && <button className="mobile-scrim" aria-label="Закрыть меню" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            R<span className="brand-spark">✦</span>
          </div>
          <div className="brand-copy">
            <strong>Regula AI</strong>
            <span>Работа с документами</span>
          </div>
          <button className="mobile-close icon-button" aria-label="Закрыть меню" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <button className="new-chat" onClick={onNewChat}>
          <Plus size={18} strokeWidth={2.4} />
          Новый диалог
        </button>

        <nav className="primary-nav" aria-label="Основная навигация">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${section === id ? 'active' : ''}`}
              onClick={() => onSection(id)}
              aria-current={section === id ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={section === id ? 2.2 : 1.9} /> <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="history-block">
          <div className="history-heading">
            <span className="sidebar-heading">Недавние диалоги</span>
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Удалить историю диалогов? Это действие нельзя отменить.')) onClearHistory()
                }}
                title="Очистить историю диалогов"
              >
                Очистить
              </button>
            )}
          </div>
          <div className="history-list">
            {sessions.length ? (
              sessions.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  className={`history-item ${section === 'assistant' && item.id === activeSessionId ? 'selected' : ''}`}
                  onClick={() => onSession(item.id)}
                >
                  <MessageSquareText size={15} />
                  <span className="history-copy">
                    <strong>{item.title}</strong>
                    <small>{formatTime(item.updatedAt)}</small>
                  </span>
                </button>
              ))
            ) : (
              <p className="history-empty">Пока нет диалогов</p>
            )}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-help">
            <ShieldCheck size={16} />
            <span>Работа с источниками</span>
          </div>
          <button
            className="profile-button"
            onClick={() => setProfileOpen((value) => !value)}
            aria-expanded={profileOpen}
          >
            <span className="avatar">Р</span>
            <span className="profile-copy">
              <strong>Рабочий профиль</strong>
              <small>Рабочее пространство</small>
            </span>
            <ChevronDown size={16} className={profileOpen ? 'rotated' : ''} />
          </button>
          {profileOpen && (
            <div className="profile-popover" role="status">
              <strong>Рабочее пространство</strong>
              <span>
                Документы сохраняются в текущем рабочем пространстве. История диалогов доступна на этом устройстве.
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
