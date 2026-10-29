export const BLOCK_HALF_SIZE = 11.0;
export const BLOCK_HALF_X = 11.0;
export const BLOCK_HALF_Z = 11.0;
export const BLOCK_BOTTOM_Y = -2.25;
export const WATER_LEVEL = 1.55;
export const MAX_RIPPLES = 8;

export interface RippleImpulse {
  x: number;
  z: number;
  time: number;
  strength: number;
}

/**
 * Shared terrain & seabed elevation profile matching the reference diorama:
 * - Main spaceport landmass across the rear (z < -1.8)
 * - Curved sandy spit/peninsula extending forward along the left edge (x < -6.8, forward to z ~ +4.6)
 * - Harbour concrete quay shelf on the right (x > 2.4, z < -0.6)
 * - Smooth, gradual lagoon seabed slope from the beach down toward the front-right deep corner
 */
export function evaluateSeabedHeight(x: number, z: number): number {
  const coastCurve =
    -1.85 +
    Math.sin(x * 0.24 + 0.5) * 0.68 +
    Math.cos(x * 0.45) * 0.28;

  // Left peninsula spit extending along x near -11.0 forward to z ~ +4.6
  const leftSpitInfluence =
    Math.max(0, 1 - (x + BLOCK_HALF_SIZE) / 4.8) *
    Math.max(0, 1 - Math.max(0, z - 4.4) / 5.6);
  const effectiveCoastZ = coastCurve + leftSpitInfluence * 5.8;

  // Harbour industrial concrete shelf on the right
  if (x > 2.4 && z < -0.6 && z > -4.6) {
    return 1.88;
  }

  const distFromShore = z - effectiveCoastZ;
  if (distFromShore <= 0) {
    const inlandT = Math.min(1, -distFromShore / 2.4);
    const undulation =
      Math.sin(x * 0.30) * Math.cos(z * 0.34) * 0.065 +
      Math.sin((x - z) * 0.52) * 0.025;
    return 1.62 + inlandT * 0.32 + undulation * (0.35 + 0.65 * inlandT);
  }

  // Smooth beach slope into shallow shelf and then gradual deep lagoon slope
  const shallowDrop = 1.0 - Math.exp(-distFromShore * 0.42);
  const crossSlope = ((x + BLOCK_HALF_SIZE) / (2 * BLOCK_HALF_SIZE)) * 0.66;
  const forwardSlope = Math.max(0, (z + 1.8) / 12.8) * 0.74;
  const ripples =
    Math.sin(x * 0.48 + z * 0.38) * 0.048 +
    Math.cos(x * 0.88 - z * 0.68) * 0.026;

  const rawSeabed =
    1.58 -
    shallowDrop * 1.26 -
    forwardSlope * 0.82 -
    crossSlope * (0.26 + 0.74 * Math.min(1, distFromShore / 3.8)) +
    ripples;

  return Math.max(-1.35, Math.min(1.62, rawSeabed));
}

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
  const sampleH = (sx: number, sz: number): number => {
    const stormBoost = storm ? 1.85 : 1.0;
    const windAmp = (0.016 + (windSpeed / 25) * 0.068) * stormBoost;

    let h =
      Math.sin(sx * 0.48 + time * 2.05) * windAmp +
      Math.cos(sz * 0.54 - time * 1.75) * windAmp * 0.82 +
      Math.sin((sx + sz) * 0.36 + time * 2.55) * windAmp * 0.52 +
      Math.cos((sx * 0.7 - sz * 0.5) + time * 3.1) * windAmp * 0.28;

    h += (sx * wobbleX + sz * wobbleZ) * 0.026;

    const dampRate = 0.65 + (damping / 100) * 1.85;
    for (let i = 0; i < ripples.length; i++) {
      const r = ripples[i];
      const age = time - r.time;
      if (age >= 0 && age < 6.0 && r.strength > 0.001) {
        const dist = Math.hypot(sx - r.x, sz - r.z);
        const front = age * 4.4;
        const env = Math.exp(-age * dampRate) * Math.exp(-Math.abs(dist - front) * 0.62);
        h += Math.sin(dist * 3.2 - age * 11.5) * r.strength * 0.16 * env;
      }
    }

    return WATER_LEVEL + h;
  };

  const eps = 0.18;
  const hc = sampleH(x, z);
  const hx = sampleH(x + eps, z);
  const hz = sampleH(x, z + eps);

  return {
    y: hc,
    nx: -(hx - hc) / eps,
    nz: -(hz - hc) / eps,
  };
}

const JELLY_SHARED_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWindSpeed;
uniform float uStorm;
uniform float uDamping;
uniform vec2 uWobble;
uniform vec4 uRipples[8];
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uCausticColor;
uniform vec3 uSpecularColor;
uniform vec3 uSunDir;
uniform vec3 uRocketLightPos;
uniform float uRocketLightIntensity;

float seabedHeightAt(vec2 xz) {
  float coastCurve =
    -1.85 +
    sin(xz.x * 0.24 + 0.5) * 0.68 +
    cos(xz.x * 0.45) * 0.28;

  float leftSpitInfluence =
    clamp(1.0 - (xz.x + 11.0) / 4.8, 0.0, 1.0) *
    clamp(1.0 - max(0.0, xz.y - 4.4) / 5.6, 0.0, 1.0);
  float effectiveCoastZ = coastCurve + leftSpitInfluence * 5.8;

  if (xz.x > 2.4 && xz.y < -0.6 && xz.y > -4.6) {
    return 1.88;
  }

  float distFromShore = xz.y - effectiveCoastZ;
  if (distFromShore <= 0.0) {
    float inlandT = clamp(-distFromShore / 2.4, 0.0, 1.0);
    float undulation =
      sin(xz.x * 0.30) * cos(xz.y * 0.34) * 0.065 +
      sin((xz.x - xz.y) * 0.52) * 0.025;
    return 1.62 + inlandT * 0.32 + undulation * (0.35 + 0.65 * inlandT);
  }

  float shallowDrop = 1.0 - exp(-distFromShore * 0.42);
  float crossSlope = ((xz.x + 11.0) / 22.0) * 0.66;
  float forwardSlope = max(0.0, (xz.y + 1.8) / 12.8) * 0.74;
  float ripples =
    sin(xz.x * 0.48 + xz.y * 0.38) * 0.048 +
    cos(xz.x * 0.88 - xz.y * 0.68) * 0.026;

  float rawSeabed =
    1.58 -
    shallowDrop * 1.26 -
    forwardSlope * 0.82 -
    crossSlope * (0.26 + 0.74 * clamp(distFromShore / 3.8, 0.0, 1.0)) +
    ripples;

  return clamp(rawSeabed, -1.35, 1.62);
}

float jellyWaveAt(vec2 xz) {
  float stormBoost = mix(1.0, 1.85, uStorm);
  float windAmp = (0.016 + (uWindSpeed / 25.0) * 0.068) * stormBoost;

  float h =
    sin(xz.x * 0.48 + uTime * 2.05) * windAmp +
    cos(xz.y * 0.54 - uTime * 1.75) * windAmp * 0.82 +
    sin((xz.x + xz.y) * 0.36 + uTime * 2.55) * windAmp * 0.52 +
    cos((xz.x * 0.7 - xz.y * 0.5) + uTime * 3.1) * windAmp * 0.28;

  h += (xz.x * uWobble.x + xz.y * uWobble.y) * 0.026;

  float dampRate = 0.65 + (uDamping / 100.0) * 1.85;
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (age >= 0.0 && age < 6.0 && r.w > 0.001) {
      float dist = length(xz - r.xy);
      float front = age * 4.4;
      float env = exp(-age * dampRate) * exp(-abs(dist - front) * 0.62);
      h += sin(dist * 3.2 - age * 11.5) * r.w * 0.16 * env;
    }
  }

  return 1.55 + h;
}
`;

export const JELLY_SURFACE_VERTEX = /* glsl */ `
${JELLY_SHARED_GLSL}

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vSeabedY;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;

  float eps = 0.16;
  float hc = jellyWaveAt(pos.xz);
  float hx = jellyWaveAt(pos.xz + vec2(eps, 0.0));
  float hz = jellyWaveAt(pos.xz + vec2(0.0, eps));

  pos.y = hc;
  pos.x += uWobble.x * 0.14;
  pos.z += uWobble.y * 0.14;

  vec3 n = normalize(vec3(-(hx - hc) / eps, 1.0, -(hz - hc) / eps));
  vSeabedY = seabedHeightAt(position.xz);

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * n);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const JELLY_SURFACE_FRAGMENT = /* glsl */ `
${JELLY_SHARED_GLSL}

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vSeabedY;
varying vec2 vUv;

void main() {
  float waterDepth = vWorldPos.y - vSeabedY;
  if (waterDepth < -0.015) {
    discard;
  }

  vec2 p = vWorldPos.xz;
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);

  // Subtle glossy micro-facets on the top gel surface
  float nX =
    cos(p.x * 1.45 + p.y * 0.95 + uTime * 2.1) * 0.016 +
    sin(p.x * 2.7 - p.y * 2.2 - uTime * 1.6) * 0.009;
  float nZ =
    sin(p.y * 1.55 - p.x * 0.85 - uTime * 1.8) * 0.016 +
    cos(p.x * 2.4 + p.y * 2.6 + uTime * 2.3) * 0.009;
  vec3 N = normalize(vWorldNormal + vec3(nX, 0.0, nZ));
  vec3 H = normalize(L + V);

  float NdotV = max(dot(N, V), 0.001);
  float fresnel = 0.03 + 0.97 * pow(1.0 - NdotV, 4.2);

  float depthNorm = clamp(waterDepth / 2.75, 0.0, 1.0);
  vec3 bodyColor = mix(uShallowColor, uDeepColor, pow(depthNorm, 0.78));

  // Studio sky reflection & crisp specular glints
  vec3 skyReflect = mix(vec3(0.92, 0.98, 0.96), vec3(1.0), clamp(N.y, 0.0, 1.0));
  float specTight = pow(max(dot(N, H), 0.0), 190.0) * 0.85;
  float specBroad = pow(max(dot(N, H), 0.0), 28.0) * 0.14;

  // Shoreline foam ribbon where jelly meets sand beach or harbour quay
  float shoreFoam = smoothstep(0.24, 0.0, waterDepth) * (0.46 + 0.16 * sin(p.x * 2.4 + uTime * 3.0));

  // Parallel white wave crest lines rolling gently near the harbour/beach (matching reference video)
  float wavePhase = fract(p.y * 0.38 + uTime * 0.30 + sin(p.x * 0.18) * 0.10);
  float crestLine =
    smoothstep(0.026, 0.0, abs(wavePhase - 0.5)) *
    smoothstep(0.25, 1.1, waterDepth) *
    smoothstep(6.2, -1.5, p.y) *
    smoothstep(-1.5, 4.2, p.x) * 0.36;

  // Crisp white refractive rim line around the cut edges of the jelly cube
  float edgeDist = 11.0 - max(abs(p.x), abs(p.y));
  float rimLine = smoothstep(0.18, 0.0, edgeDist) * 0.82 + smoothstep(0.50, 0.0, edgeDist) * 0.16;

  // Rocket exhaust glow on the water during ignition/landing
  float rocketDist = length(vWorldPos - uRocketLightPos);
  vec3 rocketGlow = vec3(1.0, 0.58, 0.2) * (uRocketLightIntensity / (1.0 + rocketDist * rocketDist * 0.18));

  vec3 finalColor = mix(bodyColor, skyReflect, fresnel * 0.42);
  finalColor += uSpecularColor * (specTight + specBroad) + rocketGlow * 0.35;
  finalColor = mix(finalColor, vec3(0.98, 1.0, 0.99), clamp(shoreFoam + crestLine + rimLine, 0.0, 0.92));

  if (uStorm > 0.01) {
    finalColor = mix(finalColor, finalColor * vec3(0.55, 0.66, 0.78), uStorm * 0.5);
  }

  // Crystal-clear top surface so the sunlit mint seabed, corals, sharks, and underwater shadows shine through clearly
  float alpha = clamp(
    0.11 + depthNorm * 0.07 + fresnel * 0.20 + shoreFoam * 0.30 + crestLine * 0.26 + rimLine * 0.56 + specTight * 0.38,
    0.11,
    0.84
  );
  gl_FragColor = vec4(finalColor, alpha);
}
`;

export const JELLY_WALL_VERTEX = /* glsl */ `
${JELLY_SHARED_GLSL}

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vHeightFrac;
varying float vWaterColumn;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;

  float topFactor = clamp(uv.y, 0.0, 1.0);
  float topY = jellyWaveAt(pos.xz);
  // Bottom of the jelly wall tracks the sloped seabed so the limestone cross-section below is unobstructed
  float seabedY = clamp(seabedHeightAt(pos.xz), -1.95, topY + 0.08);

  vHeightFrac = topFactor;
  vWaterColumn = max(0.0, topY - seabedY);

  pos.y = mix(seabedY, topY, topFactor);
  pos.x += uWobble.x * 0.14 * topFactor;
  pos.z += uWobble.y * 0.14 * topFactor;

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const JELLY_WALL_FRAGMENT = /* glsl */ `
${JELLY_SHARED_GLSL}

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vHeightFrac;
varying float vWaterColumn;
varying vec2 vUv;

void main() {
  if (vWaterColumn < 0.03) {
    discard;
  }

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);

  float NdotV = max(abs(dot(N, V)), 0.001);
  float fresnel = 0.05 + 0.95 * pow(1.0 - NdotV, 3.2);

  // Smooth depth gradient inside the vertical cut jelly wall
  float depthRatio = clamp(1.0 - vHeightFrac, 0.0, 1.0);
  vec3 wallColor = mix(uShallowColor * 1.04, uDeepColor * 0.90, pow(depthRatio, 0.85));

  // Rich emerald-teal refractive meniscus band right where the jelly sits on the sloped limestone seabed
  float seabedContactBand = smoothstep(0.16, 0.0, vHeightFrac);
  vec3 seabedRimColor = uDeepColor * vec3(0.42, 0.68, 0.56);
  wallColor = mix(wallColor, seabedRimColor, seabedContactBand * 0.68);

  // Subtle vertical internal light shafts inside the cut block face
  float coord = abs(N.x) > 0.5 ? vWorldPos.z : vWorldPos.x;
  float lightShaft = 0.5 + 0.5 * sin(coord * 0.85 + uTime * 1.4);
  wallColor += uCausticColor * lightShaft * vHeightFrac * 0.08;

  // Specular sheen on the cut jelly face
  float spec = pow(max(dot(N, H), 0.0), 96.0) * 0.42;
  wallColor += uSpecularColor * spec;

  // Crisp white top wave meniscus & vertical corner edge lines
  float topEdge = smoothstep(0.955, 1.0, vHeightFrac);
  float sideCorner = smoothstep(0.016, 0.0, min(vUv.x, 1.0 - vUv.x));
  float rimHighlight = clamp(topEdge * 0.82 + sideCorner * 0.72, 0.0, 1.0);

  wallColor = mix(wallColor, vec3(0.98, 1.0, 0.99), rimHighlight * 0.86);

  if (uStorm > 0.01) {
    wallColor = mix(wallColor, wallColor * vec3(0.55, 0.66, 0.78), uStorm * 0.5);
  }

  float alpha = clamp(
    0.34 + depthRatio * 0.16 + seabedContactBand * 0.24 + fresnel * 0.18 + rimHighlight * 0.42,
    0.32,
    0.88
  );
  gl_FragColor = vec4(wallColor, alpha);
}
`;
