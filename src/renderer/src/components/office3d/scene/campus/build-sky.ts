import * as THREE from 'three'
import { ResourceBag, drawCanvas, mulberry32, radialGlowTexture } from './campus-kit'

export interface CampusSky {
  readonly group: THREE.Group
  /** Direction *towards* the moon (unit vector). */
  readonly moonDirection: THREE.Vector3
  update(timeSeconds: number): void
}

const SKY_RADIUS = 450

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
  }
`

const skyFragment = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uHorizon;
  uniform vec3 uMid;
  uniform vec3 uZenith;
  uniform vec3 uGround;
  uniform vec3 uMoonDir;
  uniform float uTime;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }
  void main() {
    float h = vDir.y;
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.32, h));
    col = mix(col, uZenith, smoothstep(0.22, 0.85, h));
    // soft aurora-like violet veil drifting very slowly
    vec2 uv = vDir.xz / (abs(h) + 0.35);
    float veil = noise(uv * 1.6 + vec2(uTime * 0.01, 0.0)) * noise(uv * 3.1 - vec2(0.0, uTime * 0.008));
    col += vec3(0.20, 0.08, 0.32) * veil * smoothstep(0.05, 0.4, h) * (1.0 - smoothstep(0.5, 0.9, h));
    // halo around the moon
    float m = max(dot(normalize(vDir), uMoonDir), 0.0);
    col += vec3(0.30, 0.36, 0.80) * pow(m, 26.0) * 0.45;
    col = mix(col, uGround, smoothstep(0.0, -0.18, h));
    gl_FragColor = vec4(col, 1.0);
  }
`

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  varying float vTw;
  void main() {
    vTw = 0.55 + 0.45 * sin(uTime * (0.8 + aPhase * 1.4) + aPhase * 40.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (0.75 + 0.5 * vTw);
    gl_Position = projectionMatrix * mv;
  }
`

const starFragment = /* glsl */ `
  varying float vTw;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.82, 0.88, 1.0), a * vTw);
  }
`

function cloudTexture(bag: ResourceBag, seed: number): THREE.CanvasTexture {
  const rnd = mulberry32(seed)
  const c = drawCanvas(512, 192, (ctx, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = w * (0.28 + rnd() * 0.44)
      const y = h * (0.46 + rnd() * 0.12)
      const r = h * (0.14 + rnd() * 0.2)
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(210,200,255,0.55)')
      g.addColorStop(0.6, 'rgba(150,140,220,0.22)')
      g.addColorStop(1, 'rgba(120,110,200,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  const t = bag.tex(new THREE.CanvasTexture(c))
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function moonTexture(bag: ResourceBag): THREE.CanvasTexture {
  const rnd = mulberry32(77)
  const c = drawCanvas(512, 512, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.42, h * 0.4, 20, w / 2, h / 2, w * 0.52)
    g.addColorStop(0, '#fffdf2')
    g.addColorStop(0.7, '#e7e6f8')
    g.addColorStop(1, '#bdbfe6')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 38; i++) {
      const x = rnd() * w
      const y = rnd() * h
      const r = 8 + rnd() * 46
      const cg = ctx.createRadialGradient(x, y, 0, x, y, r)
      cg.addColorStop(0, 'rgba(150,152,200,0.34)')
      cg.addColorStop(0.8, 'rgba(150,152,200,0.1)')
      cg.addColorStop(1, 'rgba(150,152,200,0)')
      ctx.fillStyle = cg
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  const t = bag.tex(new THREE.CanvasTexture(c))
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function buildSky(bag: ResourceBag): CampusSky {
  const group = new THREE.Group()
  group.name = 'campus-sky'

  // Moon sits opposite the default camera, low enough to appear in the upper frame.
  const elevation = THREE.MathUtils.degToRad(12)
  const azimuth = Math.atan2(-0.62, -0.5)
  const moonDirection = new THREE.Vector3(
    Math.cos(elevation) * Math.cos(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(azimuth)
  ).normalize()

  const skyMat = bag.mat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uHorizon: { value: new THREE.Color('#6a3d8f') },
        uMid: { value: new THREE.Color('#25266e') },
        uZenith: { value: new THREE.Color('#080b32') },
        uGround: { value: new THREE.Color('#121238') },
        uMoonDir: { value: moonDirection.clone() },
        uTime: { value: 0 }
      },
      vertexShader: skyVertex,
      fragmentShader: skyFragment
    })
  )
  const dome = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(SKY_RADIUS, 48, 32)), skyMat)
  dome.renderOrder = -10
  dome.frustumCulled = false
  group.add(dome)

  // Stars
  const rnd = mulberry32(2026)
  const starCount = 1400
  const pos = new Float32Array(starCount * 3)
  const size = new Float32Array(starCount)
  const phase = new Float32Array(starCount)
  for (let i = 0; i < starCount; i++) {
    const y = 0.03 + Math.pow(rnd(), 0.8) * 0.97
    const theta = rnd() * Math.PI * 2
    const r = Math.sqrt(1 - y * y)
    const R = SKY_RADIUS * 0.96
    pos[i * 3] = Math.cos(theta) * r * R
    pos[i * 3 + 1] = y * R
    pos[i * 3 + 2] = Math.sin(theta) * r * R
    size[i] = 1.2 + Math.pow(rnd(), 3) * 3.6
    phase[i] = rnd()
  }
  const starGeo = bag.geo(new THREE.BufferGeometry())
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
  const starMat = bag.mat(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: starVertex,
      fragmentShader: starFragment
    })
  )
  const stars = new THREE.Points(starGeo, starMat)
  stars.frustumCulled = false
  stars.renderOrder = -9
  group.add(stars)

  // Moon + glow
  const moonDist = SKY_RADIUS * 0.9
  const moonMat = bag.mat(new THREE.MeshBasicMaterial({ map: moonTexture(bag), fog: false }))
  const moon = new THREE.Mesh(bag.geo(new THREE.SphereGeometry(36, 48, 32)), moonMat)
  moon.position.copy(moonDirection).multiplyScalar(moonDist)
  moon.renderOrder = -8
  moonMat.depthWrite = false
  group.add(moon)

  const glowTex = radialGlowTexture(bag)
  const glowMat = bag.mat(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x9fb3ff,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    })
  )
  const glow = new THREE.Sprite(glowMat)
  glow.position.copy(moon.position)
  glow.scale.setScalar(340)
  glow.renderOrder = -9
  group.add(glow)

  // Drifting clouds (sprites, additive-soft)
  const clouds: Array<{ sprite: THREE.Sprite; speed: number; baseAz: number; radius: number; height: number }> = []
  for (let i = 0; i < 9; i++) {
    const tex = cloudTexture(bag, 100 + i * 7)
    const mat = bag.mat(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.5 + rnd() * 0.25,
        depthWrite: false,
        fog: false
      })
    )
    const sprite = new THREE.Sprite(mat)
    const s = 120 + rnd() * 120
    sprite.scale.set(s * 2.2, s * 0.8, 1)
    sprite.renderOrder = -6
    group.add(sprite)
    clouds.push({
      sprite,
      speed: 0.0012 + rnd() * 0.0016,
      baseAz: azimuth + (rnd() - 0.5) * 2.6,
      radius: SKY_RADIUS * 0.82,
      height: 40 + rnd() * 90
    })
  }

  function placeClouds(t: number): void {
    for (const c of clouds) {
      const az = c.baseAz + t * c.speed
      c.sprite.position.set(Math.cos(az) * c.radius, c.height, Math.sin(az) * c.radius)
    }
  }
  placeClouds(0)

  return {
    group,
    moonDirection,
    update(t: number): void {
      skyMat.uniforms.uTime.value = t
      starMat.uniforms.uTime.value = t
      placeClouds(t)
    }
  }
}
