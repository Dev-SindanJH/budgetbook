import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import {
  RequireAuth,
  RequireFamily,
  RedirectIfReady,
} from './components/RouteGuards'
const Login = lazy(() => import('./pages/Login'))
const FamilySetup = lazy(() => import('./pages/FamilySetup'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Transactions = lazy(() => import('./pages/Transactions'))
const Statistics = lazy(() => import('./pages/Statistics'))
const Budget = lazy(() => import('./pages/Budget'))
const Settings = lazy(() => import('./pages/Settings'))

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="page-loading" role="status">
          화면을 준비하고 있어요…
        </div>
      }
    >
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
    </Suspense>
  )
}
