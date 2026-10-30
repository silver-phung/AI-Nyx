import * as THREE from 'three'
import { buildGround, type CampusGround } from './build-ground'
import { buildSky, type CampusSky } from './build-sky'
import { buildZones, type ZoneView } from './build-zones'
import { CAMPUS_HUB, type CampusZoneId } from './campus-layout'
import { ResourceBag } from './campus-kit'

export type CampusOptions = {
  /** Number of pod rows in the Coding Studio (extends the studio plinth). */
  readonly podRows: number
  readonly shadows: boolean
}

export type Campus = {
  readonly root: THREE.Group
  readonly zones: ReadonlyMap<CampusZoneId, ZoneView>
  readonly sky: CampusSky
  readonly ground: CampusGround
  update(timeSeconds: number, cameraPosition?: THREE.Vector3): void
  setShadows(enabled: boolean): void
  dispose(): void
}

const tmpV = new THREE.Vector3()
const CAMPUS_CENTER = new THREE.Vector3(CAMPUS_HUB.x - 8, 0, CAMPUS_HUB.z)

/** Builds the entire Moonlight Campus scenery (sky, ground, lighting and the seven zones). */
export function createCampus(options: CampusOptions): Campus {
  const bag = new ResourceBag()
  const root = new THREE.Group()
  root.name = 'moonlight-campus'

  const sky = buildSky(bag)
  sky.group.position.copy(CAMPUS_CENTER)
  root.add(sky.group)

  const ground = buildGround(bag, options.podRows)
  root.add(ground.group)

  const zoneViews = buildZones(bag, options.podRows)
  const zones = new Map<CampusZoneId, ZoneView>()
  for (const z of zoneViews) {
    zones.set(z.id, z)
    root.add(z.group)
  }

  // Lighting: cool moonlight, deep ambient, warm point accents come from zones/lamps.
  const hemi = new THREE.HemisphereLight(0x9aa8ff, 0x2a2a70, 1.9)
  root.add(hemi)
  // Shadow-casting key light: same azimuth as the visible moon but higher, so shadows stay short.
  const keyDir = new THREE.Vector3(sky.moonDirection.x, 0, sky.moonDirection.z).normalize()
  keyDir
    .multiplyScalar(Math.cos(THREE.MathUtils.degToRad(54)))
    .setY(Math.sin(THREE.MathUtils.degToRad(54)))
  const moon = new THREE.DirectionalLight(0xbccaff, 2.6)
  moon.position.copy(keyDir).multiplyScalar(130).add(CAMPUS_CENTER)
  moon.target.position.copy(CAMPUS_CENTER)
  moon.castShadow = options.shadows
  moon.shadow.mapSize.set(2048, 2048)
  const sc = moon.shadow.camera
  sc.left = -62
  sc.right = 62
  sc.top = 52
  sc.bottom = -52
  sc.near = 10
  sc.far = 320
  moon.shadow.bias = -0.0006
  moon.shadow.normalBias = 0.05
  root.add(moon, moon.target)
  const rim = new THREE.DirectionalLight(0xc084fc, 0.45)
  rim.position.set(CAMPUS_CENTER.x + 80, 40, CAMPUS_CENTER.z + 60)
  root.add(rim)

  root.userData.fog = new THREE.Fog(0x2a2266, 130, 420)

  return {
    root,
    zones,
    sky,
    ground,
    update(t: number, cameraPosition?: THREE.Vector3): void {
      sky.update(t)
      if (cameraPosition) {
        for (const z of zoneViews) {
          for (const label of z.labels) {
            const d = cameraPosition.distanceTo(label.getWorldPosition(tmpV))
            const k = THREE.MathUtils.clamp(d / 70, 0.35, 1.25)
            label.scale.set(8.6 * k, 2.7 * k, 1)
          }
        }
      }
      ground.update(t)
      for (const z of zoneViews) {
        z.update(t)
      }
    },
    setShadows(enabled: boolean): void {
      moon.castShadow = enabled
    },
    dispose(): void {
      // The light owns its shadow-map render target; geometry/material/texture are released by the bag.
      moon.shadow.dispose()
      bag.dispose()
      root.clear()
    }
  }
}
