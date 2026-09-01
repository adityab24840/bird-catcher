import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { toggleTheme, isDark } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex items-center justify-center rounded-xl transition-all active:scale-90 ${className}`}
      style={{
        width: 36,
        height: 36,
        background: 'var(--c-bg-surface)',
        border: '1px solid var(--c-border)',
        color: 'var(--c-text-2)',
        fontSize: 16,
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
