// node tools/capture.mjs [results|receipt|briefing|run ...]
// Drives the real site (API mode on the bench.db copy) and records each scene's clip at 2880x1620.
// Order matters: results and receipt first (before the live runs add rows), briefing before run
// (the API refuses a brief while a batch is running).
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'
import { record } from './recorder.mjs'

const WEB = process.env.WEB ?? 'http://localhost:5191'
const PASSCODE = 'video-capture-local' // local test value set in the api-video launch config
const W = 1440, H = 810, DPR = 2
const marksFile = new URL('../public/clips/marks.json', import.meta.url)
fs.mkdirSync(new URL('.', marksFile), { recursive: true })
const marks = fs.existsSync(marksFile) ? JSON.parse(fs.readFileSync(marksFile)) : {}
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Visible cursor + click ripple (headless capture draws no cursor).
const CURSOR = `
addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div'); c.id = '__cursor'
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#4A3B33" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-200px,-200px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))' })
  document.body.appendChild(c)
  addEventListener('mousemove', e => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)' }, true)
  addEventListener('mousedown', e => {
    const r = document.createElement('div')
    Object.assign(r.style, { position: 'fixed', left: e.clientX - 18 + 'px', top: e.clientY - 18 + 'px', width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #B45309', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .45s ease-out, opacity .45s ease-out' })
    document.body.appendChild(r); requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0' }); setTimeout(() => r.remove(), 600)
  }, true)
})`

let pos = { x: W / 2, y: H / 2 }
async function glide(page, x, y, ms = 700) {
  const n = Math.max(12, Math.round(ms / 16)), from = { ...pos }
  for (let i = 1; i <= n; i++) {
    const t = i / n, e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e); await sleep(ms / n)
  }
  pos = { x, y }
}
async function find(page, selector, text) {
  const h = await page.waitForFunction((s, t) => (all => all.find(e => !all.some(o => o !== e && e.contains(o))))([...document.querySelectorAll(s)].filter(e => !t || e.textContent.includes(t))), { timeout: 20000 }, selector, text).catch(e => { throw new Error(`not found: ${selector} "${text ?? ''}" (${e.message})`) })
  return h.asElement()
}
async function into(page, el, block = 'center') {
  await el.evaluate((e, b) => e.scrollIntoView({ behavior: 'smooth', block: b }), block); await sleep(1100)
}
async function click(page, el, pause = 350) {
  let b = await el.boundingBox()
  if (b.y < 70 || b.y + b.height > H - 10) { await into(page, el); b = await el.boundingBox() }
  await glide(page, b.x + b.width / 2, b.y + b.height / 2); await sleep(pause)
  await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(400)
}
async function noFixtures(page) {
  const bad = await page.evaluate(() => /Sample results|Demo simulation|sample benchmark/i.test(document.body.innerText))
  if (bad) throw new Error('fixture/sample data visible — web app is not in measured API mode')
}

async function clip(browser, name, script) {
  const page = await browser.newPage()
  await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR })
  await page.evaluateOnNewDocument(CURSOR)
  pos = { x: W / 2, y: H / 2 }
  const m = {}
  let rec
  const mark = label => { m[label] = +(Date.now() / 1000 - rec.t0).toFixed(2); console.log(' ', name + '.' + label, m[label]) }
  const start = async () => { rec = await record(page, new URL(`../public/clips/${name}.mp4`, import.meta.url).pathname.slice(1), { width: W * DPR, height: H * DPR }) }
  await script({ page, start, mark })
  const info = await rec.stop()
  const lag = info.firstFrame - rec.t0 // video t=0 is the first frame, not the start call
  marks[name] = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +(v - lag).toFixed(2)]))
  fs.writeFileSync(marksFile, JSON.stringify(marks, null, 2) + '\n')
  console.log(name, info.frames, 'frames')
  await page.close()
}

const CLIPS = {
  async results({ page, start, mark }) {
    await page.goto(WEB + '/', { waitUntil: 'networkidle0' }); await sleep(1500); await noFixtures(page)
    const found = await find(page, 'h2', 'What the benchmark found')
    await found.evaluate(e => e.scrollIntoView({ block: 'start' })); await page.evaluate(() => scrollBy(0, -380)); await sleep(800)
    await start(); await sleep(600)
    await into(page, found, 'start'); mark('findings'); await sleep(5200)
    await page.goto(WEB + '/leaderboard', { waitUntil: 'networkidle0' }); await sleep(1200); await noFixtures(page)
    mark('leaderboard'); await sleep(2200)
    const thumb = await find(page, '#slider-accuracy [role="slider"], [aria-labelledby="w-accuracy"] [role="slider"], #slider-accuracy')
    const track = await (await find(page, '#slider-accuracy')).boundingBox()
    const tb = await thumb.boundingBox()
    await glide(page, tb.x + tb.width / 2, tb.y + tb.height / 2); await sleep(300)
    mark('priorities'); await page.mouse.down()
    await glide(page, track.x + track.width + 4, tb.y + tb.height / 2, 1600); await page.mouse.up()
    await sleep(500); mark('reordered')
    const top = await page.evaluate(() => document.querySelector('.leaderboard-table-panel tbody tr')?.textContent ?? document.querySelector('h1')?.textContent)
    if (!/GPT Researcher/.test(top)) throw new Error('GPT Researcher did not move to #1: ' + top)
    await glide(page, W * 0.72, H * 0.8, 900); await sleep(3500)
  },
  async receipt({ page, start, mark }) {
    await page.goto(WEB + '/', { waitUntil: 'networkidle0' }); await sleep(1200)
    await start(); await sleep(500)
    await page.goto(WEB + '/runs/run_155e8837eedf', { waitUntil: 'networkidle0' }); mark('open'); await sleep(3200)
    await noFixtures(page)
    const sw = await find(page, '.receipt-paper *', 'Model switch')
    const sb = await sw.boundingBox(); await glide(page, sb.x + sb.width + 30, sb.y + sb.height / 2, 900); mark('switch'); await sleep(4200)
    const trap = await find(page, '.receipt-claim')
    await into(page, trap, 'start'); mark('trapClaim'); await sleep(2600)
    const src = await find(page, '.receipt-claim a, .receipt-claim p', 'llmops-weekly')
    const b = await src.boundingBox(); await glide(page, b.x + 40, b.y + b.height / 2, 900); mark('source'); await sleep(4500)
  },
  async briefing({ page, start, mark }) {
    await page.goto(WEB + '/briefing', { waitUntil: 'networkidle0' }); await sleep(1200); await noFixtures(page)
    await start(); await sleep(1200)
    const who = await find(page, '#brief-who'); await click(page, who)
    await page.keyboard.type('Tavily', { delay: 110 }); mark('typed'); await sleep(900)
    const go = await find(page, 'button[type="submit"]', 'Write the brief'); await click(page, go, 500); mark('submit')
    await glide(page, W * 0.85, H * 0.85, 800)
    await page.waitForFunction(() => !/Writing the brief/.test(document.body.innerText), { timeout: 180000 })
    await sleep(800)
    const err = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent)
    if (err) throw new Error('briefing failed: ' + err)
    mark('done'); await sleep(2500)
    const paper = await find(page, '.briefing-paper-header, h2'); await page.evaluate(() => scrollBy({ top: 420, behavior: 'smooth' })); await sleep(3500)
    mark('sections'); await sleep(3000)
  },
  async run({ page, start, mark }) {
    await page.goto(WEB + '/run', { waitUntil: 'networkidle0' }); await sleep(1200)
    await start(); await sleep(1000)
    await click(page, await find(page, 'button.run-option', 'Evidence-gated')); mark('agents'); await sleep(800)
    await click(page, await find(page, 'button', 'Next')); await sleep(900)
    const task = await find(page, 'label.run-option', 'brief-maxim-ai-trap'); await into(page, task); await click(page, task); mark('task'); await sleep(700)
    await click(page, await find(page, 'button', 'Next')); await sleep(900)
    await click(page, await find(page, 'label.run-trap-option', 'Hidden instruction')); mark('trap'); await sleep(700)
    const pass = await find(page, '.run-passcode input'); await into(page, pass); await click(page, pass)
    await page.keyboard.type(PASSCODE, { delay: 25 }); await sleep(400)
    await click(page, await find(page, 'button', 'Start benchmark'), 500); mark('start')
    await glide(page, W * 0.9, H * 0.9, 900)
    await find(page, 'h1', 'researching'); mark('running')
    // hold until the first live step lands, then a little longer
    await page.waitForFunction(() => document.querySelectorAll('.run-live-feed li').length >= 1, { timeout: 300000, polling: 500 })
    mark('live'); await sleep(7000)
    const err = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent)
    if (err) throw new Error('live run error: ' + err)
    mark('cut')
    await page.goto(WEB + '/results?batch=bench_198121eb12d0&scope=batch', { waitUntil: 'networkidle0' }); await sleep(1000)
    const grid = await find(page, 'h2, h3', 'Receipts'); await into(page, grid, 'start'); await page.evaluate(() => scrollBy(0, -40)); await sleep(500)
    mark('results'); await sleep(6000)
  },
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS)
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  // ponytail: the API has no CORS middleware; disabling web security in this capture-only browser avoids touching backend/.
  args: ['--disable-web-security', '--user-data-dir=' + process.env.TEMP + '/assay-capture-' + Date.now()],
})
try { for (const n of names) { console.log('clip', n); await clip(browser, n, CLIPS[n]) } }
finally { await browser.close().catch(() => {}) }
