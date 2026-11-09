import { BrowserRouter, NavLink, Route, Routes } from 'react-router'
import Briefing from '@/pages/Briefing'
import Compare from '@/pages/Compare'
import Home from '@/pages/Home'
import Leaderboard from '@/pages/Leaderboard'
import Receipt from '@/pages/Receipt'
import Run from '@/pages/Run'

const nav = [
  ['/', 'Home'],
  ['/leaderboard', 'Leaderboard'],
  ['/run', 'Run'],
  ['/compare', 'Compare'],
  ['/briefing', 'Briefing Agent'],
]

export default function App() {
  return (
    <BrowserRouter>
      <nav className="flex gap-4 border-b px-6 py-3">
        <span className="font-bold">Assay</span>
        {nav.map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? 'font-medium' : 'text-muted-foreground')}>
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="mx-auto max-w-5xl p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/run" element={<Run />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/runs/:id" element={<Receipt />} />
          <Route path="/briefing" element={<Briefing />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
