import { CAMPUS_HUB, type CampusZoneDef, type CampusPoint } from './campus-layout'

export type CampusViewPreset = 'cinematic' | 'isometric'

export interface CampusViewPose {
  readonly target: { x: number; y: number; z: number }
  readonly position: { x: number; y: number; z: number }
}

interface PresetDef {
  readonly pitchDeg: number
  readonly yawDeg: number
  readonly distance: number
  readonly target: CampusPoint
}

const PRESETS: Record<CampusViewPreset, PresetDef> = {
  // Low, wide framing that shows the moon and sky above the campus.
  cinematic: { pitchDeg: 17, yawDeg: 38, distance: 68, target: { x: CAMPUS_HUB.x - 8, z: CAMPUS_HUB.z - 1 } },
  // Classic isometric-style three-quarter view.
  isometric: { pitchDeg: 36, yawDeg: 42, distance: 82, target: { x: CAMPUS_HUB.x - 10, z: CAMPUS_HUB.z } }
}

export function poseFromAngles(
  target: { x: number; y: number; z: number },
  pitchDeg: number,
  yawDeg: number,
  distance: number
): CampusViewPose {
  const pitch = (pitchDeg * Math.PI) / 180
  const yaw = (yawDeg * Math.PI) / 180
  return {
    target,
    position: {
      x: target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      y: target.y + Math.sin(pitch) * distance,
      z: target.z + Math.cos(pitch) * Math.cos(yaw) * distance
    }
  }
}

export function presetPose(preset: CampusViewPreset): CampusViewPose {
  const p = PRESETS[preset]
  return poseFromAngles({ x: p.target.x, y: 1, z: p.target.z }, p.pitchDeg, p.yawDeg, p.distance)
}

/** Close three-quarter view onto one zone. */
export function zonePose(zone: CampusZoneDef, yawDeg = 38): CampusViewPose {
  return poseFromAngles({ x: zone.center.x, y: 1.4, z: zone.center.z }, 32, yawDeg, 26)
}
