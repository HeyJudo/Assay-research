// Fake data until the real API is ready (PRD §11: switch on Nov 13). The backend serves the same JSON files.
import type { Agent, BatchEvent, LeaderboardRow, RunRecord, Task } from '@/types'
import agentsJson from './agents.json'
import leaderboardJson from './leaderboard.json'
import runsJson from './runs.json'
import streamJson from './stream.json'
import tasksJson from './tasks.json'

export const runs = runsJson as RunRecord[]
export const agents = agentsJson as Agent[]
export const tasks = tasksJson as Task[]
export const leaderboard = leaderboardJson as LeaderboardRow[]
/** One batch (2 agents × 3 repeats on brief-tavily) as SSE messages in arrival order. */
export const stream = streamJson as BatchEvent[]
