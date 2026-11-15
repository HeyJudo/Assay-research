import { AbsoluteFill, Composition } from 'remotion'
import { C, FPS } from './brand'
import { Logo } from './ui/Logo'

function Placeholder() {
  return <AbsoluteFill style={{ background: C.bg, alignItems: 'center', justifyContent: 'center' }}><Logo from={-60} /></AbsoluteFill>
}

export function Root() {
  return <Composition id="AssayDemo" component={Placeholder} durationInFrames={150 * FPS} fps={FPS} width={1920} height={1080} />
}
