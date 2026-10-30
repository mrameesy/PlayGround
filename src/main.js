import * as THREE from 'three'

const canvas = document.getElementById('scene')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const el = {
  hud: document.getElementById('hud'),
  startScreen: document.getElementById('start-screen'),
  pauseScreen: document.getElementById('pause-screen'),
  startButton: document.getElementById('start-button'),
  resumeButton: document.getElementById('resume-button'),
  restartButton: document.getElementById('restart-button'),
  pauseButton: document.getElementById('pause-button'),
  soundButton: document.getElementById('sound-button'),
  tiltButton: document.getElementById('tilt-button'),
  startTilt: document.getElementById('start-tilt'),
  startSound: document.getElementById('start-sound'),
  pauseTilt: document.getElementById('pause-tilt'),
  pauseSound: document.getElementById('pause-sound'),
  moteCount: document.getElementById('mote-count'),
  moteValue: document.getElementById('mote-value'),
  hint: document.getElementById('hint'),
  hintText: document.getElementById('hint-text'),
  joystick: document.getElementById('joystick'),
  joystickKnob: document.getElementById('joystick-knob'),
  toast: document.getElementById('toast')
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const lerp = (a, b, t) => a + (b - a) * t

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false
})
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
renderer.setClearColor(0x04101a, 1)

const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(0x04101a, 0.011)

const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 500)
camera.position.set(0, 9.4, 8.6)


/* ------------------------------------------------------------------ *
 * Textures
 * ------------------------------------------------------------------ */

function radialTexture(stops, size = 128) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const glowTexture = radialTexture([
  [0, 'rgba(255,255,255,1)'],
  [0.18, 'rgba(210,255,255,0.92)'],
  [0.44, 'rgba(116,238,255,0.32)'],
  [0.72, 'rgba(60,180,220,0.06)'],
  [1, 'rgba(0,0,0,0)']
])

const dotTexture = radialTexture([
  [0, 'rgba(255,255,255,1)'],
  [0.35, 'rgba(210,250,255,0.8)'],
  [0.7, 'rgba(120,220,255,0.16)'],
  [1, 'rgba(0,0,0,0)']
], 64)

const haloTexture = radialTexture([
  [0, 'rgba(210,255,255,0)'],
  [0.14, 'rgba(210,255,255,0.55)'],
  [0.36, 'rgba(130,240,255,0.34)'],
  [0.68, 'rgba(60,190,225,0.08)'],
  [1, 'rgba(0,0,0,0)']
], 128)

const shadowTexture = radialTexture([
  [0, 'rgba(0,0,0,0.62)'],
  [0.45, 'rgba(0,0,0,0.3)'],
  [0.78, 'rgba(0,0,0,0.05)'],
  [1, 'rgba(0,0,0,0)']
], 96)

/* ------------------------------------------------------------------ *
 * Sky, stars and moon
 * ------------------------------------------------------------------ */

const skyUniforms = { uTime: { value: 0 } }

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(250, 48, 28),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      varying vec3 vDir;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.15, 1.0);
        vec3 zenith = vec3(0.006, 0.016, 0.044);
        vec3 horizon = vec3(0.024, 0.105, 0.145);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.78, h));

        float ang = atan(d.z, d.x);
        vec2 q = vec2(ang * 1.35, h * 5.2 - uTime * 0.026);
        float drift = fbm(q * 0.7 + vec2(uTime * 0.009, 0.0));
        float n = fbm(q + vec2(0.0, drift * 1.1));
        float curtain = smoothstep(0.46, 0.9, n);
        curtain *= smoothstep(0.02, 0.34, h) * (1.0 - smoothstep(0.5, 0.92, h));
        vec3 aurora = mix(vec3(0.08, 0.86, 0.6), vec3(0.46, 0.22, 0.95), fbm(q * 0.45 + 3.0));
        col += aurora * curtain * 0.5;

        vec2 sp = d.xz / (0.22 + max(d.y, 0.02));
        vec2 grid = floor(sp * 74.0);
        float st = hash(grid);
        float tw = 0.55 + 0.45 * sin(uTime * 1.7 + st * 42.0);
        float star = step(0.9935, st) * smoothstep(0.42, 0.0, length(fract(sp * 74.0) - 0.5)) * tw;
        star *= smoothstep(0.08, 0.42, h);
        col += vec3(0.78, 0.9, 1.0) * star * 1.6;

        col += vec3(0.03, 0.22, 0.27) * pow(1.0 - abs(h), 9.0) * 0.55;

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  })
)
sky.frustumCulled = false
sky.renderOrder = -20
scene.add(sky)

const skyGroup = new THREE.Group()
scene.add(skyGroup)

const moonGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0x9edcff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  })
)
moonGlow.position.set(-72, 48, -150)
moonGlow.scale.set(38, 38, 1)
skyGroup.add(moonGlow)

const moonCore = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: dotTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  })
)
moonCore.position.copy(moonGlow.position)
moonCore.scale.set(7.5, 7.5, 1)
skyGroup.add(moonCore)

const starCount = 720
const starPositions = new Float32Array(starCount * 3)
for (let i = 0; i < starCount; i++) {
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(Math.random() * 1.1 - 0.1)
  const radius = 205 + Math.random() * 22
  starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius
  starPositions[i * 3 + 1] = Math.cos(phi) * radius
  starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius
}
const starGeometry = new THREE.BufferGeometry()
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0xcfeeff,
    size: 1.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending
  })
)
skyGroup.add(stars)

/* ------------------------------------------------------------------ *
 * Ice ground
 * ------------------------------------------------------------------ */

const groundUniforms = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector2(0, 0) }
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(440, 440, 1, 1),
  new THREE.ShaderMaterial({
    uniforms: groundUniforms,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec2 uPlayer;
      varying vec2 vWorld;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.02;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 p = vWorld;
        float dist = length(p - uPlayer);

        float n1 = fbm(p * 0.055);
        float n2 = fbm(p * 0.14 + 7.31);

        vec3 deep = vec3(0.0035, 0.018, 0.032);
        vec3 shallow = vec3(0.014, 0.068, 0.09);
        vec3 col = mix(deep, shallow, smoothstep(0.28, 0.82, n1));

        float r1 = 1.0 - abs(fbm(p * 0.085 + n1 * 0.4) * 2.0 - 1.0);
        float r2 = 1.0 - abs(fbm(p * 0.23 + 11.7) * 2.0 - 1.0);
        float crack = pow(r1, 30.0) * 0.8 + pow(r2, 46.0) * 0.35;
        col += vec3(0.12, 0.55, 0.64) * crack * 0.38;
        col += vec3(0.45, 0.85, 0.95) * pow(r2, 90.0) * 0.18;

        float auroraSheen = fbm(p * 0.014 + vec2(uTime * 0.008, -uTime * 0.005));
        col += mix(vec3(0.04, 0.28, 0.24), vec3(0.16, 0.07, 0.3), auroraSheen) * pow(auroraSheen, 2.6) * 0.24;

        vec2 g = floor(p * 4.0);
        float h = hash(g);
        float tw = 0.5 + 0.5 * sin(uTime * 1.9 + h * 31.0);
        float spark = step(0.987, h) * smoothstep(0.42, 0.0, length(fract(p * 4.0) - 0.5)) * tw;
        col += vec3(0.82, 1.0, 1.0) * spark * 0.9;

        float fog = smoothstep(26.0, 110.0, dist);
        col = mix(col, vec3(0.008, 0.03, 0.046), fog);
        col += vec3(0.014, 0.075, 0.085) * exp(-dist * 0.06);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  })
)
ground.rotation.x = -Math.PI / 2
ground.frustumCulled = false
scene.add(ground)

/* ------------------------------------------------------------------ *
 * Lights
 * ------------------------------------------------------------------ */

scene.add(new THREE.HemisphereLight(0x7dd7ff, 0x04101a, 0.85))
const moonLight = new THREE.DirectionalLight(0xbfe9ff, 1.55)
moonLight.position.set(-24, 34, -18)
scene.add(moonLight)
const fillLight = new THREE.DirectionalLight(0x2f7f9c, 0.5)
fillLight.position.set(20, 12, 24)
scene.add(fillLight)

/* ------------------------------------------------------------------ *
 * Player marble
 * ------------------------------------------------------------------ */

const player = new THREE.Group()
player.position.set(0, 0.66, 0)
scene.add(player)

const spin = new THREE.Group()
player.add(spin)

const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.54, 3),
  new THREE.MeshPhysicalMaterial({
    color: 0x8ff2fb,
    emissive: 0x1ea6bb,
    emissiveIntensity: 0.62,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.08
  })
)
spin.add(core)

const innerCore = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.24, 2),
  new THREE.MeshBasicMaterial({ color: 0xbdfaff })
)
spin.add(innerCore)

const wire = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.74, 1),
  new THREE.MeshBasicMaterial({
    color: 0x9ff6ff,
    wireframe: true,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
)
spin.add(wire)

const halo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: haloTexture,
    color: 0x8ff2ff,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  })
)
halo.scale.set(5.2, 5.2, 1)
halo.renderOrder = 4
player.add(halo)

const ringMaterial = new THREE.MeshBasicMaterial({
  color: 0x8ff7ff,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
  blending: THREE.AdditiveBlending
})
const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.014, 6, 72), ringMaterial)
ringA.rotation.x = Math.PI / 2.35
ringA.rotation.y = 0.5
player.add(ringA)
const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.01, 6, 72), ringMaterial.clone())
ringB.material.opacity = 0.28
ringB.rotation.x = Math.PI / 1.8
ringB.rotation.z = -0.6
player.add(ringB)

const playerLight = new THREE.PointLight(0x7ff4ff, 22, 16, 2)
playerLight.position.set(0, 0.6, 0)
player.add(playerLight)

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(1.7, 48),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.05, d);
        a = a * a * 0.52;
        gl_FragColor = vec4(0.0, 0.012, 0.022, a);
      }
    `
  })
)
shadow.rotation.x = -Math.PI / 2
shadow.position.set(0, 0.025, 0)
scene.add(shadow)

const groundGlow = new THREE.Mesh(
  new THREE.CircleGeometry(2.9, 48),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        a = pow(a, 2.6) * 0.34;
        gl_FragColor = vec4(0.13, 0.62, 0.68, a);
      }
    `
  })
)
groundGlow.rotation.x = -Math.PI / 2
groundGlow.position.set(0, 0.035, 0)
scene.add(groundGlow)

/* ------------------------------------------------------------------ *
 * Drifting light (collectibles)
 * ------------------------------------------------------------------ */

const shardGroup = new THREE.Group()
scene.add(shardGroup)

const shardMaterial = new THREE.MeshStandardMaterial({
  color: 0x8fffe8,
  emissive: 0x1eb8a4,
  emissiveIntensity: 1.15,
  metalness: 0.18,
  roughness: 0.16
})
const goldMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff0c4,
  emissive: 0xffb84d,
  emissiveIntensity: 1.9,
  metalness: 0.35,
  roughness: 0.2
})

const shardGeometry = new THREE.OctahedronGeometry(0.34, 0)
const shards = []

function placeShard(shard, initial = false) {
  const angle = Math.random() * Math.PI * 2
  const radius = initial ? 9 + Math.random() * 24 : 17 + Math.random() * 22
  shard.group.position.set(
    player.position.x + Math.cos(angle) * radius,
    1.02,
    player.position.z + Math.sin(angle) * radius
  )
  shard.phase = Math.random() * Math.PI * 2
  shard.spin = (Math.random() - 0.5) * 1.4
  shard.spawn = initial ? 1 : 0
  shard.group.scale.setScalar(initial ? 1 : 0.001)
  shard.group.visible = true
  shard.golden = Math.random() < 0.14
  shard.mesh.material = shard.golden ? goldMaterial : shardMaterial
  shard.glow.material.color.set(shard.golden ? 0xffc76b : 0x67f5e2)
  shard.glow.material.opacity = shard.golden ? 0.82 : 0.6
  shard.wire.material.color.set(shard.golden ? 0xffd27a : 0x9fffe8)
}

for (let i = 0; i < 13; i++) {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(shardGeometry, shardMaterial)
  const wire = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.34, 0),
    new THREE.MeshBasicMaterial({
      color: 0x9fffe8,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  wire.scale.setScalar(1.8)
  mesh.add(wire)
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: haloTexture,
      color: 0x67f5e2,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  )
  glow.scale.set(2.1, 2.1, 1)
  group.add(glow)
  group.add(mesh)
  shardGroup.add(group)
  const shard = { group, mesh, wire, glow, phase: Math.random() * 6.28, spin: 1, spawn: 1, golden: false }
  shards.push(shard)
  placeShard(shard, true)
}

/* ------------------------------------------------------------------ *
 * Ice spires
 * ------------------------------------------------------------------ */

const spireGroup = new THREE.Group()
scene.add(spireGroup)

const spireMaterial = new THREE.MeshStandardMaterial({
  color: 0x6bbfd0,
  emissive: 0x1a7c8f,
  emissiveIntensity: 1.05,
  roughness: 0.15,
  metalness: 0.15,
  transparent: true,
  opacity: 0.92
})
const spireGeometries = [
  new THREE.ConeGeometry(0.7, 2.5, 5, 1),
  new THREE.ConeGeometry(0.95, 3.6, 6, 1),
  new THREE.ConeGeometry(0.45, 1.7, 5, 1)
]
const spires = []

function placeSpire(spire, initial = false) {
  const angle = initial ? Math.PI + Math.random() * Math.PI : Math.random() * Math.PI * 2
  const radius = initial ? 26 + Math.random() * 22 : 28 + Math.random() * 26
  spire.group.position.set(
    player.position.x + Math.cos(angle) * radius,
    0,
    player.position.z + Math.sin(angle) * radius
  )
  spire.group.rotation.y = Math.random() * Math.PI * 2
  spire.radius = 0.9
  spire.group.visible = true
}

for (let i = 0; i < 11; i++) {
  const group = new THREE.Group()
  const count = 1 + Math.floor(Math.random() * 3)
  for (let j = 0; j < count; j++) {
    const mesh = new THREE.Mesh(spireGeometries[Math.floor(Math.random() * spireGeometries.length)], spireMaterial)
    mesh.position.set((Math.random() - 0.5) * 1.4, 1.2 + Math.random() * 0.3, (Math.random() - 0.5) * 1.4)
    mesh.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI, (Math.random() - 0.5) * 0.25)
    mesh.scale.setScalar(0.55 + Math.random() * 0.6)
    group.add(mesh)
  }
  spireGroup.add(group)
  const spire = { group, radius: 1.1 }
  spires.push(spire)
  placeSpire(spire, true)
}

/* ------------------------------------------------------------------ *
 * Snow and particles
 * ------------------------------------------------------------------ */

const snowCount = reduceMotion ? 280 : 620
const snowPositions = new Float32Array(snowCount * 3)
const snowSeeds = new Float32Array(snowCount)
for (let i = 0; i < snowCount; i++) {
  snowPositions[i * 3] = (Math.random() - 0.5) * 52
  snowPositions[i * 3 + 1] = Math.random() * 22
  snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 52
  snowSeeds[i] = Math.random() * Math.PI * 2
}
const snowGeometry = new THREE.BufferGeometry()
snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3))
const snowMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    varying float vFade;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vFade = smoothstep(1.5, 5.0, -mv.z);
      gl_PointSize = clamp(0.28 * (300.0 / max(0.1, -mv.z)), 1.0, 13.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vFade;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      float a = smoothstep(0.5, 0.0, d);
      a *= a * vFade;
      gl_FragColor = vec4(0.78, 0.94, 1.0, a * 0.66);
    }
  `
})
const snow = new THREE.Points(snowGeometry, snowMaterial)
scene.add(snow)

const PARTICLE_COUNT = reduceMotion ? 180 : 340
const particlePositions = new Float32Array(PARTICLE_COUNT * 3)
const particleColors = new Float32Array(PARTICLE_COUNT * 3)
const particleSizes = new Float32Array(PARTICLE_COUNT)
const particleAlpha = new Float32Array(PARTICLE_COUNT)
const particleVelocity = new Float32Array(PARTICLE_COUNT * 3)
const particleLife = new Float32Array(PARTICLE_COUNT)
const particleMaxLife = new Float32Array(PARTICLE_COUNT)
let particleCursor = 0

const particleGeometry = new THREE.BufferGeometry()
particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
particleGeometry.setAttribute('aColor', new THREE.BufferAttribute(particleColors, 3))
particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(particleSizes, 1))
particleGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(particleAlpha, 1))

const particleMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute float aAlpha;
    attribute vec3 aColor;
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vAlpha = aAlpha * smoothstep(1.5, 5.0, -mv.z);
      gl_PointSize = clamp(aSize * (280.0 / max(0.1, -mv.z)), 1.0, 20.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      float a = smoothstep(0.5, 0.0, d);
      a *= a;
      gl_FragColor = vec4(vColor, a * vAlpha);
    }
  `
})

const particles = new THREE.Points(particleGeometry, particleMaterial)
particles.frustumCulled = false
scene.add(particles)

const tempColor = new THREE.Color()

function emitParticle(x, y, z, vx, vy, vz, life, size, color) {
  const i = particleCursor
  particleCursor = (particleCursor + 1) % PARTICLE_COUNT
  particlePositions[i * 3] = x
  particlePositions[i * 3 + 1] = y
  particlePositions[i * 3 + 2] = z
  particleVelocity[i * 3] = vx
  particleVelocity[i * 3 + 1] = vy
  particleVelocity[i * 3 + 2] = vz
  particleLife[i] = life
  particleMaxLife[i] = life
  particleSizes[i] = size
  particleAlpha[i] = 1
  tempColor.set(color)
  particleColors[i * 3] = tempColor.r
  particleColors[i * 3 + 1] = tempColor.g
  particleColors[i * 3 + 2] = tempColor.b
}

function burst(position, color, count = 16, power = 2.6) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const b = Math.random() * Math.PI
    const speed = power * (0.35 + Math.random() * 0.65)
    emitParticle(
      position.x,
      position.y,
      position.z,
      Math.cos(a) * Math.sin(b) * speed,
      Math.cos(b) * speed * 0.8 + 0.5,
      Math.sin(a) * Math.sin(b) * speed,
      0.7 + Math.random() * 0.8,
      0.18 + Math.random() * 0.22,
      color
    )
  }
}

/* ------------------------------------------------------------------ *
 * Audio
 * ------------------------------------------------------------------ */

const audio = {
  ctx: null,
  master: null,
  padGain: null,
  enabled: true,
  ready: false,
  init() {
    if (this.ctx) return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const master = ctx.createGain()
    master.gain.value = this.enabled ? 0.16 : 0
    master.connect(ctx.destination)

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 720
    filter.Q.value = 0.4
    filter.connect(master)

    const notes = [110, 164.81, 220, 277.18]
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = frequency
      osc.detune.value = (index - 1.5) * 5
      const gain = ctx.createGain()
      gain.gain.value = 0.085 / (index + 1)
      osc.connect(gain)
      gain.connect(filter)
      osc.start()

      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.028 + index * 0.011
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.035 / (index + 1)
      lfo.connect(lfoGain)
      lfoGain.connect(gain.gain)
      lfo.start()
    })

    const shimmer = ctx.createOscillator()
    shimmer.type = 'triangle'
    shimmer.frequency.value = 880
    const shimmerGain = ctx.createGain()
    shimmerGain.gain.value = 0.0035
    shimmer.connect(shimmerGain)
    shimmerGain.connect(master)
    shimmer.start()

    this.ctx = ctx
    this.master = master
    this.ready = true
  },
  start() {
    if (!this.enabled) return
    this.init()
    if (this.ctx?.state === 'suspended') this.ctx.resume()
  },
  setEnabled(on) {
    this.enabled = on
    if (on && state.started) this.start()
    if (!this.master || !this.ctx) return
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(on ? 0.16 : 0, now, 0.18)
    if (!on && this.ctx.state === 'running') {
      setTimeout(() => {
        if (!this.enabled && this.ctx?.state === 'running') this.ctx.suspend()
      }, 500)
    }
  },
  pause() {
    if (this.ctx?.state === 'running') this.ctx.suspend()
  },
  resume() {
    if (this.enabled && this.ctx?.state === 'suspended') this.ctx.resume()
  },
  chime(golden = false) {
    if (!this.enabled || !this.ctx) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]
    const frequency = scale[Math.floor(Math.random() * scale.length)] * (golden ? 2 : 1)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = frequency
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(golden ? 0.09 : 0.055, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(now)
    osc.stop(now + 1.7)

    if (golden) {
      const osc2 = ctx.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.value = frequency * 1.5
      const gain2 = ctx.createGain()
      gain2.gain.setValueAtTime(0.0001, now + 0.06)
      gain2.gain.exponentialRampToValueAtTime(0.035, now + 0.09)
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)
      osc2.connect(gain2)
      gain2.connect(this.master)
      osc2.start(now + 0.06)
      osc2.stop(now + 1.5)
    }
  },
  thud() {
    if (!this.enabled || !this.ctx) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(90, now)
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.35)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(now)
    osc.stop(now + 0.55)
  }
}

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

const input = {
  active: false,
  pointerId: null,
  originX: 0,
  originY: 0,
  radius: 58,
  x: 0,
  z: 0
}

const keys = new Set()
const tilt = {
  enabled: false,
  listening: false,
  seen: false,
  beta0: null,
  gamma0: null,
  x: 0,
  z: 0,
  targetX: 0,
  targetZ: 0,
  rawX: 0,
  rawZ: 0
}

function joystickRadius() {
  return Math.max(46, Math.min(72, window.innerWidth * 0.12))
}

function showJoystick(x, y) {
  input.originX = x
  input.originY = y
  input.radius = joystickRadius()
  el.joystick.style.left = `${x}px`
  el.joystick.style.top = `${y}px`
  el.joystick.style.width = `${input.radius * 2}px`
  el.joystick.style.height = `${input.radius * 2}px`
  el.joystick.style.margin = `${-input.radius}px 0 0 ${-input.radius}px`
  el.joystickKnob.style.transform = 'translate(0px, 0px)'
  el.joystick.classList.remove('hidden')
  requestAnimationFrame(() => el.joystick.classList.add('visible'))
}

function hideJoystick() {
  el.joystick.classList.remove('visible')
  setTimeout(() => {
    if (!input.active) el.joystick.classList.add('hidden')
  }, 180)
}

function updateJoystick(dx, dy) {
  const length = Math.hypot(dx, dy)
  const radius = input.radius
  if (length > radius) {
    dx = (dx / length) * radius
    dy = (dy / length) * radius
  }
  input.x = clamp(dx / radius, -1, 1)
  input.z = clamp(dy / radius, -1, 1)
  el.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`
}

canvas.addEventListener('pointerdown', (event) => {
  if (!state.running || state.paused) return
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (input.active) return
  input.active = true
  input.pointerId = event.pointerId
  input.x = 0
  input.z = 0
  canvas.setPointerCapture?.(event.pointerId)
  showJoystick(event.clientX, event.clientY)
  el.hint.classList.add('fade')
  event.preventDefault()
})

canvas.addEventListener('pointermove', (event) => {
  if (!input.active || event.pointerId !== input.pointerId) return
  updateJoystick(event.clientX - input.originX, event.clientY - input.originY)
  event.preventDefault()
})

function endPointer(event) {
  if (!input.active || (event.pointerId !== undefined && event.pointerId !== input.pointerId)) return
  input.active = false
  input.pointerId = null
  input.x = 0
  input.z = 0
  hideJoystick()
}

canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', endPointer)
canvas.addEventListener('lostpointercapture', endPointer)
canvas.addEventListener('contextmenu', (event) => event.preventDefault())

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase()
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    keys.add(key)
    event.preventDefault()
  }
  if (key === 'escape' && state.running) {
    state.paused ? resumeGame() : pauseGame()
  }
})

window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase())
})

window.addEventListener('blur', () => {
  keys.clear()
  endPointer({ pointerId: input.pointerId })
})

function keyboardInput() {
  let x = 0
  let z = 0
  if (keys.has('a') || keys.has('arrowleft')) x -= 1
  if (keys.has('d') || keys.has('arrowright')) x += 1
  if (keys.has('w') || keys.has('arrowup')) z -= 1
  if (keys.has('s') || keys.has('arrowdown')) z += 1
  return { x, z }
}

function combinedInput() {
  if (input.active) return { x: input.x, z: input.z }
  const keyboard = keyboardInput()
  let x = keyboard.x
  let z = keyboard.z
  if (tilt.enabled) {
    x += tilt.x
    z += tilt.z
  }
  return { x: clamp(x, -1, 1), z: clamp(z, -1, 1) }
}

/* ------------------------------------------------------------------ *
 * Tilt / motion permission
 * ------------------------------------------------------------------ */

function screenAngle() {
  const angle = screen.orientation?.angle ?? window.orientation ?? 0
  return (Number(angle) || 0) * Math.PI / 180
}

function onOrientation(event) {
  if (event.beta == null || event.gamma == null) return
  if (!tilt.seen) {
    tilt.seen = true
    tilt.beta0 = event.beta
    tilt.gamma0 = event.gamma
    showToast('Tilt steering active')
  }
  if (tilt.beta0 == null || tilt.gamma0 == null) {
    tilt.beta0 = event.beta
    tilt.gamma0 = event.gamma
  }
  const angle = screenAngle()
  const dx = event.gamma - tilt.gamma0
  const dy = event.beta - tilt.beta0
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  tilt.rawX = dx * cos + dy * sin
  tilt.rawZ = -dx * sin + dy * cos
  tilt.targetX = clamp(tilt.rawX / 22, -1, 1)
  tilt.targetZ = clamp(tilt.rawZ / 22, -1, 1)
}

async function requestMotionPermission() {
  if (typeof DeviceOrientationEvent === 'undefined') return false
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const result = await DeviceOrientationEvent.requestPermission()
      if (result !== 'granted') return false
    } catch {
      return false
    }
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { await DeviceMotionEvent.requestPermission() } catch { /* orientation is enough */ }
    }
  }
  return true
}

async function setTiltEnabled(enabled, { announce = true } = {}) {
  if (enabled === tilt.enabled) {
    syncTiltControls()
    return true
  }
  if (!enabled) {
    tilt.enabled = false
    tilt.x = 0
    tilt.z = 0
    tilt.targetX = 0
    tilt.targetZ = 0
    tilt.beta0 = null
    tilt.gamma0 = null
    tilt.seen = false
    if (tilt.listening) {
      window.removeEventListener('deviceorientation', onOrientation)
      tilt.listening = false
    }
    syncTiltControls()
    if (announce) showToast('Tilt off — drag to steer')
    return true
  }

  const granted = await requestMotionPermission()
  if (!granted) {
    syncTiltControls()
    if (announce) showToast('Motion access not granted. Touch still works.')
    return false
  }

  tilt.enabled = true
  tilt.beta0 = null
  tilt.gamma0 = null
  tilt.seen = false
  if (!tilt.listening) {
    window.addEventListener('deviceorientation', onOrientation)
    tilt.listening = true
  }
  syncTiltControls()
  if (announce) showToast('Tilt on — hold naturally, then lean to glide')

  window.setTimeout(() => {
    if (tilt.enabled && !tilt.seen) {
      tilt.enabled = false
      tilt.x = 0
      tilt.z = 0
      tilt.targetX = 0
      tilt.targetZ = 0
      if (tilt.listening) {
        window.removeEventListener('deviceorientation', onOrientation)
        tilt.listening = false
      }
      syncTiltControls()
      showToast('No motion sensor found — drag to steer')
    }
  }, 1800)
  return true
}

function syncTiltControls() {
  el.startTilt.checked = tilt.enabled
  el.pauseTilt.checked = tilt.enabled
  el.tiltButton.setAttribute('aria-pressed', String(tilt.enabled))
}

/* ------------------------------------------------------------------ *
 * UI state
 * ------------------------------------------------------------------ */

const state = {
  running: false,
  paused: false,
  started: false,
  score: 0,
  hintTimer: null,
  toastTimer: null
}

function showToast(message, duration = 3200) {
  el.toast.textContent = message
  el.toast.classList.add('show')
  clearTimeout(state.toastTimer)
  state.toastTimer = setTimeout(() => el.toast.classList.remove('show'), duration)
}

function setScore(value) {
  state.score = value
  el.moteValue.textContent = String(value)
  el.moteCount.classList.remove('pulse')
  void el.moteCount.offsetWidth
  el.moteCount.classList.add('pulse')
  setTimeout(() => el.moteCount.classList.remove('pulse'), 280)
}

function setSound(enabled) {
  audio.setEnabled(enabled)
  el.startSound.checked = enabled
  el.pauseSound.checked = enabled
  el.soundButton.setAttribute('aria-pressed', String(enabled))
}

function showHint(text, duration = 7000) {
  el.hintText.textContent = text
  el.hint.classList.remove('hidden', 'fade')
  clearTimeout(state.hintTimer)
  state.hintTimer = setTimeout(() => el.hint.classList.add('fade'), duration)
}

function startGame() {
  if (state.started) return
  state.started = true
  state.running = true
  state.paused = false
  el.startScreen.classList.add('closing')
  setTimeout(() => el.startScreen.classList.add('hidden'), 700)
  el.hud.classList.remove('hidden')
  setSound(el.startSound.checked)
  audio.start()
  const message = tilt.enabled ? 'Drag to steer · lean to glide' : 'Drag anywhere to steer'
  showHint(message, 6500)
}

function pauseGame() {
  if (!state.running || state.paused) return
  state.paused = true
  el.pauseScreen.classList.remove('hidden')
  el.pauseScreen.setAttribute('aria-hidden', 'false')
  el.hint.classList.add('fade')
  audio.pause()
}

function resumeGame() {
  if (!state.running || !state.paused) return
  state.paused = false
  el.pauseScreen.classList.add('hidden')
  el.pauseScreen.setAttribute('aria-hidden', 'true')
  audio.resume()
  showHint('Drag anywhere to steer', 4000)
}

function restartGame() {
  resetWorld()
  state.running = true
  state.paused = false
  el.pauseScreen.classList.add('hidden')
  el.pauseScreen.setAttribute('aria-hidden', 'true')
  audio.resume()
  showHint('Drag anywhere to steer', 4000)
  showToast('A fresh drift')
}

el.startButton.addEventListener('click', startGame)
el.pauseButton.addEventListener('click', pauseGame)
el.resumeButton.addEventListener('click', resumeGame)
el.restartButton.addEventListener('click', restartGame)

el.soundButton.addEventListener('click', () => {
  setSound(el.soundButton.getAttribute('aria-pressed') !== 'true')
})
el.tiltButton.addEventListener('click', () => {
  setTiltEnabled(el.tiltButton.getAttribute('aria-pressed') !== 'true')
})

el.startTilt.addEventListener('change', async () => {
  const ok = await setTiltEnabled(el.startTilt.checked)
  if (!ok) el.startTilt.checked = false
})
el.pauseTilt.addEventListener('change', async () => {
  const ok = await setTiltEnabled(el.pauseTilt.checked)
  if (!ok) el.pauseTilt.checked = false
})
el.startSound.addEventListener('change', () => setSound(el.startSound.checked))
el.pauseSound.addEventListener('change', () => setSound(el.pauseSound.checked))

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.running && !state.paused) pauseGame()
})

/* ------------------------------------------------------------------ *
 * World simulation
 * ------------------------------------------------------------------ */

const velocity = new THREE.Vector2(0, 0)
const cameraTarget = new THREE.Vector3()
const cameraDesired = new THREE.Vector3()
const lookTarget = new THREE.Vector3()
const smoothLook = new THREE.Vector3(0, 0.7, 0)
const rollAxis = new THREE.Vector3()
let elapsed = 0
let trailTimer = 0
let idleTimer = 0

function resetWorld() {
  player.position.set(0, 0.66, 0)
  spin.rotation.set(0, 0, 0)
  velocity.set(0, 0)
  camera.position.set(0, 9.4, 8.6)
  smoothLook.set(0, 0.7, 0)
  elapsed = 0
  trailTimer = 0
  idleTimer = 0
  setScore(0)
  for (const shard of shards) placeShard(shard, true)
  for (const spire of spires) placeSpire(spire, true)
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particleLife[i] = 0
    particleAlpha[i] = 0
  }
  particleGeometry.attributes.position.needsUpdate = true
  particleGeometry.attributes.aAlpha.needsUpdate = true
}

function collectShard(shard) {
  const value = shard.golden ? 3 : 1
  setScore(state.score + value)
  burst(shard.group.position, shard.golden ? 0xffc76b : 0x7dffe6, shard.golden ? 26 : 16, shard.golden ? 3.4 : 2.6)
  audio.chime(shard.golden)
  placeShard(shard)
}

function updateShards(dt, time) {
  for (const shard of shards) {
    const group = shard.group
    group.position.y = 1.02 + Math.sin(time * 1.5 + shard.phase) * 0.16
    shard.mesh.rotation.y += dt * (0.7 + shard.spin * 0.2)
    shard.mesh.rotation.x = Math.sin(time * 0.7 + shard.phase) * 0.3
    shard.glow.material.opacity = 0.58 + Math.sin(time * 2.2 + shard.phase) * 0.18

    if (shard.spawn < 1) {
      shard.spawn = Math.min(1, shard.spawn + dt * 2.6)
      const eased = 1 - Math.pow(1 - shard.spawn, 3)
      group.scale.setScalar(eased)
    }

    const dx = group.position.x - player.position.x
    const dz = group.position.z - player.position.z
    if (dx * dx + dz * dz < 1.5 * 1.5) collectShard(shard)
    else if (dx * dx + dz * dz > 58 * 58) placeShard(shard)
  }
}

function updateSpires() {
  for (const spire of spires) {
    const dx = player.position.x - spire.group.position.x
    const dz = player.position.z - spire.group.position.z
    const distance = Math.hypot(dx, dz)
    const minDistance = spire.radius + 0.55
    if (distance < minDistance && distance > 0.0001) {
      const nx = dx / distance
      const nz = dz / distance
      player.position.x = spire.group.position.x + nx * minDistance
      player.position.z = spire.group.position.z + nz * minDistance
      const dot = velocity.x * nx + velocity.y * nz
      if (dot < 0) {
        velocity.x -= 1.6 * dot * nx
        velocity.y -= 1.6 * dot * nz
        velocity.multiplyScalar(0.55)
        audio.thud()
        burst(
          new THREE.Vector3(player.position.x - nx * 0.5, 0.7, player.position.z - nz * 0.5),
          0x7fd8e8,
          7,
          1.4
        )
      }
    }
    const far = Math.hypot(player.position.x - spire.group.position.x, player.position.z - spire.group.position.z)
    if (far > 64) placeSpire(spire)
  }
}

function updateParticles(dt) {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    if (particleLife[i] <= 0) continue
    particleLife[i] -= dt
    if (particleLife[i] <= 0) {
      particleAlpha[i] = 0
      continue
    }
    particlePositions[i * 3] += particleVelocity[i * 3] * dt
    particlePositions[i * 3 + 1] += particleVelocity[i * 3 + 1] * dt
    particlePositions[i * 3 + 2] += particleVelocity[i * 3 + 2] * dt
    particleVelocity[i * 3] *= 0.985
    particleVelocity[i * 3 + 1] *= 0.985
    particleVelocity[i * 3 + 2] *= 0.985
    const ratio = particleLife[i] / particleMaxLife[i]
    particleAlpha[i] = ratio * ratio
  }
  particleGeometry.attributes.position.needsUpdate = true
  particleGeometry.attributes.aAlpha.needsUpdate = true
  particleGeometry.attributes.aColor.needsUpdate = true
  particleGeometry.attributes.aSize.needsUpdate = true
}

function updateSnow(dt, time) {
  const positions = snowGeometry.attributes.position.array
  const px = player.position.x
  const pz = player.position.z
  for (let i = 0; i < snowCount; i++) {
    const seed = snowSeeds[i]
    positions[i * 3] += Math.sin(time * 0.25 + seed) * dt * 0.55 + dt * 0.18
    positions[i * 3 + 1] -= (0.35 + (i % 7) * 0.045) * dt
    positions[i * 3 + 2] += Math.cos(time * 0.21 + seed * 1.3) * dt * 0.45

    if (positions[i * 3] > px + 26) positions[i * 3] -= 52
    else if (positions[i * 3] < px - 26) positions[i * 3] += 52
    if (positions[i * 3 + 2] > pz + 26) positions[i * 3 + 2] -= 52
    else if (positions[i * 3 + 2] < pz - 26) positions[i * 3 + 2] += 52
    if (positions[i * 3 + 1] < 0.05) positions[i * 3 + 1] = 21 + Math.random() * 2
  }
  snowGeometry.attributes.position.needsUpdate = true
}

function updatePlayer(dt, time) {
  const control = state.running ? combinedInput() : { x: 0, z: 0 }
  const tiltEase = 1 - Math.exp(-9 * dt)
  tilt.x = lerp(tilt.x, tilt.targetX, tiltEase)
  tilt.z = lerp(tilt.z, tilt.targetZ, tiltEase)
  const accel = 20
  const maxSpeed = 7.4

  velocity.x += control.x * accel * dt
  velocity.y += control.z * accel * dt
  const damping = Math.exp(-2.45 * dt)
  velocity.x *= damping
  velocity.y *= damping

  const speed = velocity.length()
  if (speed > maxSpeed) {
    velocity.x = (velocity.x / speed) * maxSpeed
    velocity.y = (velocity.y / speed) * maxSpeed
  }

  player.position.x += velocity.x * dt
  player.position.z += velocity.y * dt

  const bob = Math.sin(time * 2.1) * 0.035
  player.position.y = 0.66 + bob

  const moveSpeed = velocity.length()
  if (moveSpeed > 0.02) {
    rollAxis.set(velocity.y, 0, -velocity.x).normalize()
    spin.rotateOnWorldAxis(rollAxis, (moveSpeed * dt) / 0.54)
  }

  player.rotation.x = lerp(player.rotation.x, clamp(-velocity.y * 0.012, -0.12, 0.12), 1 - Math.exp(-6 * dt))
  player.rotation.z = lerp(player.rotation.z, clamp(velocity.x * 0.012, -0.12, 0.12), 1 - Math.exp(-6 * dt))

  halo.material.opacity = 0.68 + Math.sin(time * 2.4) * 0.1
  ringA.rotation.z += dt * 0.5
  ringB.rotation.z -= dt * 0.32
  playerLight.intensity = 19 + Math.sin(time * 2.8) * 3

  shadow.position.set(player.position.x, 0.025, player.position.z)
  groundGlow.position.set(player.position.x, 0.035, player.position.z)
  const shadowScale = 1 - bob * 2.4
  shadow.scale.set(shadowScale, shadowScale, 1)

  trailTimer -= dt
  if (trailTimer <= 0 && (moveSpeed > 0.5 || state.running)) {
    trailTimer = 0.045
    const jitter = 0.18
    emitParticle(
      player.position.x + (Math.random() - 0.5) * jitter,
      0.5 + Math.random() * 0.25,
      player.position.z + (Math.random() - 0.5) * jitter,
      -velocity.x * 0.04 + (Math.random() - 0.5) * 0.25,
      0.2 + Math.random() * 0.3,
      -velocity.y * 0.04 + (Math.random() - 0.5) * 0.25,
      0.7 + Math.random() * 0.5,
      0.16 + Math.random() * 0.16,
      Math.random() < 0.18 ? 0xd9fff8 : 0x65f4e6
    )
  }

  idleTimer -= dt
  if (idleTimer <= 0) {
    idleTimer = 0.5 + Math.random() * 0.8
    const a = Math.random() * Math.PI * 2
    emitParticle(
      player.position.x + Math.cos(a) * (1 + Math.random() * 0.6),
      0.55 + Math.random() * 0.7,
      player.position.z + Math.sin(a) * (1 + Math.random() * 0.6),
      Math.cos(a) * 0.18,
      0.25 + Math.random() * 0.3,
      Math.sin(a) * 0.18,
      1.4 + Math.random() * 0.9,
      0.1 + Math.random() * 0.1,
      0x8ff8ff
    )
  }
}

function updateCamera(dt, time) {
  cameraTarget.set(player.position.x, 0.7, player.position.z)
  const swayX = reduceMotion ? 0 : Math.sin(time * 0.18) * 0.35
  const swayY = reduceMotion ? 0 : Math.cos(time * 0.13) * 0.18
  cameraDesired.set(
    player.position.x + velocity.x * 0.2 + swayX,
    9.4 + swayY,
    player.position.z + velocity.y * 0.2 + 8.6
  )
  const follow = 1 - Math.exp(-3.2 * dt)
  camera.position.lerp(cameraDesired, follow)
  lookTarget.set(player.position.x + velocity.x * 0.35, 0.75, player.position.z + velocity.y * 0.35)
  smoothLook.lerp(lookTarget, 1 - Math.exp(-5 * dt))
  camera.lookAt(smoothLook)

  ground.position.set(player.position.x, 0, player.position.z)
  skyGroup.position.copy(camera.position)
  sky.position.copy(camera.position)
}

/* ------------------------------------------------------------------ *
 * Main loop
 * ------------------------------------------------------------------ */

let lastFrame = performance.now()

function animate(now = performance.now()) {
  requestAnimationFrame(animate)
  const dt = Math.min((now - lastFrame) / 1000, 0.05)
  lastFrame = now
  if (!state.paused) {
    elapsed += dt
    groundUniforms.uTime.value = elapsed
    groundUniforms.uPlayer.value.set(player.position.x, player.position.z)
    skyUniforms.uTime.value = elapsed

    updatePlayer(dt, elapsed)
    updateShards(dt, elapsed)
    updateSpires()
    updateSnow(dt, elapsed)
    updateParticles(dt)
  }
  updateCamera(state.paused ? 0.0001 : dt, elapsed)
  renderer.render(scene, camera)
}

/* ------------------------------------------------------------------ *
 * Resize and boot
 * ------------------------------------------------------------------ */

function resize() {
  const width = window.innerWidth
  const height = window.innerHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

window.addEventListener('resize', resize)
window.addEventListener('orientationchange', () => {
  setTimeout(resize, 120)
  if (tilt.enabled) {
    tilt.beta0 = null
    tilt.gamma0 = null
    tilt.seen = false
  }
})

setSound(el.startSound.checked)
syncTiltControls()
resize()
animate()

window.__chiller = { scene, player, shadow, ground, shards, spires, camera, renderer, THREE }
