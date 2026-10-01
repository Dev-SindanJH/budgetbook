import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../context/UIContext'
import Icon from './Icon'

const NAV_ITEMS = [
  { to: '/', label: '홈', icon: 'home', end: true },
  { to: '/transactions', label: '내역', icon: 'list' },
  { to: '/statistics', label: '분석', icon: 'chart' },
  { to: '/budget', label: '자산', icon: 'wallet' },
]
export default function Layout() {
  const { family, profile, signOut } = useAuth()
  const { notify } = useUI()
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  const navigation = NAV_ITEMS.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  ))
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        본문으로 이동
      </a>
      <header className="topnav">
        <div className="topnav-inner">
          <NavLink to="/" className="topnav-brand">
            <img src="./favicon.svg" alt="" className="brand-icon" />
            <span>
              우리집 가계부<span className="brand-caption">BUDGETBOOK</span>
            </span>
          </NavLink>
          <nav className="topnav-links desktop-only" aria-label="주 메뉴">
            {navigation}
          </nav>
          <div className="topnav-right">
            <span className="family-badge desktop-only">
              <Icon name="people" size={16} />
              {family?.name || profile?.name}
            </span>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `icon-button${isActive ? ' active' : ''}`
              }
              aria-label="설정"
            >
              <Icon name="settings" />
            </NavLink>
            <button
              className="icon-button desktop-only"
              aria-label="로그아웃"
              onClick={async () => {
                try {
                  await signOut()
                } catch {
                  notify('로그아웃하지 못했어요. 다시 시도해주세요.', true)
                }
              }}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" className="page" tabIndex={-1}>
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="모바일 주 메뉴">
        {navigation}
      </nav>
    </div>
  )
}
