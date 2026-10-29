import * as THREE from 'three';
import { SCENE_PALETTE } from '../config/designTokens';
import {
  BLOCK_BOTTOM_Y,
  BLOCK_HALF_SIZE,
  WATER_LEVEL,
  evaluateSeabedHeight,
} from './JellyShaders';

export interface AnimatedIslandHandles {
  hangarDoorLeft: THREE.Mesh;
  hangarDoorRight: THREE.Mesh;
  radarDish: THREE.Group;
  windSockPivot: THREE.Group;
  windSockCone: THREE.Mesh;
  craneTurret: THREE.Group;
  craneBoomPivot: THREE.Group;
  craneCable: THREE.Mesh;
  craneSpreader: THREE.Group;
  scoreboardCanvas: HTMLCanvasElement;
  scoreboardCtx: CanvasRenderingContext2D;
  scoreboardTexture: THREE.CanvasTexture;
  landingPadRingMat: THREE.MeshBasicMaterial;
  landingPadTargetMesh: THREE.Mesh;
  palmCrowns: THREE.Group[];
  kelpStrands: THREE.Mesh[];
  swimmers: {
    mesh: THREE.Group;
    centerX: number;
    centerZ: number;
    radiusX: number;
    radiusZ: number;
    speed: number;
    phase: number;
    y: number;
  }[];
  seagulls: {
    group: THREE.Group;
    wingL: THREE.Mesh;
    wingR: THREE.Mesh;
    cx: number;
    cz: number;
    rx: number;
    rz: number;
    y: number;
    speed: number;
    phase: number;
  }[];
  seabedUniforms: {
    uTime: { value: number };
    uStorm: { value: number };
    uShallowColor: { value: THREE.Color };
    uDeepColor: { value: THREE.Color };
    uCausticColor: { value: THREE.Color };
  };
}

export const HANGAR_WORLD_X = -3.8;
export const PAD_WORLD_X = 1.6;
export const PAD_WORLD_Z = -6.0;
export const LZ_WORLD_X = -3.6;
export const LZ_WORLD_Z = -2.2;

function fractHash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function buildIslandAndSeabed(
  root: THREE.Group,
  shallowColor: THREE.Color,
  deepColor: THREE.Color,
  causticColor: THREE.Color
): AnimatedIslandHandles {
  const segs = 160;
  const size = BLOCK_HALF_SIZE * 2;

  const seabedUniforms = {
    uTime: { value: 0 },
    uStorm: { value: 0 },
    uShallowColor: { value: shallowColor },
    uDeepColor: { value: deepColor },
    uCausticColor: { value: causticColor },
  };

  // 1. TOP TERRAIN & SLOPED LAGOON SEABED MESH
  const topGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  topGeo.rotateX(-Math.PI / 2);

  const posAttr = topGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const cDrySand = new THREE.Color(0xf2ede2);
  const cWarmSand = new THREE.Color(0xe7dfd0);
  const cSeabedSand = new THREE.Color(0xf4efe4);
  const cConcrete = new THREE.Color(0xd5d7d2);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const h = evaluateSeabedHeight(x, z);
    posAttr.setY(i, h);

    if (x > 2.4 && z < -0.6 && z > -4.6) {
      tmpColor.copy(cConcrete);
    } else if (h < WATER_LEVEL - 0.04) {
      tmpColor.copy(cSeabedSand);
    } else if (h < WATER_LEVEL + 0.14) {
      tmpColor.copy(cWarmSand).lerp(cDrySand, Math.min(1, (h - (WATER_LEVEL - 0.04)) / 0.18));
    } else {
      const grain = Math.sin(x * 0.9 + z * 0.7) * 0.5 + 0.5;
      tmpColor.copy(cDrySand).lerp(cWarmSand, grain * 0.25);
    }

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  topGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  topGeo.computeVertexNormals();

  const topMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.02,
  });

  topMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = seabedUniforms.uTime;
    shader.uniforms.uStorm = seabedUniforms.uStorm;
    shader.uniforms.uShallowColor = seabedUniforms.uShallowColor;
    shader.uniforms.uDeepColor = seabedUniforms.uDeepColor;
    shader.uniforms.uCausticColor = seabedUniforms.uCausticColor;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vSeabedWorldPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vSeabedWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uStorm;
      uniform vec3 uShallowColor;
      uniform vec3 uDeepColor;
      uniform vec3 uCausticColor;
      varying vec3 vSeabedWorldPos;

      float softCausticPattern(vec2 p, float t) {
        vec2 w = p + vec2(
          sin(p.y * 0.55 + t * 1.1) * 0.35,
          cos(p.x * 0.50 - t * 0.95) * 0.35
        );
        float c1 = sin(w.x * 1.35 + sin(w.y * 1.15 + t * 1.2));
        float c2 = cos(w.y * 1.45 - cos(w.x * 1.25 - t * 1.05));
        float c3 = sin((w.x + w.y) * 1.10 + t * 0.85);
        return clamp((c1 + c2 + c3) * 0.333 * 0.5 + 0.5, 0.0, 1.0);
      }`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `float submergence = ${WATER_LEVEL.toFixed(2)} - vSeabedWorldPos.y;
      if (submergence > 0.0) {
        float depthNorm = clamp(submergence / 2.85, 0.0, 1.0);
        float shoreBlend = smoothstep(0.0, 0.16, submergence);

        // Luminous sunlit jelly absorption over bright coral sand (adapts to Lime / Curacao / Blackcurrant)
        vec3 shallowTint = mix(vec3(0.92, 0.95, 0.92), uShallowColor, 0.72);
        vec3 deepTint = mix(uShallowColor * 0.85, uDeepColor, 0.62);
        vec3 jellyBedTint = mix(shallowTint, deepTint, pow(depthNorm, 0.72));

        // Preserve directional shadows cast by Drone Ship, Tugboat, Fairing Boat, and Sharks
        float luma = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        float shadowPresence = clamp(luma / 0.72, 0.28, 1.08);

        vec3 underwaterSand = mix(outgoingLight, jellyBedTint * shadowPresence, shoreBlend * (0.64 + depthNorm * 0.24));

        // Soft, organic dappled sunlight caustics (no harsh wireframe grid)
        float dappleA = softCausticPattern(vSeabedWorldPos.xz * 0.85, uTime);
        float dappleB = softCausticPattern(vSeabedWorldPos.xz * 1.45 + vec2(3.7, -2.1), uTime * 0.85);
        float causticGlow = smoothstep(0.45, 0.88, dappleA * 0.6 + dappleB * 0.4);
        underwaterSand += uCausticColor * causticGlow * shoreBlend * (1.0 - depthNorm * 0.38) * 0.085 * shadowPresence;

        if (uStorm > 0.01) {
          underwaterSand *= mix(vec3(1.0), vec3(0.58, 0.68, 0.78), uStorm * 0.5);
        }
        outgoingLight = underwaterSand;
      }
      #include <dithering_fragment>`
    );
  };

  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.receiveShadow = true;
  topMesh.castShadow = false;
  root.add(topMesh);

  // 2. GEOLOGICAL CROSS-SECTION WALLS ON ALL 4 SIDES + EMBEDDED SEDIMENT PEBBLES
  const buildCrossSectionWall = (
    sampleFn: (u: number) => { x: number; z: number; nx: number; nz: number }
  ) => {
    const vRows = 28;
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];
    const wallColors: number[] = [];
    const indices: number[] = [];

    const cLimestone = new THREE.Color(0xf0ece1);
    const cLimestoneLower = new THREE.Color(0xe4ddd0);
    const cMossRim = new THREE.Color(0x28684c);
    const cStrataTan = new THREE.Color(0xd2bfa4);
    const cStrataPeach = new THREE.Color(0xcca58c);
    const cStrataGrey = new THREE.Color(0x7c756d);

    for (let ix = 0; ix <= segs; ix++) {
      const u = ix / segs;
      const { x, z, nx, nz } = sampleFn(u);
      const topY = evaluateSeabedHeight(x, z);
      const isSubmergedTop = topY < WATER_LEVEL - 0.04;

      for (let iy = 0; iy <= vRows; iy++) {
        const v = iy / vRows;
        const y = BLOCK_BOTTOM_Y + (topY - BLOCK_BOTTOM_Y) * v;
        positions.push(x, y, z);
        normals.push(nx, 0, nz);

        const waveShift = Math.sin(x * 0.35 + z * 0.35) * 0.08;
        const yRel = y - BLOCK_BOTTOM_Y + waveShift;
        const c = new THREE.Color();

        if (isSubmergedTop && v > 0.87) {
          const rimT = (v - 0.87) / 0.13;
          c.copy(cLimestone).lerp(cMossRim, Math.min(1, rimT * 1.15));
        } else if (yRel > 0.92) {
          c.copy(cLimestoneLower).lerp(cLimestone, Math.min(1, (yRel - 0.92) / 1.2));
        } else if (yRel > 0.56) {
          c.copy(cStrataTan).lerp(cLimestoneLower, (yRel - 0.56) / 0.36);
        } else if (yRel > 0.28) {
          c.copy(cStrataPeach).lerp(cStrataTan, (yRel - 0.28) / 0.28);
        } else {
          c.copy(cStrataGrey).lerp(cStrataPeach, Math.max(0, yRel / 0.28));
        }

        wallColors.push(c.r, c.g, c.b);
      }
    }

    for (let ix = 0; ix < segs; ix++) {
      for (let iy = 0; iy < vRows; iy++) {
        const a = ix * (vRows + 1) + iy;
        const b = (ix + 1) * (vRows + 1) + iy;
        const c = (ix + 1) * (vRows + 1) + (iy + 1);
        const d = ix * (vRows + 1) + (iy + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(wallColors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'block_side_wall';
    root.add(mesh);
  };

  // Front, Back, Left, Right geological cross-section walls
  buildCrossSectionWall((u) => ({
    x: -BLOCK_HALF_SIZE + u * size,
    z: BLOCK_HALF_SIZE,
    nx: 0,
    nz: 1,
  }));
  buildCrossSectionWall((u) => ({
    x: BLOCK_HALF_SIZE - u * size,
    z: -BLOCK_HALF_SIZE,
    nx: 0,
    nz: -1,
  }));
  buildCrossSectionWall((u) => ({
    x: -BLOCK_HALF_SIZE,
    z: -BLOCK_HALF_SIZE + u * size,
    nx: -1,
    nz: 0,
  }));
  buildCrossSectionWall((u) => ({
    x: BLOCK_HALF_SIZE,
    z: BLOCK_HALF_SIZE - u * size,
    nx: 1,
    nz: 0,
  }));

  // Embedded rounded sediment pebbles along the bottom strata of the front and left walls
  const pebbleColors = [0xf5f2eb, 0xd8cbb8, 0xa89f94, 0xe8d5c4];
  const pebbleGeo = new THREE.SphereGeometry(0.10, 8, 6);
  for (let i = 0; i < 42; i++) {
    const pMat = new THREE.MeshStandardMaterial({
      color: pebbleColors[i % pebbleColors.length],
      roughness: 0.85,
    });
    const pebble = new THREE.Mesh(pebbleGeo, pMat);
    const onLeftWall = i < 22;
    const t = (i % 22) / 22 + fractHash(i * 7.1) * 0.035;
    const y = BLOCK_BOTTOM_Y + 0.14 + fractHash(i * 13.3) * 0.40;
    if (onLeftWall) {
      const z = -BLOCK_HALF_SIZE + 0.7 + t * (size - 1.4);
      pebble.position.set(-BLOCK_HALF_SIZE + 0.02, y, z);
      pebble.scale.set(0.35, 0.7 + fractHash(i * 3.7) * 0.5, 1.1 + fractHash(i * 5.3) * 0.8);
    } else {
      const x = -BLOCK_HALF_SIZE + 0.7 + t * (size - 1.4);
      pebble.position.set(x, y, BLOCK_HALF_SIZE - 0.02);
      pebble.scale.set(1.1 + fractHash(i * 5.3) * 0.8, 0.7 + fractHash(i * 3.7) * 0.5, 0.35);
    }
    root.add(pebble);
  }

  // Bottom bedrock base plate
  const bottomGeo = new THREE.PlaneGeometry(size, size);
  bottomGeo.rotateX(Math.PI / 2);
  const bottomMesh = new THREE.Mesh(
    bottomGeo,
    new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.strataBedrock, roughness: 0.95 })
  );
  bottomMesh.position.y = BLOCK_BOTTOM_Y;
  bottomMesh.castShadow = true;
  root.add(bottomMesh);

  // 3. SCULPTED COASTAL VEGETATION MATS & PAVED ROAD NETWORK
  const grassOliveMat = new THREE.MeshStandardMaterial({ color: 0x76944e, roughness: 0.9 });
  const grassLightMat = new THREE.MeshStandardMaterial({ color: 0x89a660, roughness: 0.9 });
  const scrubBushMat = new THREE.MeshStandardMaterial({ color: 0x4f6d32, roughness: 0.88 });

  const grassPatches: [number, number, number, number, number][] = [
    [-8.2, -8.2, 2.5, 2.0, 0.2],
    [-7.6, -5.0, 2.2, 1.7, -0.3],
    [-9.1, -1.5, 1.7, 2.1, 0.15],
    [-9.4, 1.5, 1.4, 1.9, 0.08],
    [-4.2, -9.2, 3.0, 1.4, 0.05],
    [-0.8, -9.0, 2.5, 1.3, -0.1],
    [3.4, -8.8, 2.8, 1.6, 0.12],
    [7.8, -8.2, 2.6, 2.0, -0.2],
    [8.4, -4.8, 2.2, 1.8, 0.25],
    [-1.8, -3.9, 1.5, 0.95, 0.18],
    [2.8, -4.1, 1.6, 1.0, -0.15],
  ];

  grassPatches.forEach(([gx, gz, rx, rz, rot], idx) => {
    const gy = evaluateSeabedHeight(gx, gz);
    if (gy < WATER_LEVEL + 0.05) return;
    const patch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 1.0, 0.042, 20),
      idx % 2 === 0 ? grassOliveMat : grassLightMat
    );
    patch.position.set(gx, gy + 0.015, gz);
    patch.scale.set(rx, 1, rz);
    patch.rotation.y = rot;
    patch.receiveShadow = true;
    root.add(patch);

    for (let b = 0; b < 3; b++) {
      const ang = rot + b * 2.1;
      const bx = gx + Math.cos(ang) * rx * 0.55;
      const bz = gz + Math.sin(ang) * rz * 0.55;
      const by = evaluateSeabedHeight(bx, bz);
      if (by > WATER_LEVEL + 0.08) {
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 1), scrubBushMat);
        bush.position.set(bx, by + 0.08, bz);
        bush.scale.set(1.2, 0.65, 1.1);
        bush.castShadow = true;
        root.add(bush);
      }
    }
  });

  const roadMat = new THREE.MeshStandardMaterial({ color: 0xc2c5bf, roughness: 0.85 });
  const roadSegments: { x: number; z: number; w: number; l: number; rotY: number }[] = [
    { x: -1.2, z: -3.5, w: 6.8, l: 0.54, rotY: -0.06 },
    { x: 2.8, z: -2.8, w: 3.6, l: 0.54, rotY: -0.28 },
    { x: -4.4, z: -3.4, w: 0.52, l: 1.9, rotY: 0.15 },
    { x: 1.6, z: -4.4, w: 0.56, l: 1.8, rotY: 0.0 },
  ];
  roadSegments.forEach((seg) => {
    const ry = evaluateSeabedHeight(seg.x, seg.z);
    const rMesh = new THREE.Mesh(new THREE.BoxGeometry(seg.w, 0.032, seg.l), roadMat);
    rMesh.position.set(seg.x, ry + 0.016, seg.z);
    rMesh.rotation.y = seg.rotY;
    rMesh.receiveShadow = true;
    root.add(rMesh);
  });

  // 4. HANGAR (HORIZONTAL INTEGRATION FACILITY), ANNEX, & CRAWLERWAY
  const hangarGroup = new THREE.Group();
  const hangarBaseY = evaluateSeabedHeight(HANGAR_WORLD_X, PAD_WORLD_Z);
  hangarGroup.position.set(HANGAR_WORLD_X, hangarBaseY, PAD_WORLD_Z);
  root.add(hangarGroup);

  const concreteMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.concreteLight,
    roughness: 0.82,
  });
  const hangarWallMat = new THREE.MeshStandardMaterial({
    color: 0xecede8,
    roughness: 0.55,
    metalness: 0.08,
  });
  const hangarRoofMat = new THREE.MeshStandardMaterial({
    color: 0xf4f5f0,
    roughness: 0.46,
    metalness: 0.10,
  });
  const ribMat = new THREE.MeshStandardMaterial({
    color: 0xcfd4dc,
    roughness: 0.5,
    metalness: 0.2,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.25,
    metalness: 0.6,
  });

  const hangarW = 4.35;
  const hangarH = 1.68;
  const hangarD = 2.15;

  const hangarApron = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.14, 2.8), concreteMat);
  hangarApron.position.y = 0.07;
  hangarApron.receiveShadow = true;
  hangarApron.castShadow = true;
  hangarGroup.add(hangarApron);

  const hBody = new THREE.Mesh(new THREE.BoxGeometry(hangarW, hangarH, hangarD), hangarWallMat);
  hBody.position.y = hangarH / 2 + 0.12;
  hBody.castShadow = true;
  hBody.receiveShadow = true;
  hangarGroup.add(hBody);

  const roofCap = new THREE.Mesh(new THREE.BoxGeometry(hangarW + 0.08, 0.2, hangarD + 0.1), hangarRoofMat);
  roofCap.position.y = hangarH + 0.18;
  roofCap.castShadow = true;
  hangarGroup.add(roofCap);

  const roofVaultGeo = new THREE.CylinderGeometry(
    hangarD * 0.5,
    hangarD * 0.5,
    hangarW + 0.04,
    24,
    1,
    false,
    0,
    Math.PI
  );
  roofVaultGeo.rotateZ(Math.PI / 2);
  const roofVault = new THREE.Mesh(roofVaultGeo, hangarRoofMat);
  roofVault.scale.set(1, 0.28, 1);
  roofVault.position.y = hangarH + 0.26;
  roofVault.castShadow = true;
  hangarGroup.add(roofVault);

  for (let i = -5; i <= 5; i++) {
    const rx = i * 0.37;
    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.045, hangarH, 0.06), ribMat);
      rib.position.set(rx, hangarH / 2 + 0.12, side * (hangarD / 2 + 0.01));
      hangarGroup.add(rib);

      if (i < 5) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 0.03), glassMat);
        win.position.set(rx + 0.185, hangarH - 0.14, side * (hangarD / 2 + 0.01));
        hangarGroup.add(win);

        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.80, 0.03), glassMat);
        slit.position.set(rx + 0.185, 0.72, side * (hangarD / 2 + 0.01));
        hangarGroup.add(slit);
      }
    }
  }

  // Tall portal frame on +X end of Hangar
  const portalColumnGeo = new THREE.BoxGeometry(0.12, 2.38, 0.12);
  const pColL = new THREE.Mesh(portalColumnGeo, ribMat);
  pColL.position.set(hangarW / 2 + 0.05, 1.25, -0.72);
  pColL.castShadow = true;
  hangarGroup.add(pColL);

  const pColR = new THREE.Mesh(portalColumnGeo, ribMat);
  pColR.position.set(hangarW / 2 + 0.05, 1.25, 0.72);
  pColR.castShadow = true;
  hangarGroup.add(pColR);

  const pLintel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.56), ribMat);
  pLintel.position.set(hangarW / 2 + 0.05, 2.42, 0);
  pLintel.castShadow = true;
  hangarGroup.add(pLintel);

  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.55,
    metalness: 0.35,
  });
  const doorGeo = new THREE.BoxGeometry(0.08, hangarH * 0.9, hangarD * 0.44);
  const hangarDoorLeft = new THREE.Mesh(doorGeo, doorMat);
  hangarDoorLeft.position.set(hangarW / 2 + 0.02, hangarH * 0.45 + 0.12, -hangarD * 0.24);
  hangarGroup.add(hangarDoorLeft);

  const hangarDoorRight = new THREE.Mesh(doorGeo, doorMat);
  hangarDoorRight.position.set(hangarW / 2 + 0.02, hangarH * 0.45 + 0.12, hangarD * 0.24);
  hangarGroup.add(hangarDoorRight);

  // Secondary white Range Control Annex in front of Hangar (matching reference video)
  const annexMesh = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.88, 1.25), hangarWallMat);
  annexMesh.position.set(-0.85, 0.50, 1.95);
  annexMesh.castShadow = true;
  annexMesh.receiveShadow = true;
  hangarGroup.add(annexMesh);

  const annexRoof = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.09, 1.32), hangarRoofMat);
  annexRoof.position.set(-0.85, 0.96, 1.95);
  hangarGroup.add(annexRoof);

  const shedMesh = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.52, 0.66), hangarWallMat);
  shedMesh.position.set(-1.95, 0.32, 1.22);
  shedMesh.castShadow = true;
  hangarGroup.add(shedMesh);

  // Crawlerway rails from Hangar to Launch Pad
  const trackLen = PAD_WORLD_X - (HANGAR_WORLD_X + hangarW / 2) + 0.5;
  const trackCenterX = (HANGAR_WORLD_X + hangarW / 2 + PAD_WORLD_X) / 2;
  const trackBed = new THREE.Mesh(new THREE.BoxGeometry(trackLen, 0.08, 1.5), concreteMat);
  trackBed.position.set(trackCenterX, hangarBaseY + 0.04, PAD_WORLD_Z);
  trackBed.receiveShadow = true;
  root.add(trackBed);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.4 });
  [-0.42, 0.42].forEach((zOff) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(trackLen, 0.06, 0.12), railMat);
    rail.position.set(trackCenterX, hangarBaseY + 0.09, PAD_WORLD_Z + zOff);
    root.add(rail);
  });

  for (let s = 0; s < 12; s++) {
    const sx = trackCenterX - trackLen * 0.44 + s * (trackLen * 0.08);
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 1.12), railMat);
    sleeper.position.set(sx, hangarBaseY + 0.075, PAD_WORLD_Z);
    root.add(sleeper);
  }

  // 5. LAUNCH COMPLEX 1 (PAD + FLAME TRENCH + 4 LIGHTNING TOWERS + CHECKERED WATER TOWER + CRYO TANKS)
  const padGroup = new THREE.Group();
  const padBaseY = evaluateSeabedHeight(PAD_WORLD_X, PAD_WORLD_Z);
  padGroup.position.set(PAD_WORLD_X, padBaseY, PAD_WORLD_Z);
  root.add(padGroup);

  const padApron = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 4.2), concreteMat);
  padApron.position.y = 0.08;
  padApron.receiveShadow = true;
  padGroup.add(padApron);

  const padDeck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.52, 2.2), concreteMat);
  padDeck.position.y = 0.34;
  padDeck.castShadow = true;
  padDeck.receiveShadow = true;
  padGroup.add(padDeck);

  const chuteWalls = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.42, 2.15), concreteMat);
  chuteWalls.position.set(0, 0.24, 1.42);
  chuteWalls.rotation.x = 0.16;
  chuteWalls.castShadow = true;
  chuteWalls.receiveShadow = true;
  padGroup.add(chuteWalls);

  const trenchFloor = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.24, 2.25),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 })
  );
  trenchFloor.position.set(0, 0.30, 1.35);
  trenchFloor.rotation.x = 0.16;
  padGroup.add(trenchFloor);

  // 4 tall slender red/white lightning protection masts with catenary wires
  const redMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.towerRed, roughness: 0.45 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.towerWhite, roughness: 0.45 });
  const mastOffsets: [number, number][] = [
    [-1.72, -1.72],
    [1.72, -1.72],
    [-1.72, 1.72],
    [1.72, 1.72],
  ];
  const mastTips: THREE.Vector3[] = [];
  const segCount = 10;
  const segH = 0.50;

  mastOffsets.forEach(([mx, mz]) => {
    const mast = new THREE.Group();
    mast.position.set(mx, 0.16, mz);

    const latticeBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.15, 0.72, 4),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, wireframe: true })
    );
    latticeBase.position.y = 0.36;
    mast.add(latticeBase);

    for (let s = 0; s < segCount; s++) {
      const rTop = Math.max(0.015, 0.065 - s * 0.0048);
      const rBot = Math.max(0.019, 0.070 - s * 0.0048);
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBot, segH, 8),
        s % 2 === 0 ? whiteMat : redMat
      );
      cyl.position.y = 0.72 + s * segH + segH / 2;
      cyl.castShadow = true;
      mast.add(cyl);
    }

    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.015, 0.62, 6), whiteMat);
    tip.position.y = 0.72 + segCount * segH + 0.31;
    mast.add(tip);

    mastTips.push(new THREE.Vector3(mx, 0.16 + 0.72 + segCount * segH + 0.48, mz));
    padGroup.add(mast);
  });

  const wireMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.6 });
  [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0],
    [0, 3],
    [1, 2],
  ].forEach(([a, b]) => {
    const pA = mastTips[a];
    const pB = mastTips[b];
    const mid = pA.clone().lerp(pB, 0.5);
    mid.y -= 0.26;
    const curve = new THREE.QuadraticBezierCurve3(pA, mid, pB);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(14));
    padGroup.add(new THREE.Line(lineGeo, wireMat));
  });

  // Checkered blue/white spherical water deluge tower
  const wtGroup = new THREE.Group();
  wtGroup.position.set(-1.32, 0.16, -0.52);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.5, roughness: 0.4 });
  for (let l = 0; l < 4; l++) {
    const ang = (l * Math.PI) / 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.25, 6), legMat);
    leg.position.set(Math.cos(ang) * 0.22, 1.12, Math.sin(ang) * 0.22);
    leg.rotation.z = -Math.cos(ang) * 0.07;
    leg.rotation.x = Math.sin(ang) * 0.07;
    leg.castShadow = true;
    wtGroup.add(leg);
  }
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 10), whiteMat);
  riser.position.y = 1.15;
  wtGroup.add(riser);

  const wtCanvas = document.createElement('canvas');
  wtCanvas.width = 128;
  wtCanvas.height = 64;
  const wtCtx = wtCanvas.getContext('2d')!;
  wtCtx.fillStyle = '#f8fafc';
  wtCtx.fillRect(0, 0, 128, 64);
  wtCtx.fillStyle = '#2563eb';
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 0) {
        wtCtx.fillRect(col * 16, 20 + row * 12, 16, 12);
      }
    }
  }
  const wtTex = new THREE.CanvasTexture(wtCanvas);
  wtTex.colorSpace = THREE.SRGBColorSpace;

  const sphereTank = new THREE.Mesh(
    new THREE.SphereGeometry(0.44, 20, 16),
    new THREE.MeshStandardMaterial({ map: wtTex, roughness: 0.35, metalness: 0.12 })
  );
  sphereTank.scale.set(1, 0.84, 1);
  sphereTank.position.y = 2.42;
  sphereTank.castShadow = true;
  wtGroup.add(sphereTank);
  padGroup.add(wtGroup);

  // White spherical LOX tank + horizontal cylindrical RP-1 tanks
  const cryoMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.32, metalness: 0.15 });
  const loxSphere = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 16), cryoMat);
  loxSphere.position.set(3.05, 0.68, -0.35);
  loxSphere.castShadow = true;
  loxSphere.receiveShadow = true;
  padGroup.add(loxSphere);

  [-0.2, 0.32].forEach((zOff) => {
    const hTank = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.48, 14), cryoMat);
    hTank.rotation.z = Math.PI / 2;
    hTank.position.set(2.75, 0.32, 0.72 + zOff);
    hTank.castShadow = true;
    padGroup.add(hTank);
  });

  // 6. LANDING ZONE 1 (LZ-1), FIRE TRUCK, RADAR, WINDSOCK, & SCOREBOARD
  const lzGroup = new THREE.Group();
  const lzBaseY = evaluateSeabedHeight(LZ_WORLD_X, LZ_WORLD_Z);
  lzGroup.position.set(LZ_WORLD_X, lzBaseY, LZ_WORLD_Z);
  root.add(lzGroup);

  const landingPadTargetMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.32, 1.38, 0.08, 36),
    new THREE.MeshStandardMaterial({ color: 0xcfd3ce, roughness: 0.82 })
  );
  landingPadTargetMesh.position.y = 0.04;
  landingPadTargetMesh.receiveShadow = true;
  landingPadTargetMesh.name = 'landing_pad_target';
  lzGroup.add(landingPadTargetMesh);

  const landingPadRingMat = new THREE.MeshBasicMaterial({
    color: 0xf8fafc,
    side: THREE.DoubleSide,
  });
  const lzRing = new THREE.Mesh(new THREE.RingGeometry(1.06, 1.14, 36), landingPadRingMat);
  lzRing.rotation.x = -Math.PI / 2;
  lzRing.position.y = 0.085;
  lzGroup.add(lzRing);

  const xMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
  [-1, 1].forEach((dir) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.01, 0.10), xMat);
    bar.position.y = 0.086;
    bar.rotation.y = (dir * Math.PI) / 4;
    lzGroup.add(bar);
  });

  // Red emergency fire truck parked near LZ-1
  const fireTruck = new THREE.Group();
  const ftx = LZ_WORLD_X + 1.55;
  const ftz = LZ_WORLD_Z - 0.15;
  fireTruck.position.set(ftx, evaluateSeabedHeight(ftx, ftz), ftz);
  fireTruck.rotation.y = -0.35;
  const ftBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.19, 0.20),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 })
  );
  ftBody.position.y = 0.12;
  ftBody.castShadow = true;
  fireTruck.add(ftBody);
  const ftCab = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.19),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
  );
  ftCab.position.set(0.16, 0.12, 0);
  fireTruck.add(ftCab);
  root.add(fireTruck);

  // Telemetry building + solar panels on the left coastal terrace
  const telX = -7.0;
  const telZ = -2.4;
  const telBldg = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.45, 0.64),
    new THREE.MeshStandardMaterial({ color: 0xf1f3ef, roughness: 0.55 })
  );
  telBldg.position.set(telX, evaluateSeabedHeight(telX, telZ) + 0.22, telZ);
  telBldg.rotation.y = 0.22;
  telBldg.castShadow = true;
  telBldg.receiveShadow = true;
  root.add(telBldg);

  const solarMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.65, roughness: 0.25 });
  for (let r = 0; r < 2; r++) {
    const sx = -8.2;
    const sz = -2.0 + r * 0.48;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.04, 0.36), solarMat);
    panel.position.set(sx, evaluateSeabedHeight(sx, sz) + 0.15, sz);
    panel.rotation.x = 0.42;
    panel.rotation.y = 0.2;
    panel.castShadow = true;
    root.add(panel);
  }

  // Rotating Radar Dish
  const radarGroup = new THREE.Group();
  const radX = -6.2;
  const radZ = -3.4;
  radarGroup.position.set(radX, evaluateSeabedHeight(radX, radZ), radZ);
  root.add(radarGroup);

  const radarPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.20, 0.50, 10),
    whiteMat
  );
  radarPedestal.position.y = 0.25;
  radarPedestal.castShadow = true;
  radarGroup.add(radarPedestal);

  const radarDish = new THREE.Group();
  radarDish.position.y = 0.55;
  const dishMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.35 })
  );
  dishMesh.rotation.x = -Math.PI / 3;
  dishMesh.castShadow = true;
  radarDish.add(dishMesh);
  radarGroup.add(radarDish);

  // Windsock
  const windSockBase = new THREE.Group();
  const wsX = -5.2;
  const wsZ = -3.2;
  windSockBase.position.set(wsX, evaluateSeabedHeight(wsX, wsZ), wsZ);
  root.add(windSockBase);

  const wsPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.96, 8), legMat);
  wsPole.position.y = 0.48;
  windSockBase.add(wsPole);

  const windSockPivot = new THREE.Group();
  windSockPivot.position.y = 0.94;
  windSockBase.add(windSockPivot);

  const coneGeo = new THREE.ConeGeometry(0.09, 0.42, 10, 1, true);
  coneGeo.rotateZ(Math.PI / 2);
  coneGeo.translate(0.21, 0, 0);
  const windSockCone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshStandardMaterial({ color: 0xf97316, side: THREE.DoubleSide, roughness: 0.6 })
  );
  windSockPivot.add(windSockCone);

  // Digital Countdown Scoreboard ("T-0:10")
  const scoreboardCanvas = document.createElement('canvas');
  scoreboardCanvas.width = 256;
  scoreboardCanvas.height = 96;
  const scoreboardCtx = scoreboardCanvas.getContext('2d')!;
  const scoreboardTexture = new THREE.CanvasTexture(scoreboardCanvas);
  scoreboardTexture.colorSpace = THREE.SRGBColorSpace;

  const sbGroup = new THREE.Group();
  const sbX = -5.6;
  const sbZ = -2.0;
  sbGroup.position.set(sbX, evaluateSeabedHeight(sbX, sbZ), sbZ);
  sbGroup.rotation.y = 0.22;
  root.add(sbGroup);

  const sbHousing = new THREE.Mesh(
    new THREE.BoxGeometry(1.12, 0.46, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.6 })
  );
  sbHousing.position.y = 0.52;
  sbHousing.castShadow = true;
  sbGroup.add(sbHousing);

  const sbScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.02, 0.36),
    new THREE.MeshBasicMaterial({ map: scoreboardTexture })
  );
  sbScreen.position.set(0, 0.52, 0.056);
  sbGroup.add(sbScreen);

  for (const lx of [-0.36, 0.36]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.40, 8), legMat);
    leg.position.set(lx, 0.20, 0);
    sbGroup.add(leg);
  }

  // 7. HARBOUR PIER, PORT WAREHOUSE, STRADDLE GANTRIES, & SLENDER LATTICE CRANE
  const pierGroup = new THREE.Group();
  pierGroup.position.set(5.4, 0, -1.9);
  root.add(pierGroup);

  const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.40, 2.2), concreteMat);
  quayDeck.position.set(0, 1.72, 0);
  quayDeck.receiveShadow = true;
  quayDeck.castShadow = true;
  pierGroup.add(quayDeck);

  const quaySubwall = new THREE.Mesh(
    new THREE.BoxGeometry(6.0, 1.85, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9 })
  );
  quaySubwall.position.set(0, 0.72, -0.05);
  pierGroup.add(quaySubwall);

  const pilingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
  for (let i = -8; i <= 8; i++) {
    const piling = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.86, 0.085), pilingMat);
    piling.position.set(i * 0.34, 1.48, 1.11);
    pierGroup.add(piling);
  }

  // White port warehouse building behind the pier with 3 roll-up cargo bay doors
  const warehouseWall = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.98, 1.35), hangarWallMat);
  warehouseWall.position.set(0.95, 2.28, -1.75);
  warehouseWall.castShadow = true;
  warehouseWall.receiveShadow = true;
  pierGroup.add(warehouseWall);

  const warehouseDoorMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });
  for (let d = -1; d <= 1; d++) {
    const bayDoor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.58, 0.04), warehouseDoorMat);
    bayDoor.position.set(0.95 + d * 0.68, 2.10, -1.06);
    pierGroup.add(bayDoor);
  }

  // Two yellow straddle gantry frames on the pier (left and right of crane)
  const yellowMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.craneYellow,
    roughness: 0.42,
    metalness: 0.25,
  });
  [-1.95, 2.05].forEach((gx) => {
    const gFrame = new THREE.Group();
    gFrame.position.set(gx, 1.92, 0.12);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.10, 0.44), yellowMat);
    topBar.position.y = 0.66;
    topBar.castShadow = true;
    gFrame.add(topBar);
    [-0.36, 0.36].forEach((lx) => {
      [-0.17, 0.17].forEach((lz) => {
        const gLeg = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.66, 0.052), yellowMat);
        gLeg.position.set(lx, 0.33, lz);
        gLeg.castShadow = true;
        gFrame.add(gLeg);
      });
    });
    pierGroup.add(gFrame);
  });

  // Slender Open-Lattice Harbour Crane (matching the delicate red/white crane in the reference video)
  const craneBase = new THREE.Group();
  craneBase.position.set(-0.25, 1.92, 0.12);
  pierGroup.add(craneBase);

  const darkBaseMat = new THREE.MeshStandardMaterial({
    color: 0x262b33,
    roughness: 0.6,
    metalness: 0.4,
  });
  const craneRedMat = new THREE.MeshStandardMaterial({
    color: 0xd94e34,
    roughness: 0.42,
    metalness: 0.22,
  });
  const craneWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.42,
    metalness: 0.25,
  });

  const pedestalDeck = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.15, 0.92), darkBaseMat);
  pedestalDeck.position.y = 0.30;
  pedestalDeck.castShadow = true;
  craneBase.add(pedestalDeck);

  [-0.36, 0.36].forEach((lx) => {
    [-0.36, 0.36].forEach((lz) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.30, 0.10), darkBaseMat);
      leg.position.set(lx, 0.15, lz);
      craneBase.add(leg);
    });
  });

  const craneTurret = new THREE.Group();
  craneTurret.position.y = 0.38;
  craneBase.add(craneTurret);

  const machineryCab = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.74, 0.84), craneRedMat);
  machineryCab.position.set(0, 0.37, -0.05);
  machineryCab.castShadow = true;
  craneTurret.add(machineryCab);

  // Rear A-frame gantry mast
  [-0.22, 0.22].forEach((sideX) => {
    const aMast = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 2.25, 6), craneRedMat);
    aMast.position.set(sideX, 1.40, -0.34);
    aMast.rotation.x = -0.18;
    craneTurret.add(aMast);
  });

  const craneBoomPivot = new THREE.Group();
  craneBoomPivot.position.set(0, 0.68, 0.20);
  craneBoomPivot.rotation.x = 0.22;
  craneTurret.add(craneBoomPivot);

  const boomLen = 6.9;
  const chordPositions: [number, number][] = [
    [-0.16, -0.16],
    [0.16, -0.16],
    [-0.16, 0.16],
    [0.16, 0.16],
  ];
  chordPositions.forEach(([cx, cz]) => {
    const chord = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.028, boomLen, 6), craneWhiteMat);
    chord.position.set(cx * 0.78, boomLen / 2, cz * 0.78);
    chord.castShadow = true;
    craneBoomPivot.add(chord);
  });

  const braceSteps = 18;
  for (let b = 0; b < braceSteps; b++) {
    const by = 0.18 + b * (boomLen / braceSteps);
    const rungMat = b > 13 ? craneRedMat : craneWhiteMat;
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.018, 0.26), rungMat);
    rung.position.set(0, by, 0);
    craneBoomPivot.add(rung);

    const diag = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.38, 0.26), rungMat);
    diag.position.set(0, by + 0.16, 0);
    diag.rotation.x = b % 2 === 0 ? 0.55 : -0.55;
    craneBoomPivot.add(diag);
  }

  // Stay cables from rear A-frame to boom tip
  const cableLineMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.75 });
  const boomTipLocal = new THREE.Vector3(
    0,
    0.68 + Math.cos(0.22) * boomLen,
    0.20 + Math.sin(0.22) * boomLen
  );
  [-0.14, 0.14].forEach((sx) => {
    const stayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(sx, 2.45, -0.52),
      new THREE.Vector3(sx * 0.6, boomTipLocal.y, boomTipLocal.z),
    ]);
    craneTurret.add(new THREE.Line(stayGeo, cableLineMat));
  });

  // Hoist cable & yellow hook spreader
  const hoistAnchor = new THREE.Group();
  hoistAnchor.position.copy(boomTipLocal);
  craneTurret.add(hoistAnchor);

  const cableGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.0, 6);
  cableGeo.translate(0, -0.5, 0);
  const craneCable = new THREE.Mesh(cableGeo, darkBaseMat);
  craneCable.scale.y = 1.65;
  hoistAnchor.add(craneCable);

  const craneSpreader = new THREE.Group();
  craneSpreader.position.y = -1.65;
  hoistAnchor.add(craneSpreader);

  const spreaderBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.18), yellowMat);
  spreaderBar.castShadow = true;
  craneSpreader.add(spreaderBar);

  // 8. TROPICAL PALM GROVES
  const palmCrowns: THREE.Group[] = [];
  const trunkMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.palmTrunk, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.palmLeaf,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });

  const palmLocations: [number, number, number][] = [
    [-9.2, -7.8, 1.02],
    [-8.0, -6.2, 0.92],
    [-9.2, -3.8, 1.05],
    [-9.4, -0.6, 0.94],
    [-9.1, 2.1, 0.88],
    [-7.4, -4.4, 0.95],
    [-4.4, -1.6, 0.90],
    [-2.0, -1.8, 1.00],
    [-0.4, -4.4, 0.88],
    [0.8, -1.8, 0.96],
    [3.8, -4.4, 0.92],
    [5.4, -5.4, 1.02],
    [8.2, -6.8, 0.98],
    [9.1, -4.0, 0.90],
    [8.6, -1.8, 0.86],
  ];

  palmLocations.forEach(([px, pz, scale]) => {
    const py = evaluateSeabedHeight(px, pz);
    if (py < WATER_LEVEL + 0.04) return;

    const palm = new THREE.Group();
    palm.position.set(px, py, pz);
    palm.scale.setScalar(scale);

    let cx = 0;
    let cy = 0;
    for (let s = 0; s < 5; s++) {
      const h = 0.26;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046 - s * 0.004, 0.056 - s * 0.004, h, 7),
        trunkMat
      );
      seg.position.set(cx, cy + h / 2, 0);
      seg.rotation.z = -s * 0.055;
      seg.castShadow = true;
      palm.add(seg);
      cy += h * Math.cos(s * 0.055);
      cx += h * Math.sin(s * 0.055);
    }

    const crown = new THREE.Group();
    crown.position.set(cx, cy, 0);
    for (let f = 0; f < 7; f++) {
      const angle = (f / 7) * Math.PI * 2;
      const frondPivot = new THREE.Group();
      frondPivot.rotation.y = angle;

      const frondMesh = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.022, 0.14), leafMat);
      frondMesh.position.set(0.31, -0.05, 0);
      frondMesh.rotation.z = -0.34;
      frondMesh.castShadow = true;
      frondPivot.add(frondMesh);
      crown.add(frondPivot);
    }

    palm.add(crown);
    palm.rotation.y = (px * 19.3 + pz * 7.1) % (Math.PI * 2);
    palmCrowns.push(crown);
    root.add(palm);
  });

  // 9. SUBMERGED REEF ROCKS, TABLE CORALS, KELP FOREST, & SHADOW-CASTING SHARKS/FISH
  const kelpStrands: THREE.Mesh[] = [];
  const swimmers: AnimatedIslandHandles['swimmers'] = [];

  const rockGeo = new THREE.DodecahedronGeometry(0.19, 1);
  const discCoralGeo = new THREE.CylinderGeometry(0.20, 0.13, 0.075, 12);
  const reefColors = [
    0x3b7a62,
    0x4d8c73,
    0x68a88d,
    0x85c4a8,
    0xd4c8b0,
    SCENE_PALETTE.coralPink,
    SCENE_PALETTE.coralGold,
  ];

  for (let i = 0; i < 185; i++) {
    const rx = -10.2 + fractHash(i * 1.73 + 0.19) * 20.4;
    const rz = -0.6 + fractHash(i * 3.17 + 0.61) * 11.2;
    const ry = evaluateSeabedHeight(rx, rz);
    if (ry > WATER_LEVEL - 0.22) continue;

    const cHex = reefColors[i % reefColors.length];
    const mat = new THREE.MeshStandardMaterial({ color: cHex, roughness: 0.84 });
    const isTableCoral = i % 5 === 0;
    const mesh = new THREE.Mesh(isTableCoral ? discCoralGeo : rockGeo, mat);
    mesh.position.set(rx, ry + 0.04, rz);
    const s = 0.42 + fractHash(i * 5.09 + 0.37) * 1.10;
    mesh.scale.set(
      s * (1.0 + (i % 3) * 0.22),
      s * (isTableCoral ? 0.8 : 0.48),
      s * 0.95
    );
    mesh.rotation.y = fractHash(i * 7.13) * Math.PI * 2;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  const kelpMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.kelpGreen, roughness: 0.72 });
  for (let k = 0; k < 42; k++) {
    const kx = -9.8 + fractHash(k * 2.39 + 1.13) * 19.6;
    const kz = -0.1 + fractHash(k * 4.73 + 2.71) * 10.4;
    const ky = evaluateSeabedHeight(kx, kz);
    if (ky > WATER_LEVEL - 0.40) continue;

    const maxH = Math.max(0.24, (WATER_LEVEL - ky) * 0.60);
    const height = Math.min(maxH, 0.35 + fractHash(k * 6.41) * 0.70);
    const stalkGeo = new THREE.CylinderGeometry(0.015, 0.030, height, 6);
    stalkGeo.translate(0, height / 2, 0);
    const stalk = new THREE.Mesh(stalkGeo, kelpMat);
    stalk.position.set(kx, ky, kz);
    root.add(stalk);
    kelpStrands.push(stalk);
  }

  // 4 Swimming Reef Sharks casting crisp shadows onto the sunlit mint seabed
  const sharkMat = new THREE.MeshStandardMaterial({ color: 0x335c53, roughness: 0.45 });
  for (let s = 0; s < 4; s++) {
    const sharkGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.105, 0.64, 10).rotateX(Math.PI / 2),
      sharkMat
    );
    body.scale.set(1.0, 0.65, 1.0);
    body.castShadow = true;
    sharkGroup.add(body);

    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.15, 4), sharkMat);
    dorsal.position.set(0, 0.075, -0.05);
    dorsal.rotation.x = -0.35;
    sharkGroup.add(dorsal);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.02, 0.11), sharkMat);
    tail.position.set(0, 0, -0.32);
    sharkGroup.add(tail);

    const cx = -5.5 + s * 3.2;
    const cz = 2.4 + (s % 2) * 2.8;
    const y = 0.85 + (s % 2) * 0.18;
    sharkGroup.position.set(cx, y, cz);
    root.add(sharkGroup);

    swimmers.push({
      mesh: sharkGroup,
      centerX: cx,
      centerZ: cz,
      radiusX: 1.35 + s * 0.30,
      radiusZ: 0.95 + s * 0.22,
      speed: 0.68 + s * 0.12,
      phase: s * 1.7,
      y,
    });
  }

  // Smaller bright tropical reef fish
  const fishGeo = new THREE.ConeGeometry(0.05, 0.22, 6);
  fishGeo.rotateX(Math.PI / 2);
  const fishPalette = [0xf97316, 0xfacc15, 0x38bdf8, 0xf43f5e];
  for (let f = 0; f < 16; f++) {
    const fGroup = new THREE.Group();
    const fMesh = new THREE.Mesh(
      fishGeo,
      new THREE.MeshStandardMaterial({ color: fishPalette[f % fishPalette.length], roughness: 0.4 })
    );
    fMesh.castShadow = true;
    fGroup.add(fMesh);

    const cx = -8.5 + fractHash(f * 3.91 + 0.43) * 16.5;
    const cz = 1.0 + fractHash(f * 7.83 + 0.91) * 8.4;
    const seabedY = evaluateSeabedHeight(cx, cz);
    const y = Math.min(WATER_LEVEL - 0.32, Math.max(seabedY + 0.32, 0.35 + (f % 4) * 0.20));

    fGroup.position.set(cx, y, cz);
    root.add(fGroup);

    swimmers.push({
      mesh: fGroup,
      centerX: cx,
      centerZ: cz,
      radiusX: 0.72 + (f % 4) * 0.34,
      radiusZ: 0.58 + (f % 3) * 0.28,
      speed: 0.92 + (f % 3) * 0.28,
      phase: f * 1.15,
      y,
    });
  }

  // 10. WHEELING SEAGULLS ABOVE THE HARBOUR & COASTLINE
  const seagulls: AnimatedIslandHandles['seagulls'] = [];
  const gullMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  for (let g = 0; g < 6; g++) {
    const gullGroup = new THREE.Group();
    const wingGeo = new THREE.PlaneGeometry(0.16, 0.055);
    wingGeo.translate(0.08, 0, 0);
    const wingL = new THREE.Mesh(wingGeo, gullMat);
    const wingRGeo = new THREE.PlaneGeometry(0.16, 0.055);
    wingRGeo.translate(-0.08, 0, 0);
    const wingR = new THREE.Mesh(wingRGeo, gullMat);
    gullGroup.add(wingL, wingR);
    root.add(gullGroup);

    seagulls.push({
      group: gullGroup,
      wingL,
      wingR,
      cx: -2.0 + g * 1.8,
      cz: -1.5 + (g % 2) * 2.5,
      rx: 1.8 + (g % 3) * 0.6,
      rz: 1.4 + (g % 2) * 0.5,
      y: 3.4 + (g % 3) * 0.55,
      speed: 0.85 + g * 0.12,
      phase: g * 1.1,
    });
  }

  return {
    hangarDoorLeft,
    hangarDoorRight,
    radarDish,
    windSockPivot,
    windSockCone,
    craneTurret,
    craneBoomPivot,
    craneCable,
    craneSpreader,
    scoreboardCanvas,
    scoreboardCtx,
    scoreboardTexture,
    landingPadRingMat,
    landingPadTargetMesh,
    palmCrowns,
    kelpStrands,
    swimmers,
    seagulls,
    seabedUniforms,
  };
}
