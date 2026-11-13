import type { BatchEvent } from '../types'

export function connectBatchStream(url: string, receive: (event: BatchEvent) => void, fail: (message: string) => void, Source: typeof EventSource = EventSource) {
  const source = new Source(url)
  for (const name of ['run_started', 'step', 'run_done', 'batch_done'] as const) source.addEventListener(name, e => {
    try {
      receive({ event: name, data: JSON.parse((e as MessageEvent).data) } as BatchEvent)
      if (name === 'batch_done') source.close()
    } catch { fail('An invalid stream event was received.'); source.close() }
  })
  // CONNECTING means the browser is retrying with Last-Event-ID. Do not close it.
  source.onerror = () => {
    if (source.readyState === Source.CLOSED) {
      fail('The progress connection closed. Completed records remain on the server.')
      source.close()
    }
  }
  return () => source.close()
}
