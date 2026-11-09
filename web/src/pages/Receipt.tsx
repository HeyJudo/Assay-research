import { useParams } from 'react-router'
import { runs } from '@/fixtures'

export default function Receipt() {
  const { id } = useParams()
  const run = runs.find((r) => r.id === id)
  if (!run) return <p>Run {id} not found.</p>
  const c = run.config
  return (
    <section>
      <h1 className="text-2xl font-semibold">Run receipt: {run.id}</h1>
      <p className="text-muted-foreground">
        {run.agent_id} on {run.task_id} · {c.models.join(', ')} · prompt {c.prompt_hash} · pool {c.pool_version} · {run.steps.length} steps · {run.claims.length} claims
      </p>
    </section>
  )
}
