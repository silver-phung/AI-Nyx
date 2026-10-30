import { memo, Suspense, useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { createCampus, type Campus } from './campus/build-campus'
import { CampusActors } from './CampusActors'
import type { OfficeWorld } from '../model/office-world-types'

interface CampusWorldProps {
  readonly world: OfficeWorld
  readonly podRows: number
  readonly shadows: boolean
}

/**
 * Mounts the procedural Moonlight Campus (sky, ground, seven zones) and the actor director.
 * The campus is created in an effect (StrictMode-safe) and every GPU resource is released on unmount.
 */
export const CampusWorld = memo(function CampusWorld({ world, podRows, shadows }: CampusWorldProps) {
  const scene = useThree((s) => s.scene)
  const [campus, setCampus] = useState<Campus | null>(null)
  const campusRef = useRef<Campus | null>(null)
  const shadowsRef = useRef(shadows)
  shadowsRef.current = shadows

  useEffect(() => {
    const c = createCampus({ podRows, shadows: shadowsRef.current })
    campusRef.current = c
    setCampus(c)
    const previousFog = scene.fog
    scene.fog = c.root.userData.fog
    return () => {
      scene.fog = previousFog
      campusRef.current = null
      setCampus(null)
      c.dispose()
    }
  }, [podRows, scene])

  useEffect(() => {
    campus?.setShadows(shadows)
  }, [campus, shadows])

  useFrame((state) => {
    campusRef.current?.update(state.clock.elapsedTime, state.camera.position)
  })

  if (!campus) return null
  return (
    <>
      <primitive object={campus.root} />
      {/* Actors load GLTFs: suspend them on their own so the scenery shows immediately. */}
      <Suspense fallback={null}>
        <CampusActors world={world} campus={campus} shadows={shadows} />
      </Suspense>
    </>
  )
})
