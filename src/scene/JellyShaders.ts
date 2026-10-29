import * as THREE from 'three';

export interface RippleImpulse {
  x: number;
  z: number;
  time: number;
  strength: number;
}

export const MAX_RIPPLES = 10;
export const WATER_LEVEL = 1.55;
export const BLOCK_HALF_SIZE = 11.0;
export const BLOCK_BOTTOM_Y = -4.2;

/**
 * Evaluates the exact terrain height of the island/seabed at world (x, z)
 * Block spans x in [-11, 11], z in [-11, 11].
 * North (-Z) and West (-X) form the L-shaped low barrier island (y ~ 1.95 to 2.25).
 * The shoreline curves naturally into a sunlit sandy lagoon and deep ocean basin in the South-East (+X, +Z).
 */
export function evaluateSeabedHeight(x: number, z: number): number {
  // Harbour quay cutout on the East coast (x in [2.2, 9.2], z in [-3.4, -1.2])
  const inHarbourQuay = x > 2.0 && x < 9.4 && z < -1.15 && z > -4.8;
  const inHarbourWater = x > 1.8 && z >= -1.15 && z < 3.5;

  // Curved L-shaped island mask:
  // Back plateau (North, z < -2.2) + West spit (x < -3.2, z < 3.2)
  const curveZ = -1.6 + 1.15 * Math.sin(x * 0.22 + 0.4) - (x > 1.5 ? 0.55 : 0);
  const northMask = THREE.MathUtils.smoothstep(-z, -curveZ - 1.8, -curveZ + 1.3);

  const spitCurveX = -3.8 + 0.9 * Math.cos(z * 0.28);
  const westSpitMask =
    THREE.MathUtils.smoothstep(-x, -spitCurveX - 1.6, -spitCurveX + 1.4) *
    THREE.MathUtils.smoothstep(-z, -5.2, -1.2);

  let landMask = Math.min(1.0, Math.max(northMask, westSpitMask * 0.94));
  if (inHarbourQuay) {
    landMask = Math.max(landMask, 0.96);
  }

  // Gentle coastal dune relief on dry land
  const dunes =
    0.07 * Math.sin(x * 0.45 + 0.3) * Math.cos(z * 0.42) +
    0.035 * Math.cos(x * 0.9 - z * 0.8);

  // Sloped sandy lagoon floor descending from -0.25 near the beach to -2.65 at the front corner
  const distFromShore = Math.max(0, (z - curveZ) * 0.55 + (x + 3.5) * 0.22);
  const basinDepth = THREE.MathUtils.smoothstep(distFromShore, 0, 11.5);

  let height = THREE.MathUtils.lerp(-0.55 - basinDepth * 2.15, 2.08, landMask) + dunes * landMask;

  // Subtle natural sandbar ripples on the seabed
  if (landMask < 0.45) {
    const sandRipples =
      0.06 * Math.sin(x * 1.1 + z * 0.95) +
      0.035 * Math.cos(x * 2.3 - z * 1.8);
    height += sandRipples * (1.0 - landMask);
  }

  // Dredged vertical drop right in front of the harbour quay wall (z >= -1.15)
  if (inHarbourWater) {
    const quayDrop = THREE.MathUtils.smoothstep(z, -1.25, -0.75);
    height = THREE.MathUtils.lerp(height, Math.min(height, -1.35), quayDrop);
  }

  return height;
}

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
  const windFactor = 0.28 + (windSpeed / 25) * 1.15 + (storm ? 0.85 : 0);
  const dampFactor = 1.12 - (damping / 100) * 0.52;
  const amp = 0.052 * windFactor * dampFactor;

  const p1 = x * 0.68 + z * 0.52 - time * 2.35;
  const p2 = x * -0.48 + z * 0.78 - time * 1.85;
  const p3 = x * 1.05 - z * 0.36 - time * 3.1;

  let dy =
    Math.sin(p1) * amp +
    Math.sin(p2) * (amp * 0.65) +
    Math.cos(p3) * (amp * 0.35);

  let ddx =
    Math.cos(p1) * 0.68 * amp +
    Math.cos(p2) * -0.48 * (amp * 0.65) -
    Math.sin(p3) * 1.05 * (amp * 0.35);

  let ddz =
    Math.cos(p1) * 0.52 * amp +
    Math.cos(p2) * 0.78 * (amp * 0.65) +
    Math.sin(p3) * 0.36 * (amp * 0.35);

  for (let i = 0; i < ripples.length; i++) {
    const r = ripples[i];
    const age = time - r.time;
    if (age >= 0 && age < 4.5 && r.strength > 0.001) {
      const dx = x - r.x;
      const dz = z - r.z;
      const dist = Math.sqrt(dx * dx + dz * dz) + 0.001;
      const wavePhase = dist * 3.1 - age * 7.8;
      const envelope = Math.exp(-age * (1.1 + (damping / 100) * 1.2)) * Math.exp(-dist * 0.22);
      const rAmp = r.strength * 0.22 * envelope;
      const s = Math.sin(wavePhase) * rAmp;
      const c = Math.cos(wavePhase) * 3.1 * rAmp;
      dy += s;
      ddx += c * (dx / dist);
      ddz += c * (dz / dist);
    }
  }

  dy += (x * wobbleX + z * wobbleZ) * 0.042;
  ddx += wobbleX * 0.042;
  ddz += wobbleZ * 0.042;

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
    float windFactor = 0.28 + (uWindSpeed / 25.0) * 1.15 + uStorm * 0.85;
    float dampFactor = 1.12 - (uDamping / 100.0) * 0.52;
    float amp = 0.054 * windFactor * dampFactor;

    // Multi-directional Gerstner + capillary surface waves
    float p1 = pos.x * 0.68 + pos.z * 0.52 - uTime * 2.35;
    float p2 = pos.x * -0.48 + pos.z * 0.78 - uTime * 1.85;
    float p3 = pos.x * 1.05 - pos.z * 0.36 - uTime * 3.10;
    float p4 = pos.x * 2.15 + pos.z * 1.85 + uTime * 4.40;
    float p5 = pos.x * -2.60 + pos.z * 2.10 - uTime * 3.80;

    float dy =
      sin(p1) * amp +
      sin(p2) * (amp * 0.65) +
      cos(p3) * (amp * 0.35) +
      sin(p4) * (amp * 0.14) +
      cos(p5) * (amp * 0.10);

    float ddx =
      cos(p1) * 0.68 * amp +
      cos(p2) * -0.48 * (amp * 0.65) -
      sin(p3) * 1.05 * (amp * 0.35) +
      cos(p4) * 2.15 * (amp * 0.14) +
      sin(p5) * 2.60 * (amp * 0.10);

    float ddz =
      cos(p1) * 0.52 * amp +
      cos(p2) * 0.78 * (amp * 0.65) +
      sin(p3) * 0.36 * (amp * 0.35) +
      cos(p4) * 1.85 * (amp * 0.14) -
      sin(p5) * 2.10 * (amp * 0.10);

    float rippleEnergy = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 rip = uRipples[i];
      float age = uTime - rip.z;
      if (age >= 0.0 && age < 4.5 && rip.w > 0.001) {
        vec2 d = pos.xz - rip.xy;
        float dist = length(d) + 0.001;
        float phase = dist * 3.1 - age * 7.8;
        float env = exp(-age * (1.1 + (uDamping / 100.0) * 1.2)) * exp(-dist * 0.22);
        float rAmp = rip.w * 0.22 * env;
        dy += sin(phase) * rAmp;
        float deriv = cos(phase) * 3.1 * rAmp;
        ddx += deriv * (d.x / dist);
        ddz += deriv * (d.y / dist);
        rippleEnergy += abs(sin(phase)) * env * rip.w;
      }
    }

    dy += (pos.x * uWobble.x + pos.z * uWobble.y) * 0.042;
    pos.y += dy;

    // Amplify normal tilt slightly so glassy wave facets sparkle in studio light
    vec3 computedNormal = normalize(vec3(-ddx * 1.65, 1.0, -ddz * 1.65));
    vLocalPos = pos;
    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPosition.xyz;
    vNormal = normalize(mat3(modelMatrix) * computedNormal);
    vWaveHeight = dy;
    vRippleFoam = clamp(rippleEnergy * 1.25, 0.0, 1.0);

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

  float evaluateBed(vec2 xz) {
    bool inHarbourQuay = xz.x > 2.0 && xz.x < 9.4 && xz.y < -1.15 && xz.y > -4.8;
    bool inHarbourWater = xz.x > 1.8 && xz.y >= -1.15 && xz.y < 3.5;

    float curveZ = -1.6 + 1.15 * sin(xz.x * 0.22 + 0.4) - (xz.x > 1.5 ? 0.55 : 0.0);
    float northMask = smoothstep(-curveZ - 1.8, -curveZ + 1.3, -xz.y);
    float spitCurveX = -3.8 + 0.9 * cos(xz.y * 0.28);
    float westSpitMask =
      smoothstep(-spitCurveX - 1.6, -spitCurveX + 1.4, -xz.x) *
      smoothstep(-5.2, -1.2, -xz.y);

    float landMask = min(1.0, max(northMask, westSpitMask * 0.94));
    if (inHarbourQuay) landMask = max(landMask, 0.96);

    float distFromShore = max(0.0, (xz.y - curveZ) * 0.55 + (xz.x + 3.5) * 0.22);
    float basinDepth = smoothstep(0.0, 11.5, distFromShore);
    float h = mix(-0.55 - basinDepth * 2.15, 2.08, landMask);

    if (inHarbourWater) {
      float quayDrop = smoothstep(-1.25, -0.75, xz.y);
      h = mix(h, min(h, -1.35), quayDrop);
    }
    return h;
  }

  void main() {
    float bedY = evaluateBed(vLocalPos.xz);
    float waterDepth = (1.55 + vWaveHeight) - bedY;

    // Smoothly feather out right at the beach waterline so there are zero jagged stair-steps
    if (waterDepth <= 0.002) {
      discard;
    }

    vec3 N = normalize(vNormal);
    // Add micro-capillary wave sparkle to normal
    float micro1 = sin(vLocalPos.x * 5.8 + vLocalPos.z * 4.2 - uTime * 4.5) * 0.035;
    float micro2 = cos(vLocalPos.x * -4.6 + vLocalPos.z * 6.1 + uTime * 3.8) * 0.035;
    N = normalize(N + vec3(micro1, 0.0, micro2));

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunDir);

    float depthFactor = clamp(waterDepth / 3.8, 0.0, 1.0);
    vec3 gelTint = mix(uShallowColor, uDeepColor, pow(depthFactor, 0.85));

    // Glassy Fresnel reflection + dual specular highlights
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    vec3 skyReflect = mix(vec3(0.95, 0.98, 1.0), vec3(0.32, 0.38, 0.48), uStorm);

    vec3 H1 = normalize(L + V);
    float sunSpec = pow(max(dot(N, H1), 0.0), 180.0) * (1.35 - uStorm * 0.6);

    vec3 H2 = normalize(normalize(vec3(0.5, 0.85, 0.45)) + V);
    float studioSpec = pow(max(dot(N, H2), 0.0), 64.0) * 0.42;

    // Crisp white shoreline foam & wave-crest whitecaps
    float shoreLine = smoothstep(0.16, 0.015, waterDepth) * smoothstep(0.0, 0.02, waterDepth);
    float crestWhitecap = smoothstep(0.065, 0.13, vWaveHeight) * 0.35 + vRippleFoam * 0.48;
    float foam = clamp(shoreLine * 0.82 + crestWhitecap, 0.0, 0.92);

    // Crisp glass-cube meniscus edge line ONLY at the outer cut walls of the jelly block
    float edgeDistX = 11.0 - abs(vLocalPos.x);
    float edgeDistZ = 11.0 - abs(vLocalPos.z);
    float outerEdgeDist = min(edgeDistX, edgeDistZ);
    float cubeRimLine = smoothstep(0.09, 0.0, outerEdgeDist) * 0.88;

    // Rocket ignition orange reflection
    vec3 toRocket = uRocketLightPos - vWorldPos;
    float rDist = length(toRocket);
    vec3 rDir = toRocket / (rDist + 0.001);
    float rSpec = pow(max(dot(N, normalize(rDir + V)), 0.0), 42.0) * uRocketLightIntensity * (16.0 / (1.0 + rDist * rDist * 0.14));

    vec3 color = mix(gelTint, skyReflect, fresnel * 0.55);
    color = mix(color, vec3(0.98, 0.99, 1.0), max(foam, cubeRimLine));
    color += uSpecularColor * (sunSpec + studioSpec);
    color += vec3(1.0, 0.58, 0.18) * rSpec;

    // Keep the top jelly surface crystal-clear (alpha 0.24 - 0.42) so the caustic-lit seabed,
    // shadows of the Drone Ship, and swimming marine life underneath are 100% crisp and visible!
    float baseAlpha = mix(0.22, 0.38, depthFactor) * smoothstep(0.0, 0.04, waterDepth);
    float alpha = clamp(baseAlpha + fresnel * 0.28 + foam * 0.65 + cubeRimLine * 0.72 + sunSpec * 0.5, 0.0, 0.95);

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
    float windFactor = 0.28 + (uWindSpeed / 25.0) * 1.15 + uStorm * 0.85;
    float dampFactor = 1.12 - (uDamping / 100.0) * 0.52;
    float amp = 0.054 * windFactor * dampFactor;

    float p1 = pos.x * 0.68 + pos.z * 0.52 - uTime * 2.35;
    float p2 = pos.x * -0.48 + pos.z * 0.78 - uTime * 1.85;
    float p3 = pos.x * 1.05 - pos.z * 0.36 - uTime * 3.10;
    float dy = sin(p1) * amp + sin(p2) * (amp * 0.65) + cos(p3) * (amp * 0.35);

    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 rip = uRipples[i];
      float age = uTime - rip.z;
      if (age >= 0.0 && age < 4.5 && rip.w > 0.001) {
        vec2 d = pos.xz - rip.xy;
        float dist = length(d) + 0.001;
        float phase = dist * 3.1 - age * 7.8;
        float env = exp(-age * (1.1 + (uDamping / 100.0) * 1.2)) * exp(-dist * 0.22);
        dy += sin(phase) * rip.w * 0.22 * env;
      }
    }

    dy += (pos.x * uWobble.x + pos.z * uWobble.y) * 0.042;

    float heightNorm = clamp((pos.y - (-3.2)) / (1.55 - (-3.2)), 0.0, 1.0);
    pos.y += dy * heightNorm;

    pos.x += uWobble.x * heightNorm * 0.24;
    pos.z += uWobble.y * heightNorm * 0.24;

    vLocalPos = pos;
    vTopWaveY = 1.55 + dy;
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
    bool inHarbourQuay = xz.x > 2.0 && xz.x < 9.4 && xz.y < -1.15 && xz.y > -4.8;
    bool inHarbourWater = xz.x > 1.8 && xz.y >= -1.15 && xz.y < 3.5;

    float curveZ = -1.6 + 1.15 * sin(xz.x * 0.22 + 0.4) - (xz.x > 1.5 ? 0.55 : 0.0);
    float northMask = smoothstep(-curveZ - 1.8, -curveZ + 1.3, -xz.y);
    float spitCurveX = -3.8 + 0.9 * cos(xz.y * 0.28);
    float westSpitMask =
      smoothstep(-spitCurveX - 1.6, -spitCurveX + 1.4, -xz.x) *
      smoothstep(-5.2, -1.2, -xz.y);

    float landMask = min(1.0, max(northMask, westSpitMask * 0.94));
    if (inHarbourQuay) landMask = max(landMask, 0.96);

    float distFromShore = max(0.0, (xz.y - curveZ) * 0.55 + (xz.x + 3.5) * 0.22);
    float basinDepth = smoothstep(0.0, 11.5, distFromShore);
    float h = mix(-0.55 - basinDepth * 2.15, 2.08, landMask);

    if (inHarbourWater) {
      float quayDrop = smoothstep(-1.25, -0.75, xz.y);
      h = mix(h, min(h, -1.35), quayDrop);
    }
    return h;
  }

  void main() {
    float bedY = evaluateBed(vLocalPos.xz);
    if (vLocalPos.y < bedY - 0.015 || vLocalPos.y > vTopWaveY + 0.03) {
      discard;
    }

    float depthFromTop = clamp((vTopWaveY - vLocalPos.y) / 4.2, 0.0, 1.0);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 N = normalize(vNormal);

    vec3 col = mix(uShallowColor, uDeepColor, pow(depthFromTop, 0.78));

    // Subtle refracted god-rays streaming down the vertical cut jelly face
    float coord = vLocalPos.x + vLocalPos.z;
    float ray = sin(coord * 2.4 - uTime * 1.5 + vLocalPos.y * 0.6) * 0.5 + 0.5;
    float ray2 = cos(coord * 4.8 + uTime * 1.1 - vLocalPos.y * 0.8) * 0.5 + 0.5;
    float shafts = pow(ray * ray2, 2.2) * (1.0 - depthFromTop * 0.7) * (1.0 - uStorm * 0.5);
    col += uCausticColor * shafts * 0.32;

    // Crisp white specular meniscus along top wave edge, bottom seabed contact, and vertical cube corner
    float topRim = smoothstep(0.075, 0.0, abs(vTopWaveY - vLocalPos.y));
    float bedRim = smoothstep(0.06, 0.0, abs(vLocalPos.y - bedY));
    float cornerDist = min(11.0 - abs(vLocalPos.x), 11.0 - abs(vLocalPos.z));
    float cornerLine = smoothstep(0.10, 0.0, cornerDist);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    float edgeHighlight = max(topRim * 0.9, max(cornerLine * 0.85, bedRim * 0.45));
    col = mix(col, vec3(0.98, 1.0, 1.0), edgeHighlight);
    col += uSpecularColor * fresnel * 0.25;

    float alpha = mix(0.32, 0.54, depthFromTop) + edgeHighlight * 0.42 + fresnel * 0.14;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  }
`;
