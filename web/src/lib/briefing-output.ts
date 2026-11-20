/** Keep the agent's complete output, including unexpected sections and failures. */
export function splitBriefing(text: string) {
  const lines = text.trim().split('\n')
  const titleLine = /^#\s+(.+)$/.exec(lines[0] ?? '')
  const title = titleLine?.[1] ?? null
  if (titleLine) lines.shift()
  const sections: { heading: string; text: string }[] = []
  let heading = ''
  let body: string[] = []
  const finish = () => {
    const content = body.join('\n').trim()
    if (heading || content) sections.push({ heading, text: content })
  }
  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line)
    if (match) { finish(); heading = match[1]; body = [] }
    else body.push(line)
  }
  finish()
  return { title, sections }
}

export function safeUrl(url: string | null | undefined) { if (!url) return null; try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? u.href : null } catch { return null } }
const domainOf = (url: string) => new URL(url).hostname.replace(/^www\./, '')
const LINK = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|\[(https?:\/\/[^\]\s]+)\]/.source
const linkUrl = (m: RegExpMatchArray | RegExpExecArray) => safeUrl(m[1] ?? m[2])

/** Cited URLs in first-appearance order, de-duplicated. Markdown links and bare bracketed URLs both count. */
export function citationUrls(text: string): string[] {
  return [...new Set([...text.matchAll(new RegExp(LINK, 'g'))].map(linkUrl).filter((u): u is string => !!u))]
}
/** The Sources list: cited URLs first, then claim sources not already cited. */
export function collectSources(text: string, claimUrls: (string | null)[] = []): string[] {
  return [...new Set([...citationUrls(text), ...claimUrls.map(safeUrl).filter((u): u is string => !!u)])]
}
/** Domain plus a shortened path. The caller shows the full URL in a title. */
export function sourceLabel(url: string, max = 36) {
  const u = new URL(url)
  const path = (u.pathname + u.search).replace(/^\/$/, '')
  return { domain: domainOf(url), path: path.length > max ? `${path.slice(0, max)}…` : path }
}

export type Inline = { text: string; bold?: boolean } | { cite: number; url: string; domain: string }
export type BriefBlock =
  | { kind: 'h1' | 'h2' | 'p'; inlines: Inline[] }
  | { kind: 'ul'; items: Inline[][] }

/** Parse brief markdown into blocks. `sources` fixes the citation numbers so they match a Sources list. */
export function parseBrief(text: string, sources?: string[]): BriefBlock[] {
  const known = [...(sources ?? [])]
  const number = (url: string) => { let i = known.indexOf(url); if (i < 0) { known.push(url); i = known.length - 1 } return i + 1 }
  const inline = (raw: string): Inline[] => {
    // Drop the parentheses that only wrap citations: "claim ([a](u); [b](u))." becomes "claim [1][2]."
    const flat = raw.replace(new RegExp(String.raw`\s*\(((?:\s*(?:${LINK})\s*;?)+)\)`, 'g'), (_, group: string) => ' ' + group.replace(/\)\s*;\s*\[/g, ')['))
    const out: Inline[] = []
    let last = 0
    for (const m of flat.matchAll(new RegExp(String.raw`\*\*([^*]+)\*\*|(?:${LINK})`, 'g'))) {
      if (m.index > last) out.push({ text: flat.slice(last, m.index) })
      if (m[1] != null) out.push({ text: m[1], bold: true })
      else {
        const url = safeUrl(m[2] ?? m[3])
        out.push(url ? { cite: number(url), url, domain: domainOf(url) } : { text: m[0] })
      }
      last = m.index + m[0].length
    }
    if (last < flat.length) out.push({ text: flat.slice(last) })
    return out
  }
  const blocks: BriefBlock[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const bullet = /^\s*[*-]\s+(.*)$/.exec(line)
    if (bullet) {
      const last = blocks.at(-1)
      if (last?.kind === 'ul') last.items.push(inline(bullet[1]))
      else blocks.push({ kind: 'ul', items: [inline(bullet[1])] })
      continue
    }
    const content = line.replace(/^#{1,3}\s+/, '')
    blocks.push({ kind: line.startsWith('# ') ? 'h1' : line.startsWith('## ') ? 'h2' : 'p', inlines: inline(content) })
  }
  return blocks
}
