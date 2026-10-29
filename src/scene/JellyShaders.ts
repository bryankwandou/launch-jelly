import * as THREE from 'three';

export interface RippleImpulse {
  x: number;
  z: number;
  time: number;
  strength: number;
}

export const MAX_RIPPLES = 10;

/**
 * Evaluates the exact terrain height of the island/seabed at world (x, z)
 * Block spans x in [-11, 11], z in [-11, 11].
 * Water surface rests at y = 1.65.
 * North-West / North region (z < 0.8, or x < -3.2) is elevated island terrain (y ~ 2.15),
 * sloping down into a deep oceanic basin in the South-East (y down to -3.6).
 */
export function evaluateSeabedHeight(x: number, z: number): number {
  // Harbour quay cutout on the East-Central coast
  const inHarbourBasin = x > 1.2 && z > -1.4 && z < 4.5;

  // Main island plateau profile (North & West L-shaped low barrier island)
  const northPlateau = THREE.MathUtils.smoothstep(-z, -1.6, 3.2);
  const westSpit = THREE.MathUtils.smoothstep(-x, 1.8, 5.8) * THREE.MathUtils.smoothstep(-z, -7.5, -1.5);
  const landMask = Math.min(1.0, Math.max(northPlateau, westSpit * 0.92));

  // Subtle dune undulation on the island
  const dunes =
    0.09 * Math.sin(x * 0.42 + 0.5) * Math.cos(z * 0.38) +
    0.04 * Math.cos(x * 0.95 - z * 0.75);

  // Deep ocean trench slope toward South-East (+x, +z)
  const seDist = Math.max(0, (z + 1.5) * 0.58 + (x + 2.5) * 0.32);
  const abyssSlope = THREE.MathUtils.smoothstep(seDist, 0, 12.5);

  let height = THREE.MathUtils.lerp(-3.55, 2.18, landMask) + dunes * landMask;
  height -= abyssSlope * (1.0 - landMask) * 1.15;

  // Underwater coral shelf bumps
  if (landMask < 0.35) {
    const reefBump =
      0.18 * Math.sin(x * 0.85) * Math.cos(z * 0.78) +
      0.11 * Math.sin(x * 1.7 + z * 1.4);
    height += reefBump * (1.0 - landMask);
  }

  // Dredged harbour channel right beside the pier
  if (inHarbourBasin && z > -0.95) {
    height = Math.min(height, -1.35);
  }

  return height;
}

export const WATER_LEVEL = 1.62;
export const BLOCK_HALF_SIZE = 11.0;
export const BLOCK_BOTTOM_Y = -5.6;

/**
 * CPU wave evaluator matching the GLSL shader so vessels pitch, roll, and heave accurately.
 */
export function evaluateJellySurface(
  x: number,
  z: number,
  time: number,
  windSpeed: number,
  storm: boolean,
  damping: number,
  ripples: RippleImpulse[],
  wobbleX: number,
  wobbleZ: number
): { y: number; nx: number; nz: number } {
  const windFactor = 0.35 + (windSpeed / 25) * 1.35 + (storm ? 0.95 : 0);
  const dampFactor = 1.15 - (damping / 100) * 0.55;
  const amp = 0.065 * windFactor * dampFactor;

  const p1 = x * 0.62 + z * 0.48 - time * 2.35;
  const p2 = x * -0.45 + z * 0.74 - time * 1.85;
  const p3 = x * 0.95 - z * 0.32 - time * 3.1;

  let dy =
    Math.sin(p1) * amp +
    Math.sin(p2) * (amp * 0.65) +
    Math.cos(p3) * (amp * 0.35);

  let ddx =
    Math.cos(p1) * 0.62 * amp +
    Math.cos(p2) * -0.45 * (amp * 0.65) -
    Math.sin(p3) * 0.95 * (amp * 0.35);

  let ddz =
    Math.cos(p1) * 0.48 * amp +
    Math.cos(p2) * 0.74 * (amp * 0.65) +
    Math.sin(p3) * 0.32 * (amp * 0.35);

  // Interactive ripples + rocket shockwaves
  for (let i = 0; i < ripples.length; i++) {
    const r = ripples[i];
    const age = time - r.time;
    if (age >= 0 && age < 4.5 && r.strength > 0.001) {
      const dx = x - r.x;
      const dz = z - r.z;
      const dist = Math.sqrt(dx * dx + dz * dz) + 0.001;
      const wavePhase = dist * 2.8 - age * 7.5;
      const envelope = Math.exp(-age * (1.1 + (damping / 100) * 1.2)) * Math.exp(-dist * 0.22);
      const rAmp = r.strength * 0.26 * envelope;
      const s = Math.sin(wavePhase) * rAmp;
      const c = Math.cos(wavePhase) * 2.8 * rAmp;
      dy += s;
      ddx += c * (dx / dist);
      ddz += c * (dz / dist);
    }
  }

  // Elastic block tilt / wobble coupling
  dy += (x * wobbleX + z * wobbleZ) * 0.045;
  ddx += wobbleX * 0.045;
  ddz += wobbleZ * 0.045;

  return {
    y: WATER_LEVEL + dy,
    nx: -ddx,
    nz: -ddz,
  };
}

export const JELLY_SURFACE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uStorm;
  uniform float uDamping;
  uniform vec2 uWobble;
  uniform vec4 uRipples[${MAX_RIPPLES}];

  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying float vWaveHeight;
  varying float vRippleFoam;

  void main() {
    vec3 pos = position;
    float windFactor = 0.35 + (uWindSpeed / 25.0) * 1.35 + uStorm * 0.95;
    float dampFactor = 1.15 - (uDamping / 100.0) * 0.55;
    float amp = 0.068 * windFactor * dampFactor;

    float p1 = pos.x * 0.62 + pos.z * 0.48 - uTime * 2.35;
    float p2 = pos.x * -0.45 + pos.z * 0.74 - uTime * 1.85;
    float p3 = pos.x * 0.95 - pos.z * 0.32 - uTime * 3.10;
    float p4 = pos.x * 1.65 + pos.z * 1.45 + uTime * 4.20;

    float dy = sin(p1) * amp + sin(p2) * (amp * 0.65) + cos(p3) * (amp * 0.35) + sin(p4) * (amp * 0.14);
    float ddx = cos(p1) * 0.62 * amp + cos(p2) * -0.45 * (amp * 0.65) - sin(p3) * 0.95 * (amp * 0.35) + cos(p4) * 1.65 * (amp * 0.14);
    float ddz = cos(p1) * 0.48 * amp + cos(p2) * 0.74 * (amp * 0.65) + sin(p3) * 0.32 * (amp * 0.35) + cos(p4) * 1.45 * (amp * 0.14);

    float rippleEnergy = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 rip = uRipples[i];
      float age = uTime - rip.z;
      if (age >= 0.0 && age < 4.5 && rip.w > 0.001) {
        vec2 d = pos.xz - rip.xy;
        float dist = length(d) + 0.001;
        float phase = dist * 2.8 - age * 7.5;
        float env = exp(-age * (1.1 + (uDamping / 100.0) * 1.2)) * exp(-dist * 0.22);
        float rAmp = rip.w * 0.26 * env;
        dy += sin(phase) * rAmp;
        float deriv = cos(phase) * 2.8 * rAmp;
        ddx += deriv * (d.x / dist);
        ddz += deriv * (d.y / dist);
        rippleEnergy += abs(sin(phase)) * env * rip.w;
      }
    }

    // Soft-body jelly shear and meniscus rim lift at block borders
    float edgeDistX = 11.0 - abs(pos.x);
    float edgeDistZ = 11.0 - abs(pos.z);
    float edgeMin = min(edgeDistX, edgeDistZ);
    float meniscus = smoothstep(0.45, 0.0, edgeMin) * 0.055;

    dy += (pos.x * uWobble.x + pos.z * uWobble.y) * 0.045 + meniscus;
    pos.y += dy;

    vec3 computedNormal = normalize(vec3(-ddx, 1.0, -ddz));
    vLocalPos = pos;
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * computedNormal);
    vWaveHeight = dy;
    vRippleFoam = clamp(rippleEnergy * 1.35, 0.0, 1.0);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const JELLY_SURFACE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform vec3 uCausticColor;
  uniform vec3 uSpecularColor;
  uniform vec3 uSunDir;
  uniform float uStorm;
  uniform vec3 uRocketLightPos;
  uniform float uRocketLightIntensity;

  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying float vWaveHeight;
  varying float vRippleFoam;

  // Procedural Voronoi/cellular caustic pattern
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float causticLayer(vec2 uv, float t) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    float minDist = 1.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        float h = hash21(i + neighbor);
        vec2 pt = neighbor + 0.5 + 0.42 * sin(t * 1.6 + 6.2831 * h + vec2(0.0, 1.57));
        float d = length(f - pt);
        minDist = min(minDist, d);
      }
    }
    return pow(clamp(1.0 - minDist * 1.15, 0.0, 1.0), 3.2);
  }

  float evaluateBed(vec2 xz) {
    float northPlateau = smoothstep(-1.6, 3.2, -xz.y);
    float westSpit = smoothstep(1.8, 5.8, -xz.x) * smoothstep(-7.5, -1.5, -xz.y);
    float landMask = min(1.0, max(northPlateau, westSpit * 0.92));
    float seDist = max(0.0, (xz.y + 1.5) * 0.58 + (xz.x + 2.5) * 0.32);
    float abyssSlope = smoothstep(0.0, 12.5, seDist);
    float h = mix(-3.55, 2.18, landMask) - abyssSlope * (1.0 - landMask) * 1.15;
    if (xz.x > 1.2 && xz.y > -0.95 && xz.y < 4.5) {
      h = min(h, -1.35);
    }
    return h;
  }

  void main() {
    float bedY = evaluateBed(vLocalPos.xz);
    float waterDepth = (1.62 + vWaveHeight) - bedY;

    // Discard pixels strictly inside dry elevated island terrain
    if (waterDepth < -0.02) {
      discard;
    }

    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunDir);

    // Volumetric Beer-Lambert depth factor
    float depthFactor = clamp(waterDepth / 4.8, 0.0, 1.0);
    vec3 baseJelly = mix(uShallowColor, uDeepColor, pow(depthFactor, 0.78));

    // Refracted dual-scale caustics projected onto the shallow/mid seabed
    vec2 refractedUV = vLocalPos.xz * 0.72 + N.xz * (0.45 + waterDepth * 0.18);
    float c1 = causticLayer(refractedUV * 1.15 + vec2(uTime * 0.12, -uTime * 0.09), uTime);
    float c2 = causticLayer(refractedUV * 1.65 - vec2(uTime * 0.08, uTime * 0.14), uTime * 1.2);
    float caustics = (c1 * 0.65 + c2 * 0.55) * (1.0 - smoothstep(0.2, 5.2, waterDepth)) * (1.0 - uStorm * 0.55);

    baseJelly += uCausticColor * caustics * 0.52;

    // Fresnel & crisp studio reflection
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.6);
    vec3 skyTint = mix(vec3(0.96, 0.97, 0.99), vec3(0.28, 0.34, 0.44), uStorm);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 140.0) * (1.15 - uStorm * 0.65);
    float rimSpec = pow(max(dot(N, normalize(vec3(-0.6, 0.8, -0.5) + V)), 0.0), 48.0) * 0.35;

    // Shoreline foam & interactive wave crest foam
    float shoreFoam = smoothstep(0.26, 0.0, waterDepth) * (0.65 + 0.35 * sin(vLocalPos.x * 3.0 + vLocalPos.z * 3.0 + uTime * 3.5));
    float crestFoam = smoothstep(0.085, 0.18, vWaveHeight) * 0.45 + vRippleFoam * 0.55;
    float foamMask = clamp(shoreFoam + crestFoam, 0.0, 0.92);

    // Cut-block bevel highlight around outer edges of the jelly cube
    float edgeDist = min(11.0 - abs(vLocalPos.x), 11.0 - abs(vLocalPos.z));
    float bevelGlow = smoothstep(0.22, 0.0, edgeDist) * 0.42;

    // Rocket ignition point-light reflection on the jelly surface
    vec3 toRocket = uRocketLightPos - vWorldPos;
    float rDist = length(toRocket);
    vec3 rDir = toRocket / (rDist + 0.001);
    vec3 rHalf = normalize(rDir + V);
    float rSpec = pow(max(dot(N, rHalf), 0.0), 36.0) * uRocketLightIntensity * (18.0 / (1.0 + rDist * rDist * 0.14));
    float rDiff = max(dot(N, rDir), 0.0) * uRocketLightIntensity * (8.0 / (1.0 + rDist * rDist * 0.18));

    vec3 color = mix(baseJelly, skyTint, fresnel * 0.48);
    color = mix(color, vec3(0.97, 0.99, 1.0), foamMask);
    color += uSpecularColor * (spec + rimSpec + bevelGlow);
    color += vec3(1.0, 0.58, 0.18) * (rSpec + rDiff * 0.45);

    // Translucent alpha so real 3D seabed, corals, fish, and rock walls beneath show through!
    float alpha = mix(0.58, 0.86, pow(depthFactor, 0.65));
    alpha = max(alpha, foamMask * 0.92 + fresnel * 0.35);

    gl_FragColor = vec4(color, alpha);
  }
`;

export const JELLY_WALL_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uStorm;
  uniform float uDamping;
  uniform vec2 uWobble;
  uniform vec4 uRipples[${MAX_RIPPLES}];

  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vTopWaveY;

  void main() {
    vec3 pos = position;
    float windFactor = 0.35 + (uWindSpeed / 25.0) * 1.35 + uStorm * 0.95;
    float dampFactor = 1.15 - (uDamping / 100.0) * 0.55;
    float amp = 0.068 * windFactor * dampFactor;

    float p1 = pos.x * 0.62 + pos.z * 0.48 - uTime * 2.35;
    float p2 = pos.x * -0.45 + pos.z * 0.74 - uTime * 1.85;
    float p3 = pos.x * 0.95 - pos.z * 0.32 - uTime * 3.10;
    float dy = sin(p1) * amp + sin(p2) * (amp * 0.65) + cos(p3) * (amp * 0.35);

    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 rip = uRipples[i];
      float age = uTime - rip.z;
      if (age >= 0.0 && age < 4.5 && rip.w > 0.001) {
        vec2 d = pos.xz - rip.xy;
        float dist = length(d) + 0.001;
        float phase = dist * 2.8 - age * 7.5;
        float env = exp(-age * (1.1 + (uDamping / 100.0) * 1.2)) * exp(-dist * 0.22);
        dy += sin(phase) * rip.w * 0.26 * env;
      }
    }

    dy += (pos.x * uWobble.x + pos.z * uWobble.y) * 0.045;

    // Scale top vertices of the wall to match the exact wave height at WATER_LEVEL (1.62)
    float heightNorm = clamp((pos.y - (-3.8)) / (1.62 - (-3.8)), 0.0, 1.0);
    pos.y += dy * heightNorm;

    // Elastic horizontal wobble shear along the vertical wall
    pos.x += uWobble.x * heightNorm * 0.28;
    pos.z += uWobble.y * heightNorm * 0.28;

    vLocalPos = pos;
    vTopWaveY = 1.62 + dy;
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const JELLY_WALL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform vec3 uCausticColor;
  uniform vec3 uSpecularColor;
  uniform float uStorm;

  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vTopWaveY;

  float evaluateBed(vec2 xz) {
    float northPlateau = smoothstep(-1.6, 3.2, -xz.y);
    float westSpit = smoothstep(1.8, 5.8, -xz.x) * smoothstep(-7.5, -1.5, -xz.y);
    float landMask = min(1.0, max(northPlateau, westSpit * 0.92));
    float seDist = max(0.0, (xz.y + 1.5) * 0.58 + (xz.x + 2.5) * 0.32);
    float abyssSlope = smoothstep(0.0, 12.5, seDist);
    float h = mix(-3.55, 2.18, landMask) - abyssSlope * (1.0 - landMask) * 1.15;
    if (xz.x > 1.2 && xz.y > -0.95 && xz.y < 4.5) {
      h = min(h, -1.35);
    }
    return h;
  }

  void main() {
    float bedY = evaluateBed(vLocalPos.xz);
    // Only render the jelly wall where y is ABOVE the sloped rock seabed and BELOW the wave top
    if (vLocalPos.y < bedY - 0.03 || vLocalPos.y > vTopWaveY + 0.05) {
      discard;
    }

    float depthFromTop = clamp((vTopWaveY - vLocalPos.y) / 5.2, 0.0, 1.0);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 N = normalize(vNormal);

    vec3 col = mix(uShallowColor, uDeepColor, pow(depthFromTop, 0.82));

    // Volumetric light rays (god rays) streaming down the sliced jelly wall
    float coord = vLocalPos.x + vLocalPos.z;
    float ray1 = sin(coord * 1.4 - uTime * 1.2 + vLocalPos.y * 0.35) * 0.5 + 0.5;
    float ray2 = sin(coord * 2.9 + uTime * 0.85 - vLocalPos.y * 0.5) * 0.5 + 0.5;
    float shafts = pow(ray1 * ray2, 2.4) * (1.0 - depthFromTop * 0.75) * (1.0 - uStorm * 0.5);
    col += uCausticColor * shafts * 0.38;

    // Crisp top meniscus line & vertical corner refraction highlight
    float topRim = smoothstep(0.12, 0.0, abs(vTopWaveY - vLocalPos.y));
    float cornerDist = min(11.0 - abs(vLocalPos.x), 11.0 - abs(vLocalPos.z));
    float cornerHighlight = smoothstep(0.18, 0.0, cornerDist);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.8);
    col += uSpecularColor * (topRim * 0.55 + cornerHighlight * 0.4 + fresnel * 0.22);

    float alpha = mix(0.46, 0.74, depthFromTop) + topRim * 0.2 + cornerHighlight * 0.15;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
  }
`;
