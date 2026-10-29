import * as THREE from 'three';
import {
  BLOCK_BOTTOM_Y,
  BLOCK_HALF_SIZE,
  WATER_LEVEL,
  evaluateSeabedHeight,
} from './JellyShaders';

export interface SeabedShaderUniforms {
  uTime: { value: number };
  uShallowColor: { value: THREE.Color };
  uDeepColor: { value: THREE.Color };
  uCausticColor: { value: THREE.Color };
  uStorm: { value: number };
}

export interface AnimatedIslandHandles {
  seabedUniforms: SeabedShaderUniforms;
  hangarDoorLeft: THREE.Mesh;
  hangarDoorRight: THREE.Mesh;
  radarDish: THREE.Group;
  windSockPivot: THREE.Group;
  windSockCone: THREE.Mesh;
  craneTurret: THREE.Group;
  craneTrolley: THREE.Group;
  craneCable: THREE.Mesh;
  craneSpreader: THREE.Group;
  palmCrowns: THREE.Group[];
  kelpStrands: THREE.Mesh[];
  swimmers: {
    mesh: THREE.Group;
    centerX: number;
    centerZ: number;
    y: number;
    radiusX: number;
    radiusZ: number;
    speed: number;
    phase: number;
  }[];
  seagulls: {
    group: THREE.Group;
    wingL: THREE.Mesh;
    wingR: THREE.Mesh;
    cx: number;
    cz: number;
    y: number;
    rx: number;
    rz: number;
    speed: number;
    phase: number;
  }[];
  landingPadTargetMesh: THREE.Mesh;
  landingPadRingMat: THREE.MeshBasicMaterial;
  scoreboardCanvas: HTMLCanvasElement;
  scoreboardCtx: CanvasRenderingContext2D;
  scoreboardTexture: THREE.CanvasTexture;
}

function pseudoNoise(x: number, y: number): number {
  return (
    Math.sin(x * 1.37 + y * 2.41) * 0.5 +
    Math.cos(x * 3.13 - y * 1.79) * 0.3 +
    Math.sin(x * 6.1 + y * 5.3) * 0.2
  );
}

function fractHash(n: number): number {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

export function buildIslandAndSeabed(
  root: THREE.Group,
  initialShallow: THREE.Color,
  initialDeep: THREE.Color,
  initialCaustic: THREE.Color
): AnimatedIslandHandles {
  const segs = 160;
  const size = BLOCK_HALF_SIZE * 2;

  const seabedUniforms: SeabedShaderUniforms = {
    uTime: { value: 0 },
    uShallowColor: { value: initialShallow },
    uDeepColor: { value: initialDeep },
    uCausticColor: { value: initialCaustic },
    uStorm: { value: 0 },
  };

  // 1. HIGH-RESOLUTION TERRAIN & SEABED MESH
  const topGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  topGeo.rotateX(-Math.PI / 2);

  const posAttr = topGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const cDrySand = new THREE.Color('#ede6d5');
  const cWetSand = new THREE.Color('#d8cdb8');
  const cGrass = new THREE.Color('#719453');
  const cGrassDark = new THREE.Color('#56773d');
  const cConcrete = new THREE.Color('#d6d4cd');
  const cRoad = new THREE.Color('#b5b1a8');
  const cSeabedSand = new THREE.Color('#eef7f4');
  const cTemp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = evaluateSeabedHeight(x, z);
    posAttr.setY(i, y);

    const n = pseudoNoise(x, z);
    if (y > WATER_LEVEL + 0.14) {
      const onPadApron = x > -7.2 && x < 5.4 && z > -7.6 && z < -4.2;
      const onPierApron = x > 2.2 && x < 9.2 && z > -3.8 && z < -1.15;
      const onLZApron = Math.hypot(x - -3.6, z - -2.8) < 1.55;
      const onRoad =
        (Math.abs(z - -3.2) < 0.34 && x > -6.5 && x < 5.5) ||
        (Math.abs(x - -3.6) < 0.34 && z > -5.5 && z < -1.2);

      if (onPadApron || onPierApron || onLZApron) {
        cTemp.copy(cConcrete).offsetHSL(0, 0, n * 0.015);
      } else if (onRoad) {
        cTemp.copy(cRoad).offsetHSL(0, 0, n * 0.012);
      } else {
        const grassNoise = pseudoNoise(x * 0.65 + 1.2, z * 0.65 - 0.8);
        const elevationFactor = THREE.MathUtils.smoothstep(y, WATER_LEVEL + 0.22, WATER_LEVEL + 0.48);
        const grassMask = THREE.MathUtils.smoothstep(grassNoise + elevationFactor * 0.55, 0.24, 0.66);
        cTemp.copy(cDrySand).lerp(n > 0 ? cGrass : cGrassDark, grassMask * 0.86);
        cTemp.offsetHSL(0, 0, n * 0.02);
      }
    } else if (y > WATER_LEVEL - 0.06) {
      const t = THREE.MathUtils.smoothstep(y, WATER_LEVEL - 0.06, WATER_LEVEL + 0.14);
      cTemp.copy(cWetSand).lerp(cDrySand, t);
    } else {
      cTemp.copy(cSeabedSand).offsetHSL(0, 0, n * 0.02);
    }

    colors[i * 3] = cTemp.r;
    colors[i * 3 + 1] = cTemp.g;
    colors[i * 3 + 2] = cTemp.b;
  }

  topGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  topGeo.computeVertexNormals();

  const topMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
  });

  // Inject bright luminous Jelly Beer-Lambert tint + organic wave-warped Voronoi caustics
  topMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = seabedUniforms.uTime;
    shader.uniforms.uShallowColor = seabedUniforms.uShallowColor;
    shader.uniforms.uDeepColor = seabedUniforms.uDeepColor;
    shader.uniforms.uCausticColor = seabedUniforms.uCausticColor;
    shader.uniforms.uStorm = seabedUniforms.uStorm;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vCustomLocalPos;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vCustomLocalPos = position;
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform vec3 uShallowColor;
        uniform vec3 uDeepColor;
        uniform vec3 uCausticColor;
        uniform float uStorm;
        varying vec3 vCustomLocalPos;

        float causticCell(vec2 p, float t) {
          // Organic wave refraction warp so caustic filaments curve naturally
          p += 0.24 * vec2(
            sin(p.y * 1.45 + t * 1.65) + cos(p.x * 0.9 - t * 1.2),
            cos(p.x * 1.55 - t * 1.45) + sin(p.y * 1.1 + t * 1.3)
          );
          vec2 i = floor(p);
          vec2 f = fract(p);
          float dMin = 1.0;
          float dSec = 1.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 nb = vec2(float(x), float(y));
              vec2 cellId = i + nb;
              float h1 = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
              float h2 = fract(sin(dot(cellId, vec2(269.5, 183.3))) * 43758.5453);
              vec2 pt = nb + 0.5 + 0.44 * sin(t * 1.6 + 6.2831 * vec2(h1, h2));
              float d = length(f - pt);
              if (d < dMin) {
                dSec = dMin;
                dMin = d;
              } else if (d < dSec) {
                dSec = d;
              }
            }
          }
          float edge = clamp(1.0 - (dSec - dMin) * 4.2, 0.0, 1.0);
          return pow(edge, 2.8);
        }
        `
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */ `
        float waterDepth = ${WATER_LEVEL.toFixed(2)} - vCustomLocalPos.y;
        if (waterDepth > 0.0) {
          float depthNorm = clamp(waterDepth / 2.8, 0.0, 1.0);
          float entryBlend = smoothstep(0.0, 0.16, waterDepth);

          // Luminous translucent jelly tint on the bright sandy seabed
          vec3 jellyBedTint = mix(uShallowColor, uDeepColor, pow(depthNorm, 0.75));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * jellyBedTint * 1.12, entryBlend * 0.85);

          // Dual-octave organic caustic web
          vec2 uv = vCustomLocalPos.xz * 0.82;
          float c1 = causticCell(uv * 1.1 + vec2(uTime * 0.12, -uTime * 0.09), uTime);
          float c2 = causticCell(uv * 1.75 - vec2(uTime * 0.09, uTime * 0.13), uTime * 1.2);
          float causticWeb = (c1 * 0.62 + c2 * 0.48) * entryBlend * (1.0 - depthNorm * 0.25) * (1.0 - uStorm * 0.55);

          gl_FragColor.rgb += uCausticColor * causticWeb * 0.46;
        }
        #include <dithering_fragment>
        `
      );
  };

  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.receiveShadow = true;
  topMesh.castShadow = true;
  topMesh.name = 'island_top_terrain';
  root.add(topMesh);

  // 2. STRATIFIED GEOLOGICAL CROSS-SECTION WALLS
  buildStratifiedRockWalls(root, segs);

  // 3. SPACEPORT ARCHITECTURE
  const { hangarDoorLeft, hangarDoorRight } = buildHangarAndCrawlerway(root);
  buildLaunchComplexOne(root);
  const scoreboard = buildDigitalScoreboard(root);
  const { radarDish, windSockPivot, windSockCone, landingPadTargetMesh, landingPadRingMat } =
    buildLandingZoneAndRadar(root);
  const craneHandles = buildHarbourPierAndCrane(root);

  // 4. COASTAL PALM TREES & SEAGULLS
  const palmCrowns = buildPalmTrees(root);
  const seagulls = buildSeagulls(root);

  // 5. DENSE UNDERWATER CORAL REEF, KELP & MARINE SWIMMERS
  const { kelpStrands, swimmers } = buildUnderwaterEcosystem(root);

  return {
    seabedUniforms,
    hangarDoorLeft,
    hangarDoorRight,
    radarDish,
    windSockPivot,
    windSockCone,
    ...craneHandles,
    palmCrowns,
    kelpStrands,
    swimmers,
    seagulls,
    landingPadTargetMesh,
    landingPadRingMat,
    ...scoreboard,
  };
}

function buildStratifiedRockWalls(root: THREE.Group, segs: number): void {
  const yRows = 24;
  const walls: {
    startX: number;
    startZ: number;
    endX: number;
    endZ: number;
    nx: number;
    nz: number;
  }[] = [
    { startX: -BLOCK_HALF_SIZE, startZ: BLOCK_HALF_SIZE, endX: BLOCK_HALF_SIZE, endZ: BLOCK_HALF_SIZE, nx: 0, nz: 1 },
    { startX: BLOCK_HALF_SIZE, startZ: -BLOCK_HALF_SIZE, endX: -BLOCK_HALF_SIZE, endZ: -BLOCK_HALF_SIZE, nx: 0, nz: -1 },
    { startX: BLOCK_HALF_SIZE, startZ: BLOCK_HALF_SIZE, endX: BLOCK_HALF_SIZE, endZ: -BLOCK_HALF_SIZE, nx: 1, nz: 0 },
    { startX: -BLOCK_HALF_SIZE, startZ: -BLOCK_HALF_SIZE, endX: -BLOCK_HALF_SIZE, endZ: BLOCK_HALF_SIZE, nx: -1, nz: 0 },
  ];

  // Bright coastal limestone & chalk strata matching crop_top_island.png
  const cChalk = new THREE.Color('#f4f1ea');
  const cLimestone = new THREE.Color('#e6dfd2');
  const cSandstone = new THREE.Color('#d6cab6');
  const cOchre = new THREE.Color('#c4b299');
  const cBase = new THREE.Color('#9c9286');
  const cTemp = new THREE.Color();

  walls.forEach((wall) => {
    const geo = new THREE.PlaneGeometry(BLOCK_HALF_SIZE * 2, 1, segs, yRows);
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const cols = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + BLOCK_HALF_SIZE) / (BLOCK_HALF_SIZE * 2);
      const v = pos.getY(i) + 0.5;

      const wx = THREE.MathUtils.lerp(wall.startX, wall.endX, u);
      const wz = THREE.MathUtils.lerp(wall.startZ, wall.endZ, u);
      const topY = evaluateSeabedHeight(wx, wz);
      const wy = THREE.MathUtils.lerp(BLOCK_BOTTOM_Y, topY, v);

      pos.setXYZ(i, wx, wy, wz);
      norm.setXYZ(i, wall.nx, 0, wall.nz);

      const depthBelowSurface = topY - wy;
      const waveFold = Math.sin(wx * 0.25 + wz * 0.22) * 0.08;
      const d = depthBelowSurface + waveFold;
      const striation = Math.sin(wy * 18.0) * 0.018;

      if (d < 0.28) {
        cTemp.copy(cChalk);
      } else if (d < 0.65) {
        cTemp.copy(cLimestone);
      } else if (d < 1.15) {
        cTemp.copy(cSandstone);
      } else if (d < 1.65) {
        cTemp.copy(cOchre);
      } else {
        cTemp.copy(cBase);
      }

      cTemp.offsetHSL(0, 0, striation);
      cols[i * 3] = cTemp.r;
      cols[i * 3 + 1] = cTemp.g;
      cols[i * 3 + 2] = cTemp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'block_side_wall';
    root.add(mesh);
  });

  const baseGeo = new THREE.PlaneGeometry(BLOCK_HALF_SIZE * 2, BLOCK_HALF_SIZE * 2);
  baseGeo.rotateX(Math.PI / 2);
  baseGeo.translate(0, BLOCK_BOTTOM_Y, 0);
  const baseMesh = new THREE.Mesh(
    baseGeo,
    new THREE.MeshStandardMaterial({ color: '#8c8378', roughness: 0.92 })
  );
  baseMesh.castShadow = true;
  root.add(baseMesh);
}

function buildHangarAndCrawlerway(root: THREE.Group): {
  hangarDoorLeft: THREE.Mesh;
  hangarDoorRight: THREE.Mesh;
} {
  const hangarGroup = new THREE.Group();
  const baseY = evaluateSeabedHeight(-4.2, -6.2);
  hangarGroup.position.set(-4.2, baseY, -6.2);
  root.add(hangarGroup);

  const concreteMat = new THREE.MeshStandardMaterial({ color: '#d6d3cb', roughness: 0.85 });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#f2f3f5', roughness: 0.45, metalness: 0.12 });
  const ribTrimMat = new THREE.MeshStandardMaterial({ color: '#b8c2cc', roughness: 0.45, metalness: 0.3 });
  const windowMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.25, metalness: 0.6 });
  const interiorMat = new THREE.MeshStandardMaterial({ color: '#27303d', roughness: 0.8 });

  const padSlab = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.12, 3.0), concreteMat);
  padSlab.position.set(2.8, 0.03, 0);
  padSlab.receiveShadow = true;
  padSlab.castShadow = true;
  hangarGroup.add(padSlab);

  const hLen = 4.2;
  const hWid = 2.05;
  const hHei = 1.38;

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, hHei, hWid), wallMat);
  backWall.position.set(-hLen / 2, hHei / 2 + 0.08, 0);
  backWall.castShadow = true;
  hangarGroup.add(backWall);

  const northWall = new THREE.Mesh(new THREE.BoxGeometry(hLen, hHei, 0.12), wallMat);
  northWall.position.set(0, hHei / 2 + 0.08, -hWid / 2);
  northWall.castShadow = true;
  hangarGroup.add(northWall);

  const southWall = new THREE.Mesh(new THREE.BoxGeometry(hLen, hHei, 0.12), wallMat);
  southWall.position.set(0, hHei / 2 + 0.08, hWid / 2);
  southWall.castShadow = true;
  hangarGroup.add(southWall);

  // Small clerestory windows along top of South wall (matching crop_top_island.png)
  for (let w = -5; w <= 5; w++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.14), windowMat);
    win.position.set(w * 0.35, hHei * 0.78, hWid / 2);
    hangarGroup.add(win);
  }

  // Light architectural roof with skylight crown & subtle external ribs
  const roofLower = new THREE.Mesh(new THREE.BoxGeometry(hLen + 0.08, 0.1, hWid + 0.12), wallMat);
  roofLower.position.set(0, hHei + 0.1, 0);
  roofLower.castShadow = true;
  hangarGroup.add(roofLower);

  const roofCrown = new THREE.Mesh(new THREE.BoxGeometry(hLen - 0.12, 0.12, hWid * 0.56), ribTrimMat);
  roofCrown.position.set(0, hHei + 0.18, 0);
  roofCrown.castShadow = true;
  hangarGroup.add(roofCrown);

  for (let r = -5; r <= 5; r++) {
    const rx = r * 0.38;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.035, hHei + 0.14, hWid + 0.16), ribTrimMat);
    rib.position.set(rx, hHei / 2 + 0.1, 0);
    hangarGroup.add(rib);
  }

  // Tall Open Portal Frame at +X entrance (matching crop_top_island.png)
  const portalFrame = new THREE.Mesh(new THREE.BoxGeometry(0.12, hHei + 0.36, hWid + 0.18), ribTrimMat);
  portalFrame.position.set(hLen / 2, (hHei + 0.36) / 2 + 0.08, 0);
  hangarGroup.add(portalFrame);

  const portalCutout = new THREE.Mesh(new THREE.BoxGeometry(0.16, hHei - 0.04, hWid - 0.16), interiorMat);
  portalCutout.position.set(hLen / 2, hHei / 2 + 0.08, 0);
  hangarGroup.add(portalCutout);

  const hangarDoorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, hHei - 0.08, hWid * 0.44), interiorMat);
  hangarDoorLeft.position.set(hLen / 2, hHei / 2 + 0.08, -hWid * 0.22);
  hangarGroup.add(hangarDoorLeft);

  const hangarDoorRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, hHei - 0.08, hWid * 0.44), interiorMat);
  hangarDoorRight.position.set(hLen / 2, hHei / 2 + 0.08, hWid * 0.22);
  hangarGroup.add(hangarDoorRight);

  // Secondary Support Building + White Crew Transport Van in front of Hangar
  const annex = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.58, 1.05), wallMat);
  annex.position.set(-1.3, 0.32, 2.05);
  annex.castShadow = true;
  annex.receiveShadow = true;
  hangarGroup.add(annex);

  const crewBus = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.22, 0.28), wallMat);
  crewBus.position.set(-1.2, 0.18, 1.2);
  crewBus.castShadow = true;
  hangarGroup.add(crewBus);

  const railMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.4, metalness: 0.7 });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: '#786858', roughness: 0.9 });

  [-0.28, 0.28].forEach((rz) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.04, 0.05), railMat);
    rail.position.set(3.1, 0.11, rz);
    hangarGroup.add(rail);
  });

  for (let s = 0; s < 22; s++) {
    const sx = 0.25 + s * 0.27;
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.78), sleeperMat);
    sleeper.position.set(sx, 0.095, 0);
    hangarGroup.add(sleeper);
  }

  return { hangarDoorLeft, hangarDoorRight };
}

export const PAD_WORLD_X = 1.8;
export const PAD_WORLD_Z = -6.2;
export const HANGAR_WORLD_X = -4.2;

function buildLaunchComplexOne(root: THREE.Group): void {
  const baseY = evaluateSeabedHeight(PAD_WORLD_X, PAD_WORLD_Z);
  const lcGroup = new THREE.Group();
  lcGroup.position.set(PAD_WORLD_X, baseY, PAD_WORLD_Z);
  root.add(lcGroup);

  const concreteMat = new THREE.MeshStandardMaterial({ color: '#c4c1b8', roughness: 0.82 });
  const darkTrenchMat = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.9 });
  const redMat = new THREE.MeshStandardMaterial({ color: '#d93829', roughness: 0.42 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f5f4f0', roughness: 0.38 });
  const blueMat = new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.4 });
  const steelMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.45, metalness: 0.6 });

  const padPyramid = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.45, 0.48, 4), concreteMat);
  padPyramid.rotation.y = Math.PI / 4;
  padPyramid.position.set(0, 0.28, 0);
  padPyramid.castShadow = true;
  padPyramid.receiveShadow = true;
  lcGroup.add(padPyramid);

  const flameChute = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.22, 2.15), darkTrenchMat);
  flameChute.position.set(0, 0.16, 0.82);
  flameChute.rotation.x = 0.08;
  lcGroup.add(flameChute);

  const chuteWalls = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.28, 2.0), concreteMat);
  chuteWalls.position.set(0, 0.15, 0.82);
  chuteWalls.receiveShadow = true;
  lcGroup.add(chuteWalls);

  const towerOffsets = [
    [-1.35, -1.22],
    [1.35, -1.22],
    [1.35, 1.22],
    [-1.35, 1.22],
  ];
  const towerHeight = 5.0;
  const towerTops: THREE.Vector3[] = [];

  towerOffsets.forEach(([tx, tz]) => {
    const tGroup = new THREE.Group();
    tGroup.position.set(tx, 0.08, tz);
    lcGroup.add(tGroup);

    const bands = 9;
    const bH = towerHeight / bands;
    for (let b = 0; b < bands; b++) {
      const rBot = THREE.MathUtils.lerp(0.058, 0.015, b / bands);
      const rTop = THREE.MathUtils.lerp(0.058, 0.015, (b + 1) / bands);
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBot, bH, 8),
        b % 2 === 0 ? whiteMat : redMat
      );
      seg.position.y = b * bH + bH / 2;
      seg.castShadow = true;
      tGroup.add(seg);
    }

    const finSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.014, 0.65, 6), whiteMat);
    finSpire.position.y = towerHeight + 0.32;
    tGroup.add(finSpire);

    towerTops.push(new THREE.Vector3(tx, towerHeight + 0.6, tz));
  });

  const wireMat = new THREE.LineBasicMaterial({ color: '#94a3b8', transparent: true, opacity: 0.5 });
  for (let i = 0; i < 4; i++) {
    const pA = towerTops[i];
    const pB = towerTops[(i + 1) % 4];
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 16; s++) {
      const t = s / 16;
      const p = new THREE.Vector3().lerpVectors(pA, pB, t);
      p.y -= Math.sin(t * Math.PI) * 0.28;
      pts.push(p);
    }
    lcGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }

  // Blue-and-White Spherical Water Tower
  const wtGroup = new THREE.Group();
  wtGroup.position.set(-1.1, 0.08, -0.5);
  lcGroup.add(wtGroup);

  const wtSphere = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), whiteMat);
  wtSphere.position.y = 1.95;
  wtSphere.scale.y = 0.85;
  wtSphere.castShadow = true;
  wtGroup.add(wtSphere);

  const wtBand = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.12, 20), blueMat);
  wtBand.position.y = 1.95;
  wtGroup.add(wtBand);

  const wtRiser = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 1.8, 10), whiteMat);
  wtRiser.position.y = 0.9;
  wtRiser.castShadow = true;
  wtGroup.add(wtRiser);

  for (let l = 0; l < 4; l++) {
    const a = (l * Math.PI) / 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 1.85, 6), steelMat);
    leg.position.set(Math.cos(a) * 0.2, 0.9, Math.sin(a) * 0.2);
    leg.rotation.z = Math.cos(a) * 0.06;
    leg.rotation.x = -Math.sin(a) * 0.06;
    wtGroup.add(leg);
  }

  // White LOX Sphere + Horizontal RP-1 Tank East of the Pad
  const loxSphere = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 20), whiteMat);
  loxSphere.position.set(2.25, 0.52, -0.45);
  loxSphere.castShadow = true;
  lcGroup.add(loxSphere);

  const rpTank = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.15, 16), whiteMat);
  rpTank.rotation.z = Math.PI / 2;
  rpTank.position.set(2.05, 0.28, 0.35);
  rpTank.castShadow = true;
  lcGroup.add(rpTank);
}

function buildDigitalScoreboard(root: THREE.Group): {
  scoreboardCanvas: HTMLCanvasElement;
  scoreboardCtx: CanvasRenderingContext2D;
  scoreboardTexture: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const boardGroup = new THREE.Group();
  const bx = -4.9;
  const bz = -1.6;
  boardGroup.position.set(bx, evaluateSeabedHeight(bx, bz), bz);
  boardGroup.rotation.y = 0.42;
  root.add(boardGroup);

  const frameMat = new THREE.MeshStandardMaterial({ color: '#181c23', roughness: 0.5, metalness: 0.6 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.42, 0.09), frameMat);
  frame.position.y = 0.48;
  frame.castShadow = true;
  boardGroup.add(frame);

  [-0.36, 0.36].forEach((px) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), frameMat);
    post.position.set(px, 0.24, 0);
    boardGroup.add(post);
  });

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.96, 0.34),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  screen.position.set(0, 0.48, 0.05);
  boardGroup.add(screen);

  return {
    scoreboardCanvas: canvas,
    scoreboardCtx: ctx,
    scoreboardTexture: texture,
  };
}

export const LZ_WORLD_X = -3.6;
export const LZ_WORLD_Z = -2.8;

function buildLandingZoneAndRadar(root: THREE.Group): {
  radarDish: THREE.Group;
  windSockPivot: THREE.Group;
  windSockCone: THREE.Mesh;
  landingPadTargetMesh: THREE.Mesh;
  landingPadRingMat: THREE.MeshBasicMaterial;
} {
  const lzY = evaluateSeabedHeight(LZ_WORLD_X, LZ_WORLD_Z);
  const lzGroup = new THREE.Group();
  lzGroup.position.set(LZ_WORLD_X, lzY, LZ_WORLD_Z);
  root.add(lzGroup);

  const padMat = new THREE.MeshStandardMaterial({ color: '#d8d5cc', roughness: 0.8 });
  const padDisk = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.15, 0.06, 32), padMat);
  padDisk.position.y = 0.03;
  padDisk.receiveShadow = true;
  padDisk.name = 'landing_pad_target';
  lzGroup.add(padDisk);

  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.76, 0.85, 32), ringMat);
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.065;
  lzGroup.add(targetRing);

  const xMarkMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  [-1, 1].forEach((dir) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.01, 0.08), xMarkMat);
    bar.position.y = 0.066;
    bar.rotation.y = (dir * Math.PI) / 4;
    lzGroup.add(bar);
  });

  const fireTruck = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.14, 0.16),
    new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.4 })
  );
  fireTruck.position.set(1.38, 0.1, 0.15);
  fireTruck.rotation.y = -0.3;
  fireTruck.castShadow = true;
  lzGroup.add(fireTruck);

  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.45 });
  const radarBldg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.42, 0.65), whiteMat);
  radarBldg.position.set(-2.5, 0.22, 1.05);
  radarBldg.rotation.y = 0.35;
  radarBldg.castShadow = true;
  lzGroup.add(radarBldg);

  const solarMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.3, metalness: 0.6 });
  for (let s = 0; s < 3; s++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.025, 0.24), solarMat);
    panel.position.set(-3.35, 0.14, 0.95 + s * 0.32);
    panel.rotation.x = 0.35;
    lzGroup.add(panel);
  }

  const radarPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.38, 12),
    whiteMat
  );
  radarPedestal.position.set(-2.0, 0.2, -0.35);
  lzGroup.add(radarPedestal);

  const radarDish = new THREE.Group();
  radarDish.position.set(-2.0, 0.45, -0.35);
  lzGroup.add(radarDish);

  const dishBowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, side: THREE.DoubleSide })
  );
  dishBowl.rotation.x = -Math.PI * 0.68;
  dishBowl.castShadow = true;
  radarDish.add(dishBowl);

  const poleMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.6, roughness: 0.3 });
  const windPole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.95, 8), poleMat);
  windPole.position.set(-0.95, 0.48, 1.1);
  lzGroup.add(windPole);

  const windSockPivot = new THREE.Group();
  windSockPivot.position.set(-0.95, 0.94, 1.1);
  lzGroup.add(windSockPivot);

  const sockGeo = new THREE.ConeGeometry(0.075, 0.36, 10, 1, true);
  sockGeo.rotateZ(-Math.PI / 2);
  sockGeo.translate(0.18, 0, 0);
  const windSockCone = new THREE.Mesh(
    sockGeo,
    new THREE.MeshStandardMaterial({ color: '#ea580c', roughness: 0.6, side: THREE.DoubleSide })
  );
  windSockPivot.add(windSockCone);

  return {
    radarDish,
    windSockPivot,
    windSockCone,
    landingPadTargetMesh: padDisk,
    landingPadRingMat: ringMat,
  };
}

function buildHarbourPierAndCrane(root: THREE.Group): {
  craneTurret: THREE.Group;
  craneTrolley: THREE.Group;
  craneCable: THREE.Mesh;
  craneSpreader: THREE.Group;
} {
  const pierX = 5.4;
  const pierZ = -2.4;
  const pierY = evaluateSeabedHeight(pierX, pierZ);

  const pierGroup = new THREE.Group();
  pierGroup.position.set(pierX, pierY, pierZ);
  root.add(pierGroup);

  const concreteMat = new THREE.MeshStandardMaterial({ color: '#d0cdc4', roughness: 0.82 });
  const darkPilingMat = new THREE.MeshStandardMaterial({ color: '#2b303a', roughness: 0.88 });
  const yellowMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.4, metalness: 0.3 });
  const orangeRedMat = new THREE.MeshStandardMaterial({ color: '#dc4a26', roughness: 0.42, metalness: 0.25 });
  const whiteTrussMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.4, metalness: 0.5 });

  const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.65, 2.1), concreteMat);
  quayDeck.position.set(0, -0.2, 0.25);
  quayDeck.castShadow = true;
  quayDeck.receiveShadow = true;
  pierGroup.add(quayDeck);

  for (let i = -8; i <= 8; i++) {
    const fx = i * 0.31;
    const piling = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.08), darkPilingMat);
    piling.position.set(fx, -0.18, 1.32);
    pierGroup.add(piling);
  }

  [-1.8, 1.8].forEach((gx) => {
    const gFrame = new THREE.Group();
    gFrame.position.set(gx, 0.12, 0.62);
    pierGroup.add(gFrame);

    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.38), yellowMat);
    topBar.position.y = 0.38;
    topBar.castShadow = true;
    gFrame.add(topBar);

    [
      [-0.22, -0.16],
      [0.22, -0.16],
      [-0.22, 0.16],
      [0.22, 0.16],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.38, 6), yellowMat);
      leg.position.set(lx, 0.19, lz);
      gFrame.add(leg);
    });
  });

  const warehouse = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.62, 0.88),
    new THREE.MeshStandardMaterial({ color: '#e8e6df', roughness: 0.6 })
  );
  warehouse.position.set(0.85, 0.42, -0.52);
  warehouse.castShadow = true;
  warehouse.receiveShadow = true;
  pierGroup.add(warehouse);

  const craneBase = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.24, 0.82), darkPilingMat);
  craneBase.position.set(-0.35, 0.24, 0.55);
  craneBase.castShadow = true;
  pierGroup.add(craneBase);

  const craneTurret = new THREE.Group();
  craneTurret.position.set(-0.35, 0.36, 0.55);
  pierGroup.add(craneTurret);

  const cabBody = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.76), orangeRedMat);
  cabBody.position.set(0, 0.23, -0.06);
  cabBody.castShadow = true;
  craneTurret.add(cabBody);

  const boomGroup = new THREE.Group();
  boomGroup.position.set(0, 0.38, 0.16);
  boomGroup.rotation.x = 0.32;
  craneTurret.add(boomGroup);

  const boomLength = 5.1;
  const chordOffsets = [
    [-0.12, -0.12],
    [0.12, -0.12],
    [0.12, 0.12],
    [-0.12, 0.12],
  ];

  chordOffsets.forEach(([cx, cz]) => {
    const lowChord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.022, boomLength * 0.35, 6),
      orangeRedMat
    );
    lowChord.position.set(cx, boomLength * 0.175, cz);
    lowChord.castShadow = true;
    boomGroup.add(lowChord);

    const highChord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.016, boomLength * 0.65, 6),
      whiteTrussMat
    );
    highChord.position.set(cx * 0.82, boomLength * 0.675, cz * 0.82);
    highChord.castShadow = true;
    boomGroup.add(highChord);
  });

  for (let r = 1; r <= 14; r++) {
    const ry = (r / 14) * boomLength;
    const mat = r <= 5 ? orangeRedMat : whiteTrussMat;
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.018, 0.24), mat);
    rung.position.set(0, ry, 0);
    boomGroup.add(rung);
  }

  const craneTrolley = new THREE.Group();
  craneTrolley.position.set(0, 4.9, 1.82);
  craneTurret.add(craneTrolley);

  const cableGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6);
  cableGeo.translate(0, -0.5, 0);
  const craneCable = new THREE.Mesh(cableGeo, darkPilingMat);
  craneCable.scale.y = 1.55;
  craneTrolley.add(craneCable);

  const craneSpreader = new THREE.Group();
  craneSpreader.position.set(0, -1.55, 0);
  craneTrolley.add(craneSpreader);

  const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.16), yellowMat);
  craneSpreader.add(hookBlock);

  return {
    craneTurret,
    craneTrolley,
    craneCable,
    craneSpreader,
  };
}

function buildPalmTrees(root: THREE.Group): THREE.Group[] {
  const palmPositions: [number, number][] = [
    [-8.6, -3.4],
    [-8.2, -2.6],
    [-6.6, -3.8],
    [-5.8, -0.4],
    [-2.5, -1.5],
    [-0.2, -2.8],
    [1.8, -2.4],
    [3.8, -4.4],
    [8.2, -3.2],
    [9.4, -1.8],
    [-8.8, -6.8],
    [-1.2, -8.5],
    [4.5, -8.2],
    [8.6, -6.5],
  ];

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#785f47', roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: '#558b44',
    roughness: 0.68,
    side: THREE.DoubleSide,
  });

  const crowns: THREE.Group[] = [];

  palmPositions.forEach(([px, pz], idx) => {
    const py = evaluateSeabedHeight(px, pz);
    if (py < WATER_LEVEL + 0.08) return;

    const treeGroup = new THREE.Group();
    treeGroup.position.set(px, py, pz);
    root.add(treeGroup);

    const height = 0.88 + (idx % 3) * 0.16;
    const tilt = (idx % 2 === 0 ? 1 : -1) * 0.1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, height, 7), trunkMat);
    trunk.position.y = height / 2;
    trunk.rotation.z = tilt;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const crown = new THREE.Group();
    crown.position.set(-Math.sin(tilt) * height, height, 0);
    treeGroup.add(crown);
    crowns.push(crown);

    const frondCount = 8;
    for (let f = 0; f < frondCount; f++) {
      const angle = (f / frondCount) * Math.PI * 2 + idx * 0.4;
      const frondGroup = new THREE.Group();
      frondGroup.rotation.y = angle;
      crown.add(frondGroup);

      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.46), leafMat);
      blade.position.set(0, -0.04, 0.22);
      blade.rotation.x = 0.36;
      blade.castShadow = true;
      frondGroup.add(blade);
    }
  });

  return crowns;
}

function buildSeagulls(root: THREE.Group): AnimatedIslandHandles['seagulls'] {
  const gullMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
  const gulls: AnimatedIslandHandles['seagulls'] = [];

  for (let i = 0; i < 6; i++) {
    const group = new THREE.Group();
    const wingGeo = new THREE.BoxGeometry(0.18, 0.012, 0.055);
    wingGeo.translate(0.09, 0, 0);
    const wingL = new THREE.Mesh(wingGeo, gullMat);
    const wingR = new THREE.Mesh(wingGeo, gullMat);
    wingR.scale.x = -1;
    group.add(wingL, wingR);
    root.add(group);

    gulls.push({
      group,
      wingL,
      wingR,
      cx: -1.0 + (i - 2.5) * 2.2,
      cz: -0.5 + (i % 2) * 2.4,
      y: 3.4 + (i % 3) * 0.5,
      rx: 2.6 + (i % 3) * 0.8,
      rz: 1.9 + (i % 2) * 0.7,
      speed: 0.52 + i * 0.07,
      phase: i * 1.2,
    });
  }

  return gulls;
}

function buildUnderwaterEcosystem(root: THREE.Group): {
  kelpStrands: THREE.Mesh[];
  swimmers: AnimatedIslandHandles['swimmers'];
} {
  const kelpStrands: THREE.Mesh[] = [];
  const swimmers: AnimatedIslandHandles['swimmers'] = [];

  const rockColors = ['#4d7c6f', '#3d695d', '#5c8c7e', '#64827a'];
  const coralColors = ['#e06d53', '#eab308', '#a855f7', '#ec4899', '#2dd4bf'];
  const kelpMat = new THREE.MeshStandardMaterial({ color: '#1f6f54', roughness: 0.75 });

  // Scatter 145 reef rocks, corals, and kelp organically across the entire 2D seabed using uncorrelated primes!
  for (let i = 1; i <= 145; i++) {
    const u = fractHash(i * 127.1 + 19.7) * 20.4 - 10.2;
    const v = fractHash(i * 311.7 + 73.3) * 20.4 - 10.2;
    const bedY = evaluateSeabedHeight(u, v);

    if (bedY < WATER_LEVEL - 0.22) {
      if (i % 5 === 0) {
        const cMat = new THREE.MeshStandardMaterial({
          color: coralColors[i % coralColors.length],
          roughness: 0.68,
        });
        const r = 0.11 + (i % 4) * 0.045;
        const coral = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), cMat);
        coral.position.set(u, bedY + r * 0.4, v);
        coral.scale.y = 0.62;
        coral.castShadow = true;
        coral.receiveShadow = true;
        root.add(coral);
      } else if (i % 5 !== 4) {
        const rMat = new THREE.MeshStandardMaterial({
          color: rockColors[i % rockColors.length],
          roughness: 0.9,
        });
        const r = 0.12 + (i % 5) * 0.055;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rMat);
        rock.position.set(u, bedY + r * 0.3, v);
        rock.scale.set(1.25, 0.48, 1.0);
        rock.rotation.y = i * 1.1;
        rock.castShadow = true;
        rock.receiveShadow = true;
        root.add(rock);
      } else {
        const kh = Math.min(0.85, (WATER_LEVEL - bedY) * 0.52);
        const kGeo = new THREE.CylinderGeometry(0.014, 0.028, kh, 5, 3);
        kGeo.translate(0, kh / 2, 0);
        const kelp = new THREE.Mesh(kGeo, kelpMat);
        kelp.position.set(u, bedY, v);
        root.add(kelp);
        kelpStrands.push(kelp);
      }
    }
  }

  const sharkMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.4 });
  const fishColors = ['#f97316', '#facc15', '#38bdf8', '#fb7185'];

  for (let s = 0; s < 2; s++) {
    const sharkGroup = new THREE.Group();
    const sharkBody = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.82, 10), sharkMat);
    sharkBody.rotation.x = Math.PI / 2;
    sharkBody.castShadow = true;
    const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 4), sharkMat);
    dorsalFin.position.set(0, 0.1, -0.04);
    sharkGroup.add(sharkBody, dorsalFin);
    root.add(sharkGroup);

    swimmers.push({
      mesh: sharkGroup,
      centerX: -1.8 + s * 3.2,
      centerZ: 2.6 + s * 2.0,
      y: 0.68 - s * 0.22,
      radiusX: 2.6,
      radiusZ: 1.9,
      speed: 0.45 + s * 0.08,
      phase: s * 2.5,
    });
  }

  for (let f = 0; f < 12; f++) {
    const fishGroup = new THREE.Group();
    const fMat = new THREE.MeshStandardMaterial({
      color: fishColors[f % fishColors.length],
      roughness: 0.35,
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 8), fMat);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    fishGroup.add(body);
    root.add(fishGroup);

    swimmers.push({
      mesh: fishGroup,
      centerX: -3.2 + (f % 4) * 2.1,
      centerZ: 1.6 + (f % 3) * 2.0,
      y: 0.82 - (f % 3) * 0.22,
      radiusX: 1.4 + (f % 3) * 0.45,
      radiusZ: 1.2 + (f % 2) * 0.5,
      speed: 0.72 + (f % 4) * 0.12,
      phase: f * 0.85,
    });
  }

  return { kelpStrands, swimmers };
}
