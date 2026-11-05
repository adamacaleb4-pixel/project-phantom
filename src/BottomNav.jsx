
import './BottomNav.css'

const tabs = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'calendar', label: 'Calendar', icon: '▦' },
  { id: 'journal', label: 'Journal', icon: '▤' },
  { id: 'progress', label: 'Progress', icon: '▥' },
  { id: 'more', label: 'More', icon: '☰' }
]

function BottomNav({ activeTab, setActiveTab }) {
  return (
    <nav className="bottom-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={activeTab === tab.id ? 'nav-item active' : 'nav-item'}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="nav-icon">{tab.icon}</span>
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

export default BottomNav
