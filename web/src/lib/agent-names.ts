import type { Agent } from '../types'
const names = new Map<string, string>()
export function registerAgents(agents: Agent[]) { agents.forEach(agent => names.set(agent.id, agent.name)) }
export function agentLabel(id: string) { return names.get(id) ?? id }
