import { useEffect } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { ArrowUpRight, ArrowLeftRight, Beaker, BookOpen, FlaskConical, Home as HomeIcon, Play, Trophy } from 'lucide-react'
import Briefing from '@/pages/Briefing'
import Compare from '@/pages/Compare'
import Home from '@/pages/Home'
import Leaderboard from '@/pages/Leaderboard'
import Receipt from '@/pages/Receipt'
import Run from '@/pages/Run'
import { apiMode, sampleData } from '@/lib/data'
import { Button } from '@/components/ui/button'
import { RouteTransition } from '@/components/route-transition'


const nav = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/run', label: 'Run', icon: Play },
  { to: '/compare', label: 'Compare', icon: ArrowLeftRight },
  { to: '/briefing', label: 'Brief', icon: BookOpen },
]
function Shell() {
  const { pathname } = useLocation()
  useEffect(() => { document.title = `Assay · ${nav.find(item => item.to === pathname)?.label ?? 'Run receipt'}` }, [pathname])
  return <div className="app-shell launcher-theme">
    <aside className="sidebar">
      <Link to="/" className="brand"><span className="brand-mark"><FlaskConical size={23} /></span>assay<span className="brand-period">.</span><span className="brand-edition">RESEARCH LAB</span></Link>
      <p className="workspace-label">EXPLORE</p>
      <nav aria-label="Main navigation">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={18} />{label}<span className="nav-dot" /></NavLink>)}</nav>
      <div className="launcher-bottom"><Link to="/#methodology" className="methodology-shortcut"><BookOpen size={15} /> How the benchmark works <ArrowUpRight size={13} /></Link><div className="launcher-health"><span className="status-dot" />{apiMode ? 'API transport configured' : 'Local demo · No provider calls'}</div><p className="launcher-version">ASSAY <span>Research agents, tested fairly.</span></p></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div><Beaker size={16} /><span>Research workspace</span><span className="slash">/</span><strong>{nav.find(item => item.to === pathname)?.label ?? 'Run receipt'}</strong></div><span className="environment"><span className="status-dot" />{sampleData ? 'Sample results' : 'Benchmark results'}</span></header>
      <div className="mode-banner"><span><span className="demo-dot" />{apiMode ? 'Configured API · Results provenance is set by VITE_RESULTS_ARE_FIXTURES.' : 'Demo data · Illustrative fixtures, not measured benchmark findings.'}</span><span>{apiMode ? 'No fixture fallback' : 'No API keys needed'}</span></div>
      <main><RouteTransition>{location => <Routes location={location}><Route path="/" element={<Home />} /><Route path="/leaderboard" element={<Leaderboard />} /><Route path="/run" element={<Run />} /><Route path="/compare" element={<Compare />} /><Route path="/runs/:id" element={<Receipt />} /><Route path="/briefing" element={<Briefing />} /><Route path="*" element={<div className="load-state"><h1>Page not found</h1><Button asChild><Link to="/">Back to overview</Link></Button></div>} /></Routes>}</RouteTransition><footer className="page-footer"><span>Assay · Know which agent to trust, and why.</span><span>Built with Bifrost & Tavily <span className="footer-dot">●</span></span></footer></main>
    </div>
  </div>
}
export default function App() { return <BrowserRouter><Shell /></BrowserRouter> }
