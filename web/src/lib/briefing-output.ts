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
