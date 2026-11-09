import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { runs } from '@/fixtures'

export default function Home() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Know which research agent to trust, and why.</h1>
      <p className="text-muted-foreground">Recent runs (fixture data).</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Task</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link className="underline" to={`/runs/${r.id}`}>{r.id}</Link>
              </TableCell>
              <TableCell>{r.agent_id}</TableCell>
              <TableCell>{r.task_id}{r.trap && ` (${r.trap})`}</TableCell>
              <TableCell>
                <Badge variant={r.metrics.success ? 'default' : 'destructive'}>
                  {r.status === 'done' ? (r.metrics.success ? 'pass' : 'fail') : r.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
