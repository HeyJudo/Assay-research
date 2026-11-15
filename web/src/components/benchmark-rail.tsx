import { Check } from 'lucide-react'
import '@/pages/run.css'

export function BenchmarkRail({ stage, onStep }: { stage: number; onStep?: (step: number) => void }) {
  return <ol className="run-rail" aria-label="Benchmark progress">
    {['Agents', 'Task', 'Trap', 'Running', 'Results'].map((label, index) => {
      const number = index + 1
      const accessible = !!onStep && number <= 3
      return <li className={number < stage ? 'run-rail-done' : number === stage ? 'run-rail-current' : ''} key={label} aria-current={number === stage ? 'step' : undefined}>
        <button type="button" onClick={() => onStep?.(number)} disabled={!accessible} tabIndex={accessible ? 0 : -1}>
          <span className="run-rail-number mono">{number < stage ? <Check size={15} /> : number}</span><span>{label}</span>
        </button>
        {number < 5 && <span className="run-rail-line" aria-hidden="true" />}
      </li>
    })}
  </ol>
}
