import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Play } from 'lucide-react'

const base = import.meta.env.BASE_URL
const poster = `${base}demo-poster.jpg`
const drive = 'https://drive.google.com/file/d/17u86gcrxQa9aCrrcDeHq_-4jH2z0gFrF/view'
const chapters = [
  { label: 'Problem', at: 12 },
  { label: 'How it works', at: 24 },
  { label: 'Run', at: 49 },
  { label: 'Receipt', at: 67 },
  { label: 'Results', at: 80 },
  { label: 'Briefing', at: 97 },
]
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

export function HomeDemo() {
  const reduced = useReducedMotion()
  const video = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(-1)
  const [failed, setFailed] = useState(false)
  const chapterAt = (time: number) => chapters.reduce((found, chapter, index) => time >= chapter.at ? index : found, -1)
  function seek(index: number) {
    const el = video.current
    if (!el) return
    el.currentTime = chapters[index].at
    setActive(index)
    void el.play().catch(() => undefined)
  }
  return <motion.section className="home-section home-demo" aria-labelledby="home-demo-title" {...(reduced ? {} : { initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .1, margin: '0px 0px -10% 0px' } })}>
    <div className="home-section-heading"><h2 id="home-demo-title">Watch the 2-minute demo</h2><span>From the problem to a live briefing, 2:03 in total.</span></div>
    {failed ? <a className="home-demo-fallback" href={drive} target="_blank" rel="noreferrer">
      <img src={poster} alt="" />
      <span><Play size={20} aria-hidden="true" />Watch the demo on Google Drive</span>
    </a> : <>
      <video ref={video} className="home-demo-video" controls preload="none" playsInline poster={poster} src={`${base}demo/assay-demo.mp4`} onError={() => setFailed(true)} onTimeUpdate={event => setActive(chapterAt(event.currentTarget.currentTime))} />
      <div className="home-chapters" role="group" aria-label="Demo chapters">{chapters.map((chapter, index) => <button key={chapter.label} type="button" aria-pressed={active === index} className={`home-chapter${active === index ? ' active' : ''}`} onClick={() => seek(index)}>
        {active === index && <motion.span layoutId="home-chapter-pill" className="home-chapter-pill" transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0, duration: .4 }} />}
        <span className="home-chapter-label">{chapter.label}</span>
        <span className="home-chapter-time mono">{clock(chapter.at)}</span>
      </button>)}</div>
    </>}
  </motion.section>
}
