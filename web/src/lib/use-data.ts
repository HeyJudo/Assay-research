import { useCallback, useEffect, useState } from 'react'

export function useData<T>(loader: () => Promise<T>, key = '') {
  const [value, setValue] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setError(''); setValue(null)
    loader().then(result => { if (active) setValue(result) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load data') })
    return () => { active = false }
    // Loader identity changes on render; callers supply the resource key explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])
  const retry = useCallback(() => setAttempt(n => n + 1), [])
  return { value, error, retry }
}
