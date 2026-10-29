import * as THREE from 'three';
import {
  BLOCK_BOTTOM_Y,
  BLOCK_HALF_SIZE,
  WATER_LEVEL,
  evaluateSeabedHeight,
} from './JellyShaders';
import { SCENE_PALETTE } from '../config/designTokens';

export interface AnimatedIslandHandles {
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

/**
 * Generates a subtle procedural noise value in [-1, 1]
 */
function pseudoNoise(x: number, y: number): number {
  return (
    Math.sin(x * 1.37 + y * 2.41) * 0.5 +
    Math.cos(x * 3.13 - y * 1.79) * 0.3 +
    Math.sin(x * 6.1 + y * 5.3) * 0.2
  );
}

export function buildIslandAndSeabed(root: THREE.Group): AnimatedIslandHandles {
  const segs = 120;
  const size = BLOCK_HALF_SIZE * 2;

  // 1. TOP TERRAIN & SEABED SURFACE MESH
  const topGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  topGeo.rotateX(-Math.PI / 2);

  const posAttr = topGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);

  const cDrySand = new THREE.Color(SCENE_PALETTE.sandDry);
  const cWetSand = new THREE.Color(SCENE_PALETTE.sandWet);
  const cGrass = new THREE.Color('#708a58');
  const cDeepSand = new THREE.Color('#6f7d65');
  const cAbyss = new THREE.Color('#475649');
  const cConcrete = new THREE.Color('#c7c4bc');
  const cTemp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = evaluateSeabedHeight(x, z);
    posAttr.setY(i, y);

    const n = pseudoNoise(x, z) * 0.04;
    if (y > WATER_LEVEL + 0.32) {
      // Check if near concrete apron (hangar, pad, pier, landing zone)
      const onPadApron = x > -7.2 && x < 5.6 && z > -7.5 && z < -3.8;
      const onPierApron = x > 2.8 && x < 8.4 && z > -4.2 && z < -0.85;
      const onLZApron = Math.hypot(x - -6.8, z - 0.8) < 2.25;

      if (onPadApron || onPierApron || onLZApron) {
        cTemp.copy(cConcrete).offsetHSL(0, 0, n * 0.35);
      } else {
        const grassMask = THREE.MathUtils.smoothstep(y, WATER_LEVEL + 0.36, WATER_LEVEL + 0.65);
        cTemp.copy(cDrySand).lerp(cGrass, grassMask * 0.68).offsetHSL(0, 0, n);
      }
    } else if (y > WATER_LEVEL - 0.18) {
      const wetT = THREE.MathUtils.smoothstep(y, WATER_LEVEL - 0.18, WATER_LEVEL + 0.32);
      cTemp.copy(cWetSand).lerp(cDrySand, wetT).offsetHSL(0, 0, n * 0.6);
    } else {
      const depthT = THREE.MathUtils.clamp((WATER_LEVEL - y) / 5.2, 0, 1);
      cTemp.copy(cWetSand).lerp(cDeepSand, Math.min(1, depthT * 1.5));
      if (depthT > 0.5) {
        cTemp.lerp(cAbyss, (depthT - 0.5) * 1.6);
      }
      // Subtle seabed sand ripples
      const ripple = Math.sin(x * 3.8 + z * 2.9) * 0.025 * (1 - depthT * 0.5);
      cTemp.offsetHSL(0, 0, ripple);
    }

    colors[i * 3] = cTemp.r;
    colors[i * 3 + 1] = cTemp.g;
    colors[i * 3 + 2] = cTemp.b;
  }

  topGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  topGeo.computeVertexNormals();

  const topMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.04,
  });
  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.receiveShadow = true;
  topMesh.castShadow = true;
  topMesh.name = 'island_top_terrain';
  root.add(topMesh);

  // 2. STRATIFIED GEOLOGICAL CROSS-SECTION WALLS (4 SIDES + BOTTOM CAP)
  buildStratifiedRockWalls(root, segs);

  // 3. SPACEPORT ARCHITECTURE (HANGAR, RAILS, PAD, TOWERS, TANKS, SCOREBOARD)
  const { hangarDoorLeft, hangarDoorRight } = buildHangarAndCrawlerway(root);
  buildLaunchComplexOne(root);
  const scoreboard = buildDigitalScoreboard(root);
  const { radarDish, windSockPivot, windSockCone, landingPadTargetMesh, landingPadRingMat } =
    buildLandingZoneAndRadar(root);
  const craneHandles = buildHarbourPierAndCrane(root);

  // 4. COASTAL PALM TREES & SEAGULLS
  const palmCrowns = buildPalmTrees(root);
  const seagulls = buildSeagulls(root);

  // 5. UNDERWATER CORAL REEF, KELP FOREST & MARINE SWIMMERS
  const { kelpStrands, swimmers } = buildUnderwaterEcosystem(root);

  return {
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
  const yRows = 36;
  const walls: {
    startX: number;
    startZ: number;
    endX: number;
    endZ: number;
    nx: number;
    nz: number;
  }[] = [
    // South wall (z = +11)
    { startX: -BLOCK_HALF_SIZE, startZ: BLOCK_HALF_SIZE, endX: BLOCK_HALF_SIZE, endZ: BLOCK_HALF_SIZE, nx: 0, nz: 1 },
    // North wall (z = -11)
    { startX: BLOCK_HALF_SIZE, startZ: -BLOCK_HALF_SIZE, endX: -BLOCK_HALF_SIZE, endZ: -BLOCK_HALF_SIZE, nx: 0, nz: -1 },
    // East wall (x = +11)
    { startX: BLOCK_HALF_SIZE, startZ: BLOCK_HALF_SIZE, endX: BLOCK_HALF_SIZE, endZ: -BLOCK_HALF_SIZE, nx: 1, nz: 0 },
    // West wall (x = -11)
    { startX: -BLOCK_HALF_SIZE, startZ: -BLOCK_HALF_SIZE, endX: -BLOCK_HALF_SIZE, endZ: BLOCK_HALF_SIZE, nx: -1, nz: 0 },
  ];

  const cTop = new THREE.Color('#d2c2a3');
  const cLayer1 = new THREE.Color('#b69d7c');
  const cLayer2 = new THREE.Color('#9e7e61');
  const cLayer3 = new THREE.Color('#836953');
  const cLayer4 = new THREE.Color('#695c52');
  const cBedrock = new THREE.Color('#47423d');
  const cTerracotta = new THREE.Color('#9c634f');
  const cTemp = new THREE.Color();

  walls.forEach((wall) => {
    const geo = new THREE.PlaneGeometry(BLOCK_HALF_SIZE * 2, 1, segs, yRows);
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const cols = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + BLOCK_HALF_SIZE) / (BLOCK_HALF_SIZE * 2);
      const v = pos.getY(i) + 0.5; // 0 at bottom, 1 at top

      const wx = THREE.MathUtils.lerp(wall.startX, wall.endX, u);
      const wz = THREE.MathUtils.lerp(wall.startZ, wall.endZ, u);
      const topY = evaluateSeabedHeight(wx, wz);
      const wy = THREE.MathUtils.lerp(BLOCK_BOTTOM_Y, topY, v);

      pos.setXYZ(i, wx, wy, wz);
      norm.setXYZ(i, wall.nx, 0, wall.nz);

      // Geological wave folding along the horizontal coordinate
      const fold =
        Math.sin(wx * 0.28 + wz * 0.24) * 0.32 +
        Math.cos(wx * 0.65 - wz * 0.52) * 0.12;
      const strataCoord = wy + fold;

      // Fine sedimentary banding
      const fineBand = Math.sin(strataCoord * 8.5) * 0.035 + Math.cos(strataCoord * 19.0) * 0.018;

      if (strataCoord > 0.9) {
        cTemp.copy(cTop);
      } else if (strataCoord > -0.4) {
        cTemp.copy(cLayer1);
      } else if (strataCoord > -1.5) {
        cTemp.copy(cLayer2);
      } else if (strataCoord > -2.4) {
        cTemp.copy(cTerracotta).lerp(cLayer3, 0.55);
      } else if (strataCoord > -3.7) {
        cTemp.copy(cLayer4);
      } else {
        cTemp.copy(cBedrock);
      }

      cTemp.offsetHSL(0, 0, fineBand);
      cols[i * 3] = cTemp.r;
      cols[i * 3 + 1] = cTemp.g;
      cols[i * 3 + 2] = cTemp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'block_side_wall';
    root.add(mesh);
  });

  // Bottom bedrock base plate
  const baseGeo = new THREE.PlaneGeometry(BLOCK_HALF_SIZE * 2, BLOCK_HALF_SIZE * 2);
  baseGeo.rotateX(Math.PI / 2);
  baseGeo.translate(0, BLOCK_BOTTOM_Y, 0);
  const baseMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.strataBedrock,
    roughness: 0.95,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.castShadow = true;
  root.add(baseMesh);
}

function buildHangarAndCrawlerway(root: THREE.Group): {
  hangarDoorLeft: THREE.Mesh;
  hangarDoorRight: THREE.Mesh;
} {
  const hangarGroup = new THREE.Group();
  const baseY = evaluateSeabedHeight(-5.5, -5.8);
  hangarGroup.position.set(-5.5, baseY, -5.8);
  root.add(hangarGroup);

  const concreteMat = new THREE.MeshStandardMaterial({ color: '#c8c4bc', roughness: 0.85 });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#e4e2dc', roughness: 0.55, metalness: 0.25 });
  const darkSteelMat = new THREE.MeshStandardMaterial({ color: '#27303f', roughness: 0.45, metalness: 0.55 });
  const interiorMat = new THREE.MeshStandardMaterial({ color: '#1b2028', roughness: 0.8 });
  const warmLightMat = new THREE.MeshBasicMaterial({ color: '#ffdfa0' });

  // Concrete foundation pad extending from Hangar to Launch Complex 1
  const padSlab = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.22, 3.6), concreteMat);
  padSlab.position.set(4.1, 0.05, 0);
  padSlab.receiveShadow = true;
  padSlab.castShadow = true;
  hangarGroup.add(padSlab);

  // Hangar shell (hollow on the +X east face so rocket can roll out)
  const hangarLength = 4.6;
  const hangarWidth = 2.6;
  const hangarHeight = 1.75;

  // Back wall (-X), Side walls (-Z, +Z), Roof
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.18, hangarHeight, hangarWidth), wallMat);
  backWall.position.set(-hangarLength / 2, hangarHeight / 2 + 0.14, 0);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  hangarGroup.add(backWall);

  const northWall = new THREE.Mesh(new THREE.BoxGeometry(hangarLength, hangarHeight, 0.16), wallMat);
  northWall.position.set(0, hangarHeight / 2 + 0.14, -hangarWidth / 2);
  northWall.castShadow = true;
  northWall.receiveShadow = true;
  hangarGroup.add(northWall);

  const southWall = new THREE.Mesh(new THREE.BoxGeometry(hangarLength, hangarHeight, 0.16), wallMat);
  southWall.position.set(0, hangarHeight / 2 + 0.14, hangarWidth / 2);
  southWall.castShadow = true;
  southWall.receiveShadow = true;
  hangarGroup.add(southWall);

  // Arched/pitched industrial roof with solar skylights
  const roof = new THREE.Mesh(new THREE.BoxGeometry(hangarLength + 0.2, 0.18, hangarWidth + 0.24), darkSteelMat);
  roof.position.set(0, hangarHeight + 0.2, 0);
  roof.castShadow = true;
  roof.receiveShadow = true;
  hangarGroup.add(roof);

  // Structural ribs along the hangar exterior
  for (let i = -3; i <= 3; i++) {
    const ribX = i * 0.68;
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, hangarHeight + 0.22, hangarWidth + 0.28),
      darkSteelMat
    );
    rib.position.set(ribX, hangarHeight / 2 + 0.16, 0);
    rib.castShadow = true;
    hangarGroup.add(rib);
  }

  // Interior dark bay & warm ceiling strip lights visible when doors open
  const interiorBox = new THREE.Mesh(new THREE.BoxGeometry(hangarLength - 0.3, 0.05, hangarWidth - 0.3), interiorMat);
  interiorBox.position.set(0, 0.17, 0);
  hangarGroup.add(interiorBox);

  const stripLight = new THREE.Mesh(new THREE.BoxGeometry(hangarLength - 0.6, 0.04, 0.35), warmLightMat);
  stripLight.position.set(0, hangarHeight + 0.05, 0);
  hangarGroup.add(stripLight);

  // Bi-parting Hangar Doors on the +X face
  const doorMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.5, metalness: 0.4 });
  const hangarDoorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, hangarHeight - 0.08, hangarWidth * 0.46), doorMat);
  hangarDoorLeft.position.set(hangarLength / 2, hangarHeight / 2 + 0.14, -hangarWidth * 0.24);
  hangarDoorLeft.castShadow = true;
  hangarGroup.add(hangarDoorLeft);

  const hangarDoorRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, hangarHeight - 0.08, hangarWidth * 0.46), doorMat);
  hangarDoorRight.position.set(hangarLength / 2, hangarHeight / 2 + 0.14, hangarWidth * 0.24);
  hangarDoorRight.castShadow = true;
  hangarGroup.add(hangarDoorRight);

  // Twin steel crawler rails from inside the hangar to Launch Complex 1 (dx = 0 to +9.3)
  const railMat = new THREE.MeshStandardMaterial({ color: '#525866', roughness: 0.35, metalness: 0.78 });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: '#5c4b3c', roughness: 0.9 });

  [-0.38, 0.38].forEach((rz) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.06, 0.07), railMat);
    rail.position.set(4.5, 0.19, rz);
    rail.receiveShadow = true;
    hangarGroup.add(rail);
  });

  for (let s = 0; s < 32; s++) {
    const sx = 0.2 + s * 0.28;
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 1.05), sleeperMat);
    sleeper.position.set(sx, 0.165, 0);
    hangarGroup.add(sleeper);
  }

  return { hangarDoorLeft, hangarDoorRight };
}

function buildLaunchComplexOne(root: THREE.Group): void {
  const padX = 3.8;
  const padZ = -5.8;
  const baseY = evaluateSeabedHeight(padX, padZ);

  const lcGroup = new THREE.Group();
  lcGroup.position.set(padX, baseY, padZ);
  root.add(lcGroup);

  const concreteMat = new THREE.MeshStandardMaterial({ color: '#b5b2aa', roughness: 0.85 });
  const darkTrenchMat = new THREE.MeshStandardMaterial({ color: '#26272b', roughness: 0.92 });
  const redMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.towerRed, roughness: 0.45 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.towerWhite, roughness: 0.45 });
  const tankMat = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.32, metalness: 0.25 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.4, metalness: 0.65 });

  // Elevated concrete Launch Table with flame trench
  const launchMount = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.52, 2.1), concreteMat);
  launchMount.position.set(0, 0.36, 0);
  launchMount.castShadow = true;
  launchMount.receiveShadow = true;
  lcGroup.add(launchMount);

  const flameTrench = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.34, 0.72), darkTrenchMat);
  flameTrench.position.set(0, 0.32, 0);
  lcGroup.add(flameTrench);

  // Launch ring hold-down clamps
  const clampRing = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.16, 16), darkTrenchMat);
  clampRing.position.set(0, 0.66, 0);
  lcGroup.add(clampRing);

  // 4 Tall Lightning Arrestor Towers with alternating Red/White aviation bands + Catenary wires
  const towerOffsets = [
    [-1.45, -1.35],
    [1.45, -1.35],
    [1.45, 1.35],
    [-1.45, 1.35],
  ];
  const towerHeight = 4.4;
  const towerTops: THREE.Vector3[] = [];

  towerOffsets.forEach(([tx, tz]) => {
    const tGroup = new THREE.Group();
    tGroup.position.set(tx, 0.14, tz);
    lcGroup.add(tGroup);

    const bandCount = 7;
    const bandH = towerHeight / bandCount;
    for (let b = 0; b < bandCount; b++) {
      const rBot = THREE.MathUtils.lerp(0.11, 0.03, b / bandCount);
      const rTop = THREE.MathUtils.lerp(0.11, 0.03, (b + 1) / bandCount);
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(rTop, rBot, bandH, 6),
        b % 2 === 0 ? whiteMat : redMat
      );
      seg.position.y = b * bandH + bandH / 2;
      seg.castShadow = true;
      tGroup.add(seg);
    }

    // Lightning mast spire at top
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.025, 0.65, 6), whiteMat);
    spire.position.y = towerHeight + 0.32;
    tGroup.add(spire);

    towerTops.push(new THREE.Vector3(tx, towerHeight + 0.55, tz));
  });

  // Catenary lightning arrestor cables linking the 4 towers
  const wireMat = new THREE.LineBasicMaterial({ color: '#475569', transparent: true, opacity: 0.65 });
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
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    lcGroup.add(new THREE.Line(lineGeo, wireMat));
  }

  // Cryogenic LOX Sphere & RP-1 Fuel Farm north of the pad
  const loxSphere = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 24), tankMat);
  loxSphere.position.set(-2.3, 0.85, -1.65);
  loxSphere.castShadow = true;
  loxSphere.receiveShadow = true;
  lcGroup.add(loxSphere);

  for (let leg = 0; leg < 4; leg++) {
    const angle = (leg * Math.PI) / 2 + Math.PI / 4;
    const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), pipeMat);
    legMesh.position.set(-2.3 + Math.cos(angle) * 0.42, 0.45, -1.65 + Math.sin(angle) * 0.42);
    lcGroup.add(legMesh);
  }

  // Horizontal RP-1 cylindrical tanks
  [-0.9, -0.35].forEach((ox) => {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.35, 16), tankMat);
    cyl.rotation.z = Math.PI / 2;
    cyl.position.set(ox, 0.48, -1.85);
    cyl.castShadow = true;
    lcGroup.add(cyl);
  });

  // Water deluge tower
  const delugeTower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 1.85, 14), whiteMat);
  delugeTower.position.set(2.1, 1.0, -1.4);
  delugeTower.castShadow = true;
  lcGroup.add(delugeTower);
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
  const bx = -1.2;
  const bz = -3.85;
  boardGroup.position.set(bx, evaluateSeabedHeight(bx, bz), bz);
  boardGroup.rotation.y = 0.22;
  root.add(boardGroup);

  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e242d', roughness: 0.5, metalness: 0.6 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.62, 0.14), frameMat);
  frame.position.y = 0.72;
  frame.castShadow = true;
  boardGroup.add(frame);

  // Support pillars
  [-0.52, 0.52].forEach((px) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 8), frameMat);
    post.position.set(px, 0.36, 0);
    post.castShadow = true;
    boardGroup.add(post);
  });

  const screenMat = new THREE.MeshBasicMaterial({ map: texture });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.5), screenMat);
  screen.position.set(0, 0.72, 0.075);
  boardGroup.add(screen);

  return {
    scoreboardCanvas: canvas,
    scoreboardCtx: ctx,
    scoreboardTexture: texture,
  };
}

function buildLandingZoneAndRadar(root: THREE.Group): {
  radarDish: THREE.Group;
  windSockPivot: THREE.Group;
  windSockCone: THREE.Mesh;
  landingPadTargetMesh: THREE.Mesh;
  landingPadRingMat: THREE.MeshBasicMaterial;
} {
  const lzX = -6.8;
  const lzZ = 0.8;
  const lzY = evaluateSeabedHeight(lzX, lzZ);

  const lzGroup = new THREE.Group();
  lzGroup.position.set(lzX, lzY, lzZ);
  root.add(lzGroup);

  // Concrete circular Landing Pad (LZ-1)
  const padMat = new THREE.MeshStandardMaterial({ color: '#c4c1b8', roughness: 0.82 });
  const padDisk = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.75, 0.14, 32), padMat);
  padDisk.position.y = 0.07;
  padDisk.receiveShadow = true;
  padDisk.castShadow = true;
  padDisk.name = 'landing_pad_target';
  lzGroup.add(padDisk);

  // Illuminated target ring and 'X' marker
  const ringMat = new THREE.MeshBasicMaterial({ color: '#10b981', side: THREE.DoubleSide });
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(1.18, 1.32, 32), ringMat);
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.145;
  lzGroup.add(targetRing);

  const xMarkMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' });
  [-1, 1].forEach((dir) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.01, 0.14), xMarkMat);
    bar.position.y = 0.146;
    bar.rotation.y = (dir * Math.PI) / 4;
    lzGroup.add(bar);
  });

  // Telemetry & Radar Station building beside LZ-1
  const stationMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });
  const stationRoofMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 });
  const station = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1.1), stationMat);
  station.position.set(-1.9, 0.38, -2.2);
  station.castShadow = true;
  station.receiveShadow = true;
  lzGroup.add(station);

  const stationRoof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.1, 1.22), stationRoofMat);
  stationRoof.position.set(-1.9, 0.8, -2.2);
  lzGroup.add(stationRoof);

  // Rotating Parabolic Radar Dish
  const radarPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 0.45, 12),
    new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.4 })
  );
  radarPedestal.position.set(-0.4, 0.22, -2.4);
  lzGroup.add(radarPedestal);

  const radarDish = new THREE.Group();
  radarDish.position.set(-0.4, 0.52, -2.4);
  lzGroup.add(radarDish);

  const dishBowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35, side: THREE.DoubleSide })
  );
  dishBowl.rotation.x = -Math.PI * 0.68;
  dishBowl.castShadow = true;
  radarDish.add(dishBowl);

  // Wind Sock Mast near LZ-1
  const poleMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.6, roughness: 0.3 });
  const windPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.4, 8), poleMat);
  windPole.position.set(1.6, 0.7, -1.5);
  lzGroup.add(windPole);

  const windSockPivot = new THREE.Group();
  windSockPivot.position.set(1.6, 1.38, -1.5);
  lzGroup.add(windSockPivot);

  const sockGeo = new THREE.ConeGeometry(0.11, 0.52, 10, 1, true);
  sockGeo.rotateZ(-Math.PI / 2);
  sockGeo.translate(0.26, 0, 0);
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
  const pierZ = -2.1;
  const pierY = evaluateSeabedHeight(pierX, pierZ);

  const pierGroup = new THREE.Group();
  pierGroup.position.set(pierX, pierY, pierZ);
  root.add(pierGroup);

  const concreteMat = new THREE.MeshStandardMaterial({ color: '#bebbb2', roughness: 0.85 });
  const fenderMat = new THREE.MeshStandardMaterial({ color: '#1e232a', roughness: 0.9 });
  const yellowMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.craneYellow,
    roughness: 0.42,
    metalness: 0.35,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: '#27303d', roughness: 0.5, metalness: 0.6 });

  // Heavy Concrete Pier Apron overhanging the dredged harbour basin
  const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.85, 2.4), concreteMat);
  quayDeck.position.set(0, -0.25, 0.55);
  quayDeck.castShadow = true;
  quayDeck.receiveShadow = true;
  pierGroup.add(quayDeck);

  // Rubber dock fenders and mooring bollards along the south quay edge (z = +1.75)
  for (let i = -2; i <= 2; i++) {
    const fx = i * 1.1;
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.12), fenderMat);
    fender.position.set(fx, -0.2, 1.78);
    pierGroup.add(fender);

    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.18, 8), fenderMat);
    bollard.position.set(fx + 0.35, 0.24, 1.58);
    pierGroup.add(bollard);
  }

  // Stacked Shipping Containers on the pier
  const containerColors = ['#c2410c', '#0f766e', '#1d4ed8', '#b45309'];
  containerColors.forEach((hex, idx) => {
    const cMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.38, 0.42),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.65 })
    );
    const row = Math.floor(idx / 2);
    const col = idx % 2;
    cMesh.position.set(1.5 + col * 1.05, 0.36 + row * 0.39, -0.1);
    cMesh.castShadow = true;
    pierGroup.add(cMesh);
  });

  // Articulated Port Recovery Crane at (-1.1, 0.18, 0.95)
  const craneBase = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.45, 0.92), darkMetalMat);
  craneBase.position.set(-1.1, 0.4, 0.95);
  craneBase.castShadow = true;
  pierGroup.add(craneBase);

  const craneTurret = new THREE.Group();
  craneTurret.position.set(-1.1, 0.62, 0.95);
  pierGroup.add(craneTurret);

  // Vertical lattice mast
  const mastHeight = 4.6;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.34, mastHeight, 0.34), yellowMat);
  mast.position.y = mastHeight / 2;
  mast.castShadow = true;
  craneTurret.add(mast);

  // Operator cab
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.52), darkMetalMat);
  cab.position.set(0, mastHeight - 0.5, 0.28);
  craneTurret.add(cab);

  // Horizontal Hammerhead Jib Boom + Counter-jib
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 4.4), yellowMat);
  boom.position.set(0, mastHeight, 1.15);
  boom.castShadow = true;
  craneTurret.add(boom);

  const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.68), darkMetalMat);
  counterWeight.position.set(0, mastHeight - 0.1, -0.85);
  craneTurret.add(counterWeight);

  // Crane Trolley + Hoist Cable + Spreader Bar
  const craneTrolley = new THREE.Group();
  craneTrolley.position.set(0, mastHeight - 0.16, 2.35);
  craneTurret.add(craneTrolley);

  const cableGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.0, 6);
  cableGeo.translate(0, -0.5, 0);
  const craneCable = new THREE.Mesh(cableGeo, darkMetalMat);
  craneCable.scale.y = 1.6;
  craneTrolley.add(craneCable);

  const craneSpreader = new THREE.Group();
  craneSpreader.position.set(0, -1.6, 0);
  craneTrolley.add(craneSpreader);

  const spreaderBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), yellowMat);
  craneSpreader.add(spreaderBeam);

  return {
    craneTurret,
    craneTrolley,
    craneCable,
    craneSpreader,
  };
}

function buildPalmTrees(root: THREE.Group): THREE.Group[] {
  const palmPositions: [number, number][] = [
    [-8.8, -6.5],
    [-9.2, -3.2],
    [-8.4, 2.5],
    [-4.8, 1.2],
    [-2.4, -2.5],
    [0.6, -2.4],
    [7.8, -5.8],
    [8.6, -3.4],
    [-1.5, -8.2],
    [2.2, -8.5],
    [6.5, -8.1],
  ];

  const trunkMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.palmTrunk, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.palmLeaf,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });

  const crowns: THREE.Group[] = [];

  palmPositions.forEach(([px, pz], idx) => {
    const py = evaluateSeabedHeight(px, pz);
    if (py < WATER_LEVEL + 0.12) return;

    const treeGroup = new THREE.Group();
    treeGroup.position.set(px, py, pz);
    root.add(treeGroup);

    const height = 1.15 + (idx % 3) * 0.22;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, height, 7), trunkMat);
    trunk.position.y = height / 2;
    trunk.rotation.z = ((idx % 2 === 0 ? 1 : -1) * 0.08);
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const crown = new THREE.Group();
    crown.position.set(-Math.sin(trunk.rotation.z) * height, height, 0);
    treeGroup.add(crown);
    crowns.push(crown);

    const frondCount = 7;
    for (let f = 0; f < frondCount; f++) {
      const angle = (f / frondCount) * Math.PI * 2 + idx * 0.5;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.68, 4), leafMat);
      frond.rotation.x = Math.PI * 0.38;
      frond.position.set(Math.sin(angle) * 0.28, -0.05, Math.cos(angle) * 0.28);
      frond.rotation.y = angle;
      frond.castShadow = true;
      crown.add(frond);
    }
  });

  return crowns;
}

function buildSeagulls(root: THREE.Group): AnimatedIslandHandles['seagulls'] {
  const gullMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 });
  const gulls: AnimatedIslandHandles['seagulls'] = [];

  for (let i = 0; i < 5; i++) {
    const group = new THREE.Group();
    const wingGeo = new THREE.BoxGeometry(0.24, 0.015, 0.07);
    wingGeo.translate(0.12, 0, 0);
    const wingL = new THREE.Mesh(wingGeo, gullMat);
    const wingR = new THREE.Mesh(wingGeo, gullMat);
    wingR.scale.x = -1;
    group.add(wingL, wingR);
    root.add(group);

    gulls.push({
      group,
      wingL,
      wingR,
      cx: -1.5 + (i - 2) * 2.4,
      cz: -1.0 + (i % 2) * 2.5,
      y: 4.2 + i * 0.45,
      rx: 2.8 + (i % 3) * 0.9,
      rz: 2.1 + (i % 2) * 0.8,
      speed: 0.55 + i * 0.08,
      phase: i * 1.3,
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

  const coralColors = [
    SCENE_PALETTE.coralPink,
    SCENE_PALETTE.coralGold,
    SCENE_PALETTE.coralViolet,
    '#ec4899',
    '#14b8a6',
  ];
  const rockMat = new THREE.MeshStandardMaterial({ color: '#4b5563', roughness: 0.92 });
  const kelpMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.kelpGreen, roughness: 0.75 });

  // Scatter coral clusters, rocks, and kelp across the underwater seabed
  for (let i = 0; i < 38; i++) {
    const rx = -8.5 + ((i * 3.7) % 17.5);
    const rz = -1.5 + ((i * 2.9) % 11.2);
    const bedY = evaluateSeabedHeight(rx, rz);

    if (bedY < WATER_LEVEL - 0.55) {
      if (i % 3 === 0) {
        // Brain / dome coral
        const cMat = new THREE.MeshStandardMaterial({
          color: coralColors[i % coralColors.length],
          roughness: 0.7,
        });
        const coral = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + (i % 3) * 0.07, 1), cMat);
        coral.position.set(rx, bedY + 0.1, rz);
        coral.scale.y = 0.72;
        coral.castShadow = true;
        root.add(coral);
      } else if (i % 3 === 1) {
        // Sea rock boulder
        const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + (i % 4) * 0.06, 0), rockMat);
        boulder.position.set(rx, bedY + 0.08, rz);
        boulder.rotation.set(i, i * 0.5, 0);
        root.add(boulder);
      } else {
        // Swaying Kelp frond
        const kh = Math.min(1.4, (WATER_LEVEL - bedY) * 0.65);
        const kGeo = new THREE.CylinderGeometry(0.02, 0.045, kh, 6, 4);
        kGeo.translate(0, kh / 2, 0);
        const kelp = new THREE.Mesh(kGeo, kelpMat);
        kelp.position.set(rx, bedY, rz);
        root.add(kelp);
        kelpStrands.push(kelp);
      }
    }
  }

  // Marine Swimmers inside the translucent jelly volume (Reef Shark + Manta Ray + Tropical Fish)
  const sharkMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.4, metalness: 0.2 });
  const fishColors = ['#f97316', '#facc15', '#38bdf8', '#f43f5e'];

  // 1. Reef Shark cruising the deep south-east jelly trench
  const sharkGroup = new THREE.Group();
  const sharkBody = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.15, 10), sharkMat);
  sharkBody.rotation.x = Math.PI / 2;
  const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 4), sharkMat);
  dorsalFin.position.set(0, 0.16, -0.05);
  const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 4), sharkMat);
  tailFin.position.set(0, 0.04, -0.58);
  tailFin.rotation.x = -Math.PI / 3;
  sharkGroup.add(sharkBody, dorsalFin, tailFin);
  root.add(sharkGroup);

  swimmers.push({
    mesh: sharkGroup,
    centerX: 2.2,
    centerZ: 5.5,
    y: -0.45,
    radiusX: 3.4,
    radiusZ: 2.4,
    speed: 0.48,
    phase: 0,
  });

  // 2. School of bright reef fish
  for (let f = 0; f < 8; f++) {
    const fishGroup = new THREE.Group();
    const fMat = new THREE.MeshStandardMaterial({
      color: fishColors[f % fishColors.length],
      roughness: 0.35,
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.32, 8), fMat);
    body.rotation.x = Math.PI / 2;
    fishGroup.add(body);
    root.add(fishGroup);

    swimmers.push({
      mesh: fishGroup,
      centerX: -0.5 + (f % 3) * 2.1,
      centerZ: 3.5 + (f % 4) * 1.4,
      y: 0.25 - (f % 3) * 0.48,
      radiusX: 1.6 + (f % 3) * 0.5,
      radiusZ: 1.3 + (f % 2) * 0.6,
      speed: 0.75 + (f % 4) * 0.14,
      phase: f * 0.9,
    });
  }

  return { kelpStrands, swimmers };
}
