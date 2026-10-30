import type { OfficeEmployeeDisplayState } from '../model/office-world-types'

export interface OfficeTheme {
  readonly sky: string
  readonly ambient: string
  readonly ambientIntensity: number
  readonly sunColor: string
  readonly sunIntensity: number
  readonly floorColor: string
  readonly floorGridColor: string
  readonly deskWood: string
  readonly deskMetal: string
  readonly chairMesh: string
  readonly computerBody: string
}

export const MODERN_DARK_OFFICE_THEME: OfficeTheme = {
  sky: '#0b0f17',
  ambient: '#cad5e2',
  ambientIntensity: 0.9,
  sunColor: '#ffffff',
  sunIntensity: 1.4,
  floorColor: '#1e2430',
  floorGridColor: '#2b3446',
  deskWood: '#3a2d24',
  deskMetal: '#1c1f26',
  chairMesh: '#2d3748',
  computerBody: '#1e2530'
}

export const STATUS_COLORS: Record<
  OfficeEmployeeDisplayState,
  { primary: string; glow: string; label: string }
> = {
  working: {
    primary: '#60a5fa', // vibrant cyan/blue
    glow: '#3b82f6',
    label: 'Working'
  },
  monitoring: {
    primary: '#2dd4bf', // teal
    glow: '#14b8a6',
    label: 'Monitoring'
  },
  attention: {
    primary: '#f59e0b', // amber
    glow: '#ef4444',
    label: 'Needs Attention'
  },
  done: {
    primary: '#10b981', // emerald
    glow: '#059669',
    label: 'Completed'
  },
  idle: {
    primary: '#64748b', // slate
    glow: '#475569',
    label: 'Idle'
  }
}

export function getAgentColorByType(agentType: string): string {
  switch (agentType.toLowerCase()) {
    case 'claude':
      return '#f97316' // Claude warm orange
    case 'codex':
    case 'chatgpt':
    case 'openai':
      return '#8b5cf6' // Codex purple
    case 'gemini':
      return '#3b82f6' // Gemini blue
    case 'terminal':
    default:
      return '#06b6d4' // Terminal cyan
  }
}
