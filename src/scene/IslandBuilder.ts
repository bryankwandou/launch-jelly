import * as THREE from 'three';
import {
  BLOCK_BOTTOM_Y,
  BLOCK_HALF_SIZE,
  WATER_LEVEL,
  evaluateSeabedHeight,
} from './JellyShaders';
import { SCENE_PALETTE } from '../config/designTokens';

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

  // 1. HIGH-RESOLUTION TERRAIN & SEABED MESH WITH CAUSTICS + SHADOWS
  const topGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  topGeo.rotateX(-Math.PI / 2);

  const posAttr = topGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const cDrySand = new THREE.Color('#e8dfc8');
  const cWetSand = new THREE.Color('#cdbda0');
  const cGrass = new THREE.Color('#6b8c4e');
  const cGrassDark = new THREE.Color('#4f6d38');
  const cConcrete = new THREE.Color('#d2cfc8');
  const cRoad = new THREE.Color('#a8a49c');
  const cSeabedSand = new THREE.Color('#d8e2d6');
  const cTemp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = evaluateSeabedHeight(x, z);
    posAttr.setY(i, y);

    const n = pseudoNoise(x, z);
    if (y > WATER_LEVEL + 0.16) {
      const onPadApron = x > -7.2 && x < 5.4 && z > -7.6 && z < -4.2;
      const onPierApron = x > 2.2 && x < 9.2 && z > -3.8 && z < -1.15;
      const onLZApron = Math.hypot(x - -5.8, z - -1.2) < 1.85;
      const onRoad =
        (Math.abs(z - -3.2) < 0.38 && x > -6.5 && x < 5.5) ||
        (Math.abs(x - -5.8) < 0.38 && z > -5.5 && z < -1.0);

      if (onPadApron || onPierApron || onLZApron) {
        cTemp.copy(cConcrete).offsetHSL(0, 0, n * 0.018);
      } else if (onRoad) {
        cTemp.copy(cRoad).offsetHSL(0, 0, n * 0.015);
      } else {
        // Natural coastal grass patches mixed with warm white/cream island sand
        const grassNoise = pseudoNoise(x * 0.65 + 1.2, z * 0.65 - 0.8);
        const elevationFactor = THREE.MathUtils.smoothstep(y, WATER_LEVEL + 0.25, WATER_LEVEL + 0.56);
        const grassMask = THREE.MathUtils.smoothstep(grassNoise + elevationFactor * 0.55, 0.22, 0.65);
        cTemp.copy(cDrySand).lerp(n > 0 ? cGrass : cGrassDark, grassMask * 0.88);
        cTemp.offsetHSL(0, 0, n * 0.025);
      }
    } else if (y > WATER_LEVEL - 0.08) {
      const t = THREE.MathUtils.smoothstep(y, WATER_LEVEL - 0.08, WATER_LEVEL + 0.16);
      cTemp.copy(cWetSand).lerp(cDrySand, t);
    } else {
      // Bright sandy seabed so the shader's Beer-Lambert jelly color & caustics pop vividly!
      cTemp.copy(cSeabedSand).offsetHSL(0, 0, n * 0.03);
    }

    colors[i * 3] = cTemp.r;
    colors[i * 3 + 1] = cTemp.g;
    colors[i * 3 + 2] = cTemp.b;
  }

  topGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  topGeo.computeVertexNormals();

  const topMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.02,
  });

  // Inject real-time underwater Jelly Beer-Lambert absorption + high-frequency sparkling Voronoi caustics
  // directly onto the shadow-receiving seabed mesh!
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
          vec2 i = floor(p);
          vec2 f = fract(p);
          float dMin = 1.0;
          float dSec = 1.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 nb = vec2(float(x), float(y));
              vec2 cellId = i + nb;
              float h = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
              vec2 pt = nb + 0.5 + 0.42 * sin(t * 1.75 + 6.2831 * h + vec2(0.0, 1.57));
              float d = length(f - pt);
              if (d < dMin) {
                dSec = dMin;
                dMin = d;
              } else if (d < dSec) {
                dSec = d;
              }
            }
          }
          // Sharp ridge along Voronoi cell boundaries (true optical water caustic web!)
          float edge = clamp(1.0 - (dSec - dMin) * 3.8, 0.0, 1.0);
          return pow(edge, 2.6);
        }
        `
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */ `
        float waterDepth = ${WATER_LEVEL.toFixed(2)} - vCustomLocalPos.y;
        if (waterDepth > 0.0) {
          float depthNorm = clamp(waterDepth / 3.8, 0.0, 1.0);
          float entryBlend = smoothstep(0.0, 0.14, waterDepth);

          // Rich Beer-Lambert jelly volume tint on the sandy floor
          vec3 jellyBedTint = mix(uShallowColor, uDeepColor, pow(depthNorm, 0.72));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * jellyBedTint * 1.28, entryBlend * 0.88);

          // Dual-scale interferometric Voronoi caustic web dancing across the seabed
          vec2 uv = vCustomLocalPos.xz * 0.92;
          float c1 = causticCell(uv * 1.15 + vec2(uTime * 0.14, -uTime * 0.11), uTime);
          float c2 = causticCell(uv * 1.75 - vec2(uTime * 0.10, uTime * 0.15), uTime * 1.25);
          float causticWeb = (c1 * 0.65 + c2 * 0.55) * entryBlend * (1.0 - depthNorm * 0.35) * (1.0 - uStorm * 0.6);

          gl_FragColor.rgb += uCausticColor * causticWeb * 0.58;
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

  // 3. SPACEPORT ARCHITECTURE (HANGAR, RAILS, LAUNCH COMPLEX 1, SCOREBOARD, LZ-1, HARBOUR PIER & CRANE)
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
  const yRows = 32;
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

  const cChalk = new THREE.Color('#e8e2d5');
  const cSandstone = new THREE.Color('#d2c0a0');
  const cOchre = new THREE.Color('#b89972');
  const cTerracotta = new THREE.Color('#a37b5c');
  const cShale = new THREE.Color('#786c61');
  const cBedrock = new THREE.Color('#524b44');
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
      const waveFold = Math.sin(wx * 0.25 + wz * 0.22) * 0.18;
      const d = depthBelowSurface + waveFold;
      const striation = Math.sin(wy * 14.0) * 0.025 + Math.cos(wy * 29.0) * 0.015;

      if (d < 0.42) {
        cTemp.copy(cChalk);
      } else if (d < 1.15) {
        cTemp.copy(cSandstone);
      } else if (d < 1.95) {
        cTemp.copy(cOchre);
      } else if (d < 2.75) {
        cTemp.copy(cTerracotta);
      } else if (d < 3.65) {
        cTemp.copy(cShale);
      } else {
        cTemp.copy(cBedrock);
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
      roughness: 0.9,
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
    new THREE.MeshStandardMaterial({ color: '#47423c', roughness: 0.95 })
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

  const concreteMat = new THREE.MeshStandardMaterial({ color: '#d0cdc4', roughness: 0.85 });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.48, metalness: 0.18 });
  const slateTrimMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.45 });
  const windowMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.2, metalness: 0.8 });
  const interiorMat = new THREE.MeshStandardMaterial({ color: '#1e242d', roughness: 0.8 });

  // Concrete apron beneath Hangar and Crawlerway
  const padSlab = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.16, 3.1), concreteMat);
  padSlab.position.set(2.8, 0.04, 0);
  padSlab.receiveShadow = true;
  padSlab.castShadow = true;
  hangarGroup.add(padSlab);

  const hLen = 4.2;
  const hWid = 2.15;
  const hHei = 1.48;

  // Hangar Walls
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, hHei, hWid), wallMat);
  backWall.position.set(-hLen / 2, hHei / 2 + 0.1, 0);
  backWall.castShadow = true;
  hangarGroup.add(backWall);

  const northWall = new THREE.Mesh(new THREE.BoxGeometry(hLen, hHei, 0.14), wallMat);
  northWall.position.set(0, hHei / 2 + 0.1, -hWid / 2);
  northWall.castShadow = true;
  hangarGroup.add(northWall);

  const southWall = new THREE.Mesh(new THREE.BoxGeometry(hLen, hHei, 0.14), wallMat);
  southWall.position.set(0, hHei / 2 + 0.1, hWid / 2);
  southWall.castShadow = true;
  hangarGroup.add(southWall);

  // Horizontal glazed Clerestory Window strips along South wall
  for (let w = -4; w <= 4; w++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.16), windowMat);
    win.position.set(w * 0.42, hHei * 0.72, hWid / 2);
    hangarGroup.add(win);
  }

  // Stepped Arched Roof with External Structural Portal Frames (matching crop_top_island.png)
  const roofLower = new THREE.Mesh(new THREE.BoxGeometry(hLen + 0.12, 0.14, hWid + 0.16), wallMat);
  roofLower.position.set(0, hHei + 0.14, 0);
  roofLower.castShadow = true;
  hangarGroup.add(roofLower);

  const roofCrown = new THREE.Mesh(new THREE.BoxGeometry(hLen - 0.1, 0.16, hWid * 0.62), slateTrimMat);
  roofCrown.position.set(0, hHei + 0.26, 0);
  roofCrown.castShadow = true;
  hangarGroup.add(roofCrown);

  for (let r = -4; r <= 4; r++) {
    const rx = r * 0.48;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, hHei + 0.24, hWid + 0.22), slateTrimMat);
    rib.position.set(rx, hHei / 2 + 0.14, 0);
    hangarGroup.add(rib);
  }

  // Open Front Portal Frame on +X face
  const portalTop = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, hWid + 0.24), slateTrimMat);
  portalTop.position.set(hLen / 2, hHei + 0.18, 0);
  hangarGroup.add(portalTop);

  // Interior Dark Floor
  const intFloor = new THREE.Mesh(new THREE.BoxGeometry(hLen - 0.2, 0.04, hWid - 0.2), interiorMat);
  intFloor.position.set(0, 0.13, 0);
  hangarGroup.add(intFloor);

  // Bi-parting Hangar Doors
  const doorMat = new THREE.MeshStandardMaterial({ color: '#3b4659', roughness: 0.5, metalness: 0.4 });
  const hangarDoorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, hHei - 0.08, hWid * 0.46), doorMat);
  hangarDoorLeft.position.set(hLen / 2, hHei / 2 + 0.1, -hWid * 0.24);
  hangarGroup.add(hangarDoorLeft);

  const hangarDoorRight = new THREE.Mesh(new THREE.BoxGeometry(0.1, hHei - 0.08, hWid * 0.46), doorMat);
  hangarDoorRight.position.set(hLen / 2, hHei / 2 + 0.1, hWid * 0.24);
  hangarGroup.add(hangarDoorRight);

  // Secondary Support Building + White Crew Transport Bus in front of Hangar
  const annex = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.68, 1.15), wallMat);
  annex.position.set(-1.3, 0.38, 2.15);
  annex.castShadow = true;
  annex.receiveShadow = true;
  hangarGroup.add(annex);

  const annexRoof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 1.22), concreteMat);
  annexRoof.position.set(-1.3, 0.75, 2.15);
  hangarGroup.add(annexRoof);

  const crewBus = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.26, 0.32), wallMat);
  crewBus.position.set(-1.2, 0.22, 1.25);
  crewBus.castShadow = true;
  hangarGroup.add(crewBus);

  // Twin Steel Crawler Rails leading to Launch Complex 1 (at x = +1.8, dx = 6.0)
  const railMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.35, metalness: 0.78 });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: '#645344', roughness: 0.9 });

  [-0.32, 0.32].forEach((rz) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.05, 0.06), railMat);
    rail.position.set(3.1, 0.15, rz);
    hangarGroup.add(rail);
  });

  for (let s = 0; s < 24; s++) {
    const sx = 0.2 + s * 0.26;
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.88), sleeperMat);
    sleeper.position.set(sx, 0.13, 0);
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

  const concreteMat = new THREE.MeshStandardMaterial({ color: '#bcb8b0', roughness: 0.82 });
  const darkTrenchMat = new THREE.MeshStandardMaterial({ color: '#272a30', roughness: 0.9 });
  const redMat = new THREE.MeshStandardMaterial({ color: '#d93829', roughness: 0.42 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f5f4f0', roughness: 0.38 });
  const blueMat = new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.4 });
  const steelMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.45, metalness: 0.6 });

  // Sloped Concrete Launch Pad Pyramid & Flame Trench Chute extending toward the shore (+Z)
  const padPyramid = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.55, 0.54, 4), concreteMat);
  padPyramid.rotation.y = Math.PI / 4;
  padPyramid.position.set(0, 0.32, 0);
  padPyramid.castShadow = true;
  padPyramid.receiveShadow = true;
  lcGroup.add(padPyramid);

  const flameChute = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 2.35), darkTrenchMat);
  flameChute.position.set(0, 0.18, 0.85);
  flameChute.rotation.x = 0.08;
  lcGroup.add(flameChute);

  const chuteWalls = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.32, 2.15), concreteMat);
  chuteWalls.position.set(0, 0.17, 0.85);
  chuteWalls.receiveShadow = true;
  lcGroup.add(chuteWalls);

  // 4 Tall Slender Red-and-White Lightning Arrestor Towers + Catenary Wires
  const towerOffsets = [
    [-1.42, -1.28],
    [1.42, -1.28],
    [1.42, 1.28],
    [-1.42, 1.28],
  ];
  const towerHeight = 5.2;
  const towerTops: THREE.Vector3[] = [];

  towerOffsets.forEach(([tx, tz]) => {
    const tGroup = new THREE.Group();
    tGroup.position.set(tx, 0.1, tz);
    lcGroup.add(tGroup);

    // Lattice tripod base legs
    for (let leg = 0; leg < 3; leg++) {
      const a = (leg * Math.PI * 2) / 3;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.9, 6), steelMat);
      strut.position.set(Math.cos(a) * 0.12, 0.42, Math.sin(a) * 0.12);
      strut.rotation.z = Math.cos(a) * 0.14;
      strut.rotation.x = -Math.sin(a) * 0.14;
      tGroup.add(strut);
    }

    const bands = 9;
    const bH = towerHeight / bands;
    for (let b = 0; b < bands; b++) {
      const rBot = THREE.MathUtils.lerp(0.068, 0.018, b / bands);
      const rTop = THREE.MathUtils.lerp(0.068, 0.018, (b + 1) / bands);
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBot, bH, 8),
        b % 2 === 0 ? whiteMat : redMat
      );
      seg.position.y = b * bH + bH / 2;
      seg.castShadow = true;
      tGroup.add(seg);
    }

    const finSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.016, 0.75, 6), whiteMat);
    finSpire.position.y = towerHeight + 0.36;
    tGroup.add(finSpire);

    towerTops.push(new THREE.Vector3(tx, towerHeight + 0.68, tz));
  });

  // Delicate Catenary Arrestor Cables
  const wireMat = new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.58 });
  for (let i = 0; i < 4; i++) {
    const pA = towerTops[i];
    const pB = towerTops[(i + 1) % 4];
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 16; s++) {
      const t = s / 16;
      const p = new THREE.Vector3().lerpVectors(pA, pB, t);
      p.y -= Math.sin(t * Math.PI) * 0.32;
      pts.push(p);
    }
    lcGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }

  // Blue-and-White Spherical Water Deluge Tower on 4 Lattice Legs (left of pad, matching crop_top_island.png)
  const wtGroup = new THREE.Group();
  wtGroup.position.set(-1.15, 0.1, -0.55);
  lcGroup.add(wtGroup);

  const wtSphere = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), whiteMat);
  wtSphere.position.y = 2.05;
  wtSphere.scale.y = 0.85;
  wtSphere.castShadow = true;
  wtGroup.add(wtSphere);

  const wtBand = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.14, 20), blueMat);
  wtBand.position.y = 2.05;
  wtGroup.add(wtBand);

  const wtRiser = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.9, 10), whiteMat);
  wtRiser.position.y = 0.95;
  wtRiser.castShadow = true;
  wtGroup.add(wtRiser);

  for (let l = 0; l < 4; l++) {
    const a = (l * Math.PI) / 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 1.95, 6), steelMat);
    leg.position.set(Math.cos(a) * 0.22, 0.95, Math.sin(a) * 0.22);
    leg.rotation.z = Math.cos(a) * 0.06;
    leg.rotation.x = -Math.sin(a) * 0.06;
    wtGroup.add(leg);
  }

  // Cryogenic White LOX Sphere + Horizontal RP-1 Tank East of the Pad
  const loxSphere = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 20), whiteMat);
  loxSphere.position.set(2.35, 0.58, -0.45);
  loxSphere.castShadow = true;
  lcGroup.add(loxSphere);

  const rpTank = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.25, 16), whiteMat);
  rpTank.rotation.z = Math.PI / 2;
  rpTank.position.set(2.15, 0.32, 0.35);
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
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.46, 0.1), frameMat);
  frame.position.y = 0.52;
  frame.castShadow = true;
  boardGroup.add(frame);

  [-0.4, 0.4].forEach((px) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), frameMat);
    post.position.set(px, 0.26, 0);
    boardGroup.add(post);
  });

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.38),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  screen.position.set(0, 0.52, 0.055);
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

  const padMat = new THREE.MeshStandardMaterial({ color: '#d2cfc6', roughness: 0.8 });
  const padDisk = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.22, 0.08, 32), padMat);
  padDisk.position.y = 0.04;
  padDisk.receiveShadow = true;
  padDisk.name = 'landing_pad_target';
  lzGroup.add(padDisk);

  const ringMat = new THREE.MeshBasicMaterial({ color: '#64748b', side: THREE.DoubleSide });
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 0.92, 32), ringMat);
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.085;
  lzGroup.add(targetRing);

  const xMarkMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  [-1, 1].forEach((dir) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.01, 0.09), xMarkMat);
    bar.position.y = 0.086;
    bar.rotation.y = (dir * Math.PI) / 4;
    lzGroup.add(bar);
  });

  // Red Range Fire Truck parked near LZ-1 (matching crop_top_island.png)
  const fireTruck = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.16, 0.18),
    new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.4 })
  );
  fireTruck.position.set(1.45, 0.12, 0.15);
  fireTruck.rotation.y = -0.3;
  fireTruck.castShadow = true;
  lzGroup.add(fireTruck);

  // White Tracking Station Building + Solar Array + Rotating Radar Dish on West Spit
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.45 });
  const radarBldg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.48, 0.72), whiteMat);
  radarBldg.position.set(-2.6, 0.26, 1.1);
  radarBldg.rotation.y = 0.35;
  radarBldg.castShadow = true;
  lzGroup.add(radarBldg);

  // Solar panels next to tracking station
  const solarMat = new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.25, metalness: 0.7 });
  for (let s = 0; s < 3; s++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.03, 0.28), solarMat);
    panel.position.set(-3.45, 0.16, 1.0 + s * 0.36);
    panel.rotation.x = 0.35;
    lzGroup.add(panel);
  }

  // Rotating Radar Dish
  const radarPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, 0.42, 12),
    whiteMat
  );
  radarPedestal.position.set(-2.1, 0.22, -0.35);
  lzGroup.add(radarPedestal);

  const radarDish = new THREE.Group();
  radarDish.position.set(-2.1, 0.5, -0.35);
  lzGroup.add(radarDish);

  const dishBowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, side: THREE.DoubleSide })
  );
  dishBowl.rotation.x = -Math.PI * 0.68;
  dishBowl.castShadow = true;
  radarDish.add(dishBowl);

  // Wind Sock Mast
  const poleMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.6, roughness: 0.3 });
  const windPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.05, 8), poleMat);
  windPole.position.set(-0.95, 0.52, 1.15);
  lzGroup.add(windPole);

  const windSockPivot = new THREE.Group();
  windSockPivot.position.set(-0.95, 1.02, 1.15);
  lzGroup.add(windSockPivot);

  const sockGeo = new THREE.ConeGeometry(0.085, 0.42, 10, 1, true);
  sockGeo.rotateZ(-Math.PI / 2);
  sockGeo.translate(0.21, 0, 0);
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

  const concreteMat = new THREE.MeshStandardMaterial({ color: '#c8c5bc', roughness: 0.82 });
  const darkPilingMat = new THREE.MeshStandardMaterial({ color: '#272c35', roughness: 0.88 });
  const yellowMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.4, metalness: 0.3 });
  const orangeRedMat = new THREE.MeshStandardMaterial({ color: '#dc4a26', roughness: 0.42, metalness: 0.25 });
  const whiteTrussMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.4, metalness: 0.5 });

  // Heavy Concrete Pier Apron with Vertical Fender Pilings along the Quay Wall (matching crop_top_island.png)
  const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.72, 2.2), concreteMat);
  quayDeck.position.set(0, -0.22, 0.25);
  quayDeck.castShadow = true;
  quayDeck.receiveShadow = true;
  pierGroup.add(quayDeck);

  for (let i = -8; i <= 8; i++) {
    const fx = i * 0.32;
    const piling = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.09), darkPilingMat);
    piling.position.set(fx, -0.2, 1.38);
    pierGroup.add(piling);
  }

  // Two Yellow Portal Straddle Frames on the Pier (matching crop_top_island.png)
  [-1.85, 1.85].forEach((gx) => {
    const gFrame = new THREE.Group();
    gFrame.position.set(gx, 0.14, 0.65);
    pierGroup.add(gFrame);

    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.42), yellowMat);
    topBar.position.y = 0.42;
    topBar.castShadow = true;
    gFrame.add(topBar);

    [
      [-0.24, -0.18],
      [0.24, -0.18],
      [-0.24, 0.18],
      [0.24, 0.18],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), yellowMat);
      leg.position.set(lx, 0.21, lz);
      gFrame.add(leg);
    });
  });

  // Port Warehouse Building behind the crane
  const warehouse = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.68, 0.95),
    new THREE.MeshStandardMaterial({ color: '#e2e0d8', roughness: 0.6 })
  );
  warehouse.position.set(0.85, 0.48, -0.55);
  warehouse.castShadow = true;
  warehouse.receiveShadow = true;
  pierGroup.add(warehouse);

  // Detailed Open-Lattice Truss Port Crane (matching crop_top_island.png: red cab + tall angled lattice boom!)
  const craneBase = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.28, 0.88), darkPilingMat);
  craneBase.position.set(-0.35, 0.28, 0.55);
  craneBase.castShadow = true;
  pierGroup.add(craneBase);

  const craneTurret = new THREE.Group();
  craneTurret.position.set(-0.35, 0.42, 0.55);
  pierGroup.add(craneTurret);

  // Orange-Red Rotating Machinery Cab
  const cabBody = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.52, 0.82), orangeRedMat);
  cabBody.position.set(0, 0.26, -0.08);
  cabBody.castShadow = true;
  craneTurret.add(cabBody);

  // Angled Open-Lattice Truss Boom (4 corner chords + cross bracing rungs)
  const boomGroup = new THREE.Group();
  boomGroup.position.set(0, 0.42, 0.18);
  boomGroup.rotation.x = 0.34; // Tilted forward over the water
  craneTurret.add(boomGroup);

  const boomLength = 5.4;
  const chordOffsets = [
    [-0.14, -0.14],
    [0.14, -0.14],
    [0.14, 0.14],
    [-0.14, 0.14],
  ];

  chordOffsets.forEach(([cx, cz]) => {
    // Lower red section
    const lowChord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.024, boomLength * 0.35, 6),
      orangeRedMat
    );
    lowChord.position.set(cx, boomLength * 0.175, cz);
    lowChord.castShadow = true;
    boomGroup.add(lowChord);

    // Upper white lattice section
    const highChord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.018, boomLength * 0.65, 6),
      whiteTrussMat
    );
    highChord.position.set(cx * 0.85, boomLength * 0.675, cz * 0.85);
    highChord.castShadow = true;
    boomGroup.add(highChord);
  });

  // Lattice cross-rungs along the boom
  for (let r = 1; r <= 14; r++) {
    const ry = (r / 14) * boomLength;
    const mat = r <= 5 ? orangeRedMat : whiteTrussMat;
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.28), mat);
    rung.position.set(0, ry, 0);
    boomGroup.add(rung);
  }

  // Crane Hoist Trolley at tip of angled boom (y = cos(0.34)*5.4 = 5.09, z = 0.18 + sin(0.34)*5.4 = 1.98)
  const craneTrolley = new THREE.Group();
  craneTrolley.position.set(0, 5.15, 1.98);
  craneTurret.add(craneTrolley);

  const cableGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.0, 6);
  cableGeo.translate(0, -0.5, 0);
  const craneCable = new THREE.Mesh(cableGeo, darkPilingMat);
  craneCable.scale.y = 1.65;
  craneTrolley.add(craneCable);

  const craneSpreader = new THREE.Group();
  craneSpreader.position.set(0, -1.65, 0);
  craneTrolley.add(craneSpreader);

  const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.18), yellowMat);
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
    color: '#4d7c3f',
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

    const height = 0.95 + (idx % 3) * 0.18;
    const tilt = (idx % 2 === 0 ? 1 : -1) * 0.11;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.055, height, 7), trunkMat);
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

      // Arched palm frond blade
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.52), leafMat);
      blade.position.set(0, -0.04, 0.25);
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
    const wingGeo = new THREE.BoxGeometry(0.2, 0.014, 0.06);
    wingGeo.translate(0.1, 0, 0);
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
      y: 3.6 + (i % 3) * 0.55,
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

  const rockColors = ['#476359', '#3b5249', '#526e63', '#64748b'];
  const coralColors = ['#e06d53', '#eab308', '#a855f7', '#ec4899', '#2dd4bf'];
  const kelpMat = new THREE.MeshStandardMaterial({ color: '#1f6f54', roughness: 0.75 });

  // Scatter 95 reef boulders, coral heads, and kelp stalks across the entire underwater lagoon (matching crop_top_island.png!)
  for (let i = 0; i < 95; i++) {
    // Halton/golden-ratio quasi-random distribution across [-10.2, 10.2]
    const u = ((i * 0.6180339887) % 1) * 20.4 - 10.2;
    const v = ((i * 0.3819660112) % 1) * 20.4 - 10.2;
    const bedY = evaluateSeabedHeight(u, v);

    if (bedY < WATER_LEVEL - 0.25) {
      if (i % 4 === 0) {
        // Reef Coral Dome
        const cMat = new THREE.MeshStandardMaterial({
          color: coralColors[i % coralColors.length],
          roughness: 0.68,
        });
        const r = 0.14 + (i % 4) * 0.055;
        const coral = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), cMat);
        coral.position.set(u, bedY + r * 0.45, v);
        coral.scale.y = 0.65;
        coral.castShadow = true;
        coral.receiveShadow = true;
        root.add(coral);
      } else if (i % 4 === 1 || i % 4 === 2) {
        // Reef Rock / Patch
        const rMat = new THREE.MeshStandardMaterial({
          color: rockColors[i % rockColors.length],
          roughness: 0.9,
        });
        const r = 0.16 + (i % 5) * 0.065;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rMat);
        rock.position.set(u, bedY + r * 0.35, v);
        rock.scale.set(1.2, 0.55, 1.0);
        rock.rotation.y = i * 1.1;
        rock.castShadow = true;
        rock.receiveShadow = true;
        root.add(rock);
      } else {
        // Swaying Kelp Stalk
        const kh = Math.min(1.15, (WATER_LEVEL - bedY) * 0.58);
        const kGeo = new THREE.CylinderGeometry(0.016, 0.035, kh, 5, 3);
        kGeo.translate(0, kh / 2, 0);
        const kelp = new THREE.Mesh(kGeo, kelpMat);
        kelp.position.set(u, bedY, v);
        root.add(kelp);
        kelpStrands.push(kelp);
      }
    }
  }

  // Marine Swimmers inside the translucent jelly volume (Sharks, Manta Ray, School of Fish)
  const sharkMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.4 });
  const fishColors = ['#f97316', '#facc15', '#38bdf8', '#fb7185'];

  // 2 Reef Sharks cruising the central lagoon
  for (let s = 0; s < 2; s++) {
    const sharkGroup = new THREE.Group();
    const sharkBody = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.95, 10), sharkMat);
    sharkBody.rotation.x = Math.PI / 2;
    sharkBody.castShadow = true;
    const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.22, 4), sharkMat);
    dorsalFin.position.set(0, 0.12, -0.05);
    sharkGroup.add(sharkBody, dorsalFin);
    root.add(sharkGroup);

    swimmers.push({
      mesh: sharkGroup,
      centerX: -1.5 + s * 3.5,
      centerZ: 2.8 + s * 2.2,
      y: 0.45 - s * 0.35,
      radiusX: 2.8,
      radiusZ: 2.1,
      speed: 0.45 + s * 0.08,
      phase: s * 2.5,
    });
  }

  // 10 Tropical Reef Fish
  for (let f = 0; f < 10; f++) {
    const fishGroup = new THREE.Group();
    const fMat = new THREE.MeshStandardMaterial({
      color: fishColors[f % fishColors.length],
      roughness: 0.35,
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 8), fMat);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    fishGroup.add(body);
    root.add(fishGroup);

    swimmers.push({
      mesh: fishGroup,
      centerX: -3.2 + (f % 4) * 2.2,
      centerZ: 1.8 + (f % 3) * 2.1,
      y: 0.65 - (f % 3) * 0.32,
      radiusX: 1.4 + (f % 3) * 0.45,
      radiusZ: 1.2 + (f % 2) * 0.5,
      speed: 0.72 + (f % 4) * 0.12,
      phase: f * 0.85,
    });
  }

  return { kelpStrands, swimmers };
}
