# Moonlight Campus: handoff for Antigravity

Owner: Claude (3D scene files). Antigravity owns Orca wiring, the IDE layout and Git. No commit/push has been made.

## What exists

`src/renderer/src/components/office3d/scene/campus/` (pure three.js builders and pure logic, no React):

| File | Purpose |
| --- | --- |
| `campus-layout.ts` | Zone positions, walkways, route and path math (pure) |
| `campus-events.ts` | **The integration contract**: `CampusActivityEvent`, `campusEventBus`, `campusPresence` |
| `campus-preview.ts` | Synthetic DEV PREVIEW event generator (source `dev-preview`) |
| `campus-view.ts` | Camera presets (cinematic / isometric) and zone fly-to poses |
| `build-sky.ts` / `build-ground.ts` / `build-zones.ts` / `build-campus.ts` | Sky (moon, stars, clouds), lawn, paths, trees, lamps, seven zones, lighting |
| `build-actor.ts` / `traveler.ts` / `campus-director.ts` | Character clones, trip state machine, event-to-trip director |

React layer (thin): `scene/CampusWorld.tsx`, `scene/CampusActors.tsx`, `scene/agent-appearance.ts`.
Edited existing files: `AgentAvatar3D.tsx` (hides while the agent is away; shared appearance helpers), `Office3DScene.tsx` (mounts `CampusWorld`, computes pod rows), `OfficeCameraRig.tsx` (presets, one-shot fly-to, no per-frame target fighting), `Office3DCanvas.tsx` (view presets, zone chips, DEV PREVIEW toggle, frame loop paused while the window is hidden, context-loss overlay kept).
`OfficeEnvironment.tsx` is no longer imported by the scene (left in place, unused).
Tests: `office3d/campus-model.test.ts` (20 tests, pure logic).

## Zones

Coding Studio (existing desk pods sit on its plinth), Review Pavilion, Testing Lab, Git Station, Deployment Center, Meeting Area, Waiting Garden, joined by walkways through the central plaza.

## Connecting real Orca events (Antigravity)

```ts
import { campusEventBus } from './scene/campus/campus-events'

// Only from a real, already-authorised Orca event. Never from a UI click in the campus.
campusEventBus.emit({
  activityId: 'push-<unique>',       // same id for start and result
  employeeId: employee.employeeId,   // OfficeEmployee.employeeId (must be in the current OfficeWorld)
  kind: 'git-push',                  // 'git-push' | 'test-run' | 'code-review' | 'deploy' | 'meeting' | 'rest'
  status: 'started',                 // later: 'succeeded' | 'failed' with the same activityId
  source: 'orca',
  detail: 'feature/x -> origin',     // plain text, max 48 chars, shown on the station board
  occurredAt: Date.now()
})
```

Rules baked into the code:
- The campus never calls back into Orca. Events cannot start, stop or authorise Git, tests, deploys or PTYs.
- Unknown `employeeId` values are ignored (nothing is faked).
- If no final status arrives within 90 s the agent walks home and the board says "No result". A result is never invented.
- `source: 'dev-preview'` events always show "DEV PREVIEW · SYNTHETIC" on the board and use `preview-agent-N` ids, so they cannot be mistaken for real activity.
- At most 16 simultaneous trips; overlapping activities of one employee queue (max 4).

## Verification status (be precise)

- Rendered and inspected in **headless Chromium (software WebGL)** with a plain-three.js harness that mounts the same `campus/` builders. Screenshots exist for the overview, each zone and the walking/work/result states.
- **Not run in Electron.** Electron renderer, React Three Fiber layer (`CampusWorld`, `CampusActors`, camera rig, canvas overlay), terminal parking, Classic View and PTY behaviour are **not verified**.
- Unit tests ran through a minimal `describe/it/expect` shim in Node (20/20), **not** through the repo's vitest. No typecheck, lint or `check:changed` was run.
- No FPS claim is made. Software rendering says nothing about GPU frame time.

## Known limitations

- Desk avatars at the Coding Studio are the existing GLB avatars; the campus actors reuse the same models and clips.
- Station props are procedural geometry. No Pantheon assets were copied. Existing Kenney furniture and character GLBs are unchanged; confirm the licence notes for them before release.
- Labels use canvas sprites (no network fonts). Pod sign banners are still DOM `Html` overlays from `ZonePod3D`.
- Sky is only visible at low camera pitch (the Cinematic preset); Isometric looks down at the ground.
