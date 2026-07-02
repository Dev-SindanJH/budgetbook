import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { RequireAuth, RequireFamily, RedirectIfReady } from './components/RouteGuards'
import Login from './pages/Login'
import FamilySetup from './pages/FamilySetup'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Statistics from './pages/Statistics'
import Budget from './pages/Budget'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfReady>
            <Login />
          </RedirectIfReady>
        }
      />
      <Route
        path="/family-setup"
        element={
          <RequireAuth>
            <FamilySetup />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireFamily>
            <Layout />
          </RequireFamily>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/statistics" element={<Statistics />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
