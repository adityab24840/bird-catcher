import { useNavigate } from 'react-router-dom'

type Tab = 'home' | 'timeline' | 'stats'

export default function BottomNav({ current }: { current: Tab }) {
  const navigate = useNavigate()

  const tabs: { id: Tab; label: string; path: string; icon: React.ReactNode }[] = [
    {
      id: 'home',
      label: 'Today',
      path: '/home',
      icon: (
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M3 12L12 3l9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: 'timeline',
      label: 'Timeline',
      path: '/timeline',
      icon: (
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'stats',
      label: 'Stats',
      path: '/stats',
      icon: (
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
          <path d="M4 20V14M8 20V10M12 20V6M16 20V12M20 20V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex z-50"
      style={{ background: '#1C2B1E', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => navigate(tab.path)}
          className="flex-1 flex flex-col items-center pt-3 pb-1 gap-1"
          style={{ color: current === tab.id ? '#8FAF8A' : '#4A5C4A' }}
        >
          {tab.icon}
          <span className="text-[9px] tracking-[0.15em] uppercase font-semibold">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
