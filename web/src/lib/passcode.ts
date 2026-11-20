const KEY = 'assay.passcode'

/** Judges arrive via /?code=XXXX. Remember it for the tab so Run and Briefing can pre-fill it. */
export function savedPasscode(search?: string, store?: Pick<Storage, 'getItem' | 'setItem'>): string {
  let code = ''
  try { code = new URLSearchParams(search ?? location.search).get('code') ?? '' } catch { /* no location */ }
  try {
    const s = store ?? sessionStorage
    if (code) s.setItem(KEY, code)
    else return s.getItem(KEY) ?? ''
  } catch { /* storage blocked */ }
  return code
}
