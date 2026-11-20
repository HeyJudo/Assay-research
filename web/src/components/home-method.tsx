import { useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react'
import { CircleCheck, List, Repeat, Sliders, Snowflake, TriangleAlert as TrapStation } from 'kubai-icons-react'
import { BuiltOn } from '@/components/home-agents'

const stations = [
  { icon: Snowflake, title: 'Freeze the web', text: 'Every agent searches the same saved pages.' },
  { icon: TrapStation, title: 'Plant a trap', text: 'A fake article, a hidden instruction, or an outage.' },
  { icon: Repeat, title: 'Run it three times', text: 'One lucky pass does not count.' },
  { icon: List, title: 'Record every step', text: 'Searches, pages, model calls and cost.' },
  { icon: CircleCheck, title: 'Check every claim', text: 'Briefing claims are matched to source quotes.' },
  { icon: Sliders, title: 'Rank your way', text: 'Weigh accuracy, cost, traps and honesty.' },
]
const query = '(min-width: 1024px)'
const subscribe = (notify: () => void) => { const media = window.matchMedia(query); media.addEventListener('change', notify); return () => media.removeEventListener('change', notify) }
const spring = { type: 'spring' as const, bounce: 0, duration: .45 }

function Icon({ index }: { index: number }) {
  const Glyph = stations[index].icon
  return <span className="home-station-icon"><Glyph size={32} color="var(--primary)" variant="soft" trigger="none" /></span>
}

// Desktop: the section is a tall track and the panel sticks while the scroll steps through the six stations. A sequence reads better one step at a time.
function Pinned() {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', value => setActive(Math.min(5, Math.max(0, Math.floor(value * 6)))))
  return <div className="home-method-track" ref={track}>
    <div className="home-method-panel">
      <h2>How a run works</h2>
      <div className="home-stations-wrap">
        <div className="home-flow" aria-hidden="true"><div /><motion.i className="home-flow-fill" style={{ scaleX: scrollYProgress }} /></div>
        <ol className="home-stations">{stations.map(({ title, text }, index) => <motion.li key={title} animate={{ opacity: index === active ? 1 : .45, scale: index === active ? 1.04 : 1 }} transition={spring}>
          <Icon index={index} /><h3>{title}</h3><p className="sr-only">{text}</p>
        </motion.li>)}</ol>
      </div>
      <div className="home-method-caption" aria-hidden="true"><AnimatePresence mode="wait" initial={false}>
        <motion.p key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', bounce: 0, duration: .3 }}>{stations[active].text}</motion.p>
      </AnimatePresence></div>
    </div>
  </div>
}

// Tablet, phone and reduced motion: no pinning, a plain list. Each station staggers in 60ms apart.
function Listed({ reduced }: { reduced: boolean }) {
  return <>
    <h2>How a run works</h2>
    <div className="home-stations-wrap"><div className="home-flow" aria-hidden="true"><div /></div><ol className="home-stations">{stations.map(({ title, text }, index) => <motion.li key={title}
      {...(reduced ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: .2, margin: '0px 0px -10% 0px' }, transition: { ...spring, delay: index * .06 } })}>
      <Icon index={index} /><h3>{title}</h3><p>{text}</p>
    </motion.li>)}</ol></div>
  </>
}

export function HomeMethod() {
  const reduced = useReducedMotion() ?? false
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
  return <section className="home-section home-method" id="methodology">
    {wide && !reduced ? <Pinned /> : <Listed reduced={reduced} />}
    <BuiltOn />
  </section>
}
