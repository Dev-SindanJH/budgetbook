import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: '홈', end: true },
  { to: '/transactions', label: '내역' },
  { to: '/statistics', label: '통계' },
  { to: '/budget', label: '예산' },
  { to: '/settings', label: '설정' },
]

export default function Layout() {
  const { family, profile, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="app-shell">
      <header className="topnav">
        <div className="topnav-brand">
          💰 우리집 가계부
          {family && <span className="topnav-family">{family.name}</span>}
        </div>
        <nav className="topnav-links desktop-only">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'topnav-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topnav-right desktop-only">
          <span className="hint-text">{profile?.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            로그아웃
          </button>
        </div>
        <button
          className="menu-toggle"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="메뉴 열기"
          aria-expanded={menuOpen}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>

      {menuOpen && (
        <nav className="mobile-menu">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => 'topnav-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
          <div className="mobile-menu-footer">
            <span className="hint-text">{profile?.name}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setMenuOpen(false)
                signOut()
              }}
            >
              로그아웃
            </button>
          </div>
        </nav>
      )}

      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
