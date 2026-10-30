// Shared appearance rules for agent avatars (desk avatars and campus travelers must match).
import { OFFICE_MODELS } from './OfficeAssetRegistry'

export function isRobotAgent(agentType: string | undefined): boolean {
  const type = (agentType || '').toLowerCase()
  return type === 'codex' || type === 'gemini' || type.includes('bot') || type.includes('ai')
}

/** Deterministic human model choice from the employee id. */
export function humanModelUrl(employeeId: string): string {
  let hash = 0
  for (let i = 0; i < employeeId.length; i++) {
    hash = (hash * 31 + employeeId.charCodeAt(i)) >>> 0
  }
  return hash % 2 === 0 ? OFFICE_MODELS.charMaleA : OFFICE_MODELS.charFemaleA
}

export const SEAT_LIFT_ROBOT = 0.15
export const SEAT_LIFT_HUMAN = 0.28
