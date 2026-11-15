import { useEffect } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router'
import { MotionConfig } from 'motion/react'
import { ReceiptText } from 'lucide-react'
import Briefing from '@/pages/Briefing'
import Results from '@/pages/Compare'
import Home from '@/pages/Home'
import Leaderboard from '@/pages/Leaderboard'
import Receipt from '@/pages/Receipt'
import Run from '@/pages/Run'
import { sampleData } from '@/lib/data'
import { Button } from '@/components/ui/button'
import { RouteTransition } from '@/components/route-transition'

const nav = [
  { to: '/', label: 'Home' },
  { to: '/run', label: 'Run' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/briefing', label: 'Briefing Agent' },
]

function CompareRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/results${search}`} replace />
}

function ReceiptRedirect() {
  const { id } = useParams()
  return <Navigate to={`/?run=${encodeURIComponent(id ?? '')}`} replace />
}

function Shell() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = `Assay · ${pathname === '/results' ? 'Results' : nav.find(item => item.to === pathname)?.label ?? 'Run receipt'}`
  }, [pathname])

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="app-topbar">
      <div className="app-topbar-inner">
        <Link to="/" className="app-brand" aria-label="Assay home"><ReceiptText size={24} aria-hidden="true" />Assay</Link>
        <nav aria-label="Main navigation">{nav.map(({ to, label }) => <NavLink key={to} to={to} end aria-current={to === '/run' && pathname === '/results' ? 'page' : undefined} className={({ isActive }) => `app-navlink${isActive || to === '/run' && pathname === '/results' ? ' active' : ''}`}>{label}</NavLink>)}</nav>
        <span className="results-provenance">{sampleData ? 'Sample results' : 'Benchmark results'}</span>
      </div>
    </header>
    <main id="main-content" className="page-content">
      <RouteTransition>{location => <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/run" element={<Run />} />
        <Route path="/results" element={<Results />} />
        <Route path="/compare" element={<CompareRedirect />} />
        <Route path="/runs/:id" element={<ReceiptRedirect />} />
        <Route path="/briefing" element={<Briefing />} />
        <Route path="*" element={<div className="load-state"><h1>Page not found</h1><Button asChild><Link to="/">Back to Home</Link></Button></div>} />
      </Routes>}</RouteTransition>
    </main>
    <Receipt />
  </div>
}

export default function App() {
  return <BrowserRouter><MotionConfig reducedMotion="user" transition={{ type: 'spring', bounce: 0, duration: .45 }}><Shell /></MotionConfig></BrowserRouter>
}
