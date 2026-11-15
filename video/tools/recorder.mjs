// Full-resolution recorder: CDP screencast frames (device pixels) → H.264 mp4 at 30 fps.
// ponytail: puppeteer's page.screencast() caps output at CSS pixels, so we take frames straight from CDP.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export async function record(page, file, { width, height }) {
  const dir = fs.mkdtempSync(path.join(path.resolve(path.dirname(file)), '.frames-'))
  const cdp = await page.createCDPSession()
  const frames = []
  let stopped = false
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    if (stopped) return
    const name = path.join(dir, `${String(frames.length).padStart(6, '0')}.jpg`)
    fs.writeFileSync(name, Buffer.from(data, 'base64'))
    frames.push({ name, t: metadata.timestamp })
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: width, maxHeight: height, everyNthFrame: 1 })
  const t0 = Date.now() / 1000
  return {
    t0,
    async stop() {
      stopped = true
      await cdp.send('Page.stopScreencast')
      const end = Date.now() / 1000
      // concat list: each frame held until the next one arrives (CDP only sends frames on paint).
      const posix = f => f.name.split(path.sep).join('/')
      const list = frames.map((f, i) => `file '${posix(f)}'\nduration ${((frames[i + 1]?.t ?? end) - f.t).toFixed(4)}`).join('\n')
      fs.writeFileSync(path.join(dir, 'list.txt'), list + `\nfile '${posix(frames.at(-1))}'\n`)
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
        '-vf', `fps=30,scale=${width}:${height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', file])
      fs.rmSync(dir, { recursive: true, force: true })
      return { firstFrame: frames[0].t, frames: frames.length }
    },
  }
}
