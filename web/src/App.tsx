import { useEffect } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { ArrowUpRight, ArrowLeftRight, Beaker, BookOpen, FlaskConical, Home as HomeIcon, Play, Trophy, ChevronRight, ShieldCheck, Zap, CircleDot } from 'lucide-react'
import Briefing from '@/pages/Briefing'
import Compare from '@/pages/Compare'
import Home from '@/pages/Home'
import Leaderboard from '@/pages/Leaderboard'
import Receipt from '@/pages/Receipt'
import Run from '@/pages/Run'
import { apiMode } from '@/lib/data'
import { Button } from '@/components/ui/button'
import { RouteTransition } from '@/components/route-transition'
import { Startup } from '@/components/startup'

const nav = [
  { to: '/', label: 'Overview', icon: HomeIcon },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/run', label: 'Run benchmark', icon: Play },
  { to: '/compare', label: 'Compare agents', icon: ArrowLeftRight },
  { to: '/briefing', label: 'Briefing Agent', icon: BookOpen },
]
function Shell() {
  const { pathname, search } = useLocation()
  useEffect(() => { document.title = `Assay · ${nav.find(item => item.to === pathname)?.label ?? 'Run receipt'}` }, [pathname])
  const preset = new URLSearchParams(search).get('agents')
  const profiles = [
    { id: 'briefing-baseline', label: 'Baseline', note: 'One model. One reference point.', icon: CircleDot, color: 'blue' },
    { id: 'briefing-cheap-first', label: 'Cheap-first', note: 'Start small. Escalate when needed.', icon: Zap, color: 'gold' },
    { id: 'briefing-evidence-gated', label: 'Evidence-gated', note: 'No source, no claim.', icon: ShieldCheck, color: 'purple' },
  ]
  return <div className="app-shell launcher-theme">
    <aside className="sidebar">
      <Link to="/" className="brand"><span className="brand-mark"><FlaskConical size={23} /></span>assay<span className="brand-period">.</span><span className="brand-edition">RESEARCH LAB</span></Link>
      <div className="launcher-account"><span className="avatar">A</span><div><small>WORKSPACE</small><strong>Assay Research Lab</strong></div><Beaker size={16} /></div>
      <p className="workspace-label">EXPLORE</p>
      <nav aria-label="Main navigation">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={18} />{label}<span className="nav-dot" /></NavLink>)}</nav>
      <div className="preset-section"><p className="workspace-label">AGENT PROFILES <span>03</span></p><nav aria-label="Agent presets">{profiles.map(({ id, label, note, icon: Icon, color }) => <Link className={`preset-item ${pathname === '/run' && preset === id ? 'selected-preset' : ''}`} key={id} to={`/run?agents=${id}`}><span className={`preset-icon preset-${color}`}><Icon size={17} /></span><span><strong>{label}</strong><small>{note}</small></span><ChevronRight size={13} /></Link>)}</nav></div>
      <div className="launcher-bottom"><Link to="/#methodology" className="methodology-shortcut"><BookOpen size={15} /> How the benchmark works <ArrowUpRight size={13} /></Link><div className="launcher-health"><span className="status-dot" />{apiMode ? 'API transport configured' : 'Local demo · No provider calls'}</div><Button asChild className="launch-button"><Link to={preset ? `/run?agents=${encodeURIComponent(preset)}` : '/run'}><Play size={18} fill="currentColor" /><span>LAUNCH BENCHMARK<small>{apiMode ? 'Configure a live batch' : 'Configure a demo batch'}</small></span></Link></Button><p className="launcher-version">ASSAY <span>Research agents, tested fairly.</span></p></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div><Beaker size={16} /><span>Research workspace</span><span className="slash">/</span><strong>{nav.find(item => item.to === pathname)?.label ?? 'Run receipt'}</strong></div><span className="environment"><span className="status-dot" />{apiMode ? 'API mode' : 'Demo workspace'}</span></header>
      <div className="mode-banner"><span><span className="demo-dot" />{apiMode ? 'Configured API · Some server endpoints may still return fixtures.' : 'Demo data · Illustrative fixtures, not measured benchmark findings.'}</span><span>{apiMode ? 'No fixture fallback' : 'No API keys needed'}</span></div>
      <main><RouteTransition>{location => <Routes location={location}><Route path="/" element={<Home />} /><Route path="/leaderboard" element={<Leaderboard />} /><Route path="/run" element={<Run />} /><Route path="/compare" element={<Compare />} /><Route path="/runs/:id" element={<Receipt />} /><Route path="/briefing" element={<Briefing />} /><Route path="*" element={<div className="load-state"><h1>Page not found</h1><Button asChild><Link to="/">Back to overview</Link></Button></div>} /></Routes>}</RouteTransition><footer className="page-footer"><span>Assay · Know which agent to trust, and why.</span><span>Built with Bifrost & Tavily <span className="footer-dot">●</span></span></footer></main>
    </div>
  </div>
}
export default function App() { return <BrowserRouter><Startup /><Shell /></BrowserRouter> }
