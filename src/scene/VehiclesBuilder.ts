import * as THREE from 'three';
import { SCENE_PALETTE } from '../config/designTokens';

export interface FairingHalfRig {
  group: THREE.Group;
  shell: THREE.Mesh;
  parafoilGroup: THREE.Group;
}

export interface VehiclesRig {
  // Transporter-Erector (Strongback)
  crawlerGroup: THREE.Group;
  strongbackPivot: THREE.Group;

  // Stage 1 Booster
  boosterGroup: THREE.Group;
  boosterBodyMat: THREE.MeshStandardMaterial;
  gridFinPivots: THREE.Group[];
  legPivots: THREE.Group[];
  boosterPlumeGroup: THREE.Group;
  boosterCoreFlame: THREE.Mesh;
  boosterOuterFlame: THREE.Mesh;
  rocketLight: THREE.PointLight;

  // Stage 2
  stage2Group: THREE.Group;
  stage2Plume: THREE.Mesh;

  // Two Fairing Halves + Parafoils
  fairings: [FairingHalfRig, FairingHalfRig];

  // Autonomous Spaceport Drone Ship (ASDS)
  droneShipGroup: THREE.Group;
  droneShipTargetMesh: THREE.Mesh;
  droneShipRingMat: THREE.MeshBasicMaterial;

  // Harbour Tugboat + Tow Line
  tugBoatGroup: THREE.Group;
  towLine: THREE.Line;
  towLinePositions: Float32Array;

  // Fairing Recovery Boat ("Ms. Jelly")
  fairingBoatGroup: THREE.Group;
}

export function buildAllVehicles(root: THREE.Group): VehiclesRig {
  // 1. TRANSPORTER-ERECTOR (CRAWLER + STRONGBACK)
  const crawlerGroup = new THREE.Group();
  root.add(crawlerGroup);

  const steelMat = new THREE.MeshStandardMaterial({ color: '#3b4454', roughness: 0.48, metalness: 0.65 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1b2029', roughness: 0.55, metalness: 0.5 });

  // Crawler base bogies on the rails
  const crawlerBase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.92), steelMat);
  crawlerBase.position.y = 0.25;
  crawlerBase.castShadow = true;
  crawlerGroup.add(crawlerBase);

  const strongbackPivot = new THREE.Group();
  strongbackPivot.position.set(0, 0.32, 0);
  crawlerGroup.add(strongbackPivot);

  // Strongback lattice mast (parallel to rocket when horizontal/vertical)
  const mastGeo = new THREE.BoxGeometry(0.22, 3.05, 0.24);
  mastGeo.translate(-0.26, 1.52, 0);
  const strongbackMast = new THREE.Mesh(mastGeo, steelMat);
  strongbackMast.castShadow = true;
  strongbackPivot.add(strongbackMast);

  // Upper clamp arm embracing the rocket interstage
  const upperClamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.36), steelMat);
  upperClamp.position.set(-0.08, 2.35, 0);
  strongbackPivot.add(upperClamp);

  // 2. STAGE 1 BOOSTER
  const boosterGroup = new THREE.Group();
  root.add(boosterGroup);

  const boosterBodyMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.rocketBody,
    roughness: 0.38,
    metalness: 0.18,
  });

  // Main Stage 1 tank cylinder (height 2.15m in diorama units, origin at nozzle base)
  const s1Height = 2.15;
  const s1Radius = 0.145;
  const s1Cyl = new THREE.Mesh(new THREE.CylinderGeometry(s1Radius, s1Radius, s1Height, 24), boosterBodyMat);
  s1Cyl.position.y = s1Height / 2 + 0.08;
  s1Cyl.castShadow = true;
  s1Cyl.receiveShadow = true;
  boosterGroup.add(s1Cyl);

  // Black Carbon-Fiber Interstage at top of Stage 1
  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(s1Radius + 0.002, s1Radius + 0.002, 0.34, 24),
    darkMat
  );
  interstage.position.y = s1Height + 0.22;
  interstage.castShadow = true;
  boosterGroup.add(interstage);

  // Octaweb + 9 Merlin Engine bells at base
  const octaweb = new THREE.Mesh(new THREE.CylinderGeometry(s1Radius, s1Radius * 0.88, 0.12, 16), darkMat);
  octaweb.position.y = 0.06;
  boosterGroup.add(octaweb);

  // 4 Deployable Titanium Grid Fins around the interstage
  const gridFinPivots: THREE.Group[] = [];
  const finMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.35, metalness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(angle) * s1Radius, s1Height + 0.16, Math.sin(angle) * s1Radius);
    pivot.rotation.y = -angle;
    boosterGroup.add(pivot);

    // Waffle paddle mesh
    const finGeo = new THREE.BoxGeometry(0.22, 0.025, 0.16);
    finGeo.translate(0.11, 0, 0);
    const finMesh = new THREE.Mesh(finGeo, finMat);
    finMesh.castShadow = true;
    pivot.add(finMesh);
    gridFinPivots.push(pivot);
  }

  // 4 Deployable Carbon-Fiber Landing Legs at base of Stage 1
  const legPivots: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(angle) * (s1Radius - 0.01), 0.12, Math.sin(angle) * (s1Radius - 0.01));
    pivot.rotation.y = -angle;
    boosterGroup.add(pivot);

    const legGeo = new THREE.BoxGeometry(0.04, 0.62, 0.09);
    legGeo.translate(0.02, 0.31, 0);
    const legMesh = new THREE.Mesh(legGeo, darkMat);
    legMesh.castShadow = true;
    pivot.add(legMesh);
    legPivots.push(pivot);
  }

  // Volumetric Booster Exhaust Plume + Dynamic PointLight
  const boosterPlumeGroup = new THREE.Group();
  boosterPlumeGroup.position.set(0, 0, 0);
  boosterGroup.add(boosterPlumeGroup);

  const coreFlameGeo = new THREE.ConeGeometry(0.14, 1.35, 16);
  coreFlameGeo.rotateX(Math.PI);
  coreFlameGeo.translate(0, -0.65, 0);
  const boosterCoreFlame = new THREE.Mesh(
    coreFlameGeo,
    new THREE.MeshBasicMaterial({ color: '#fffbeb', transparent: true, opacity: 0.95 })
  );
  boosterPlumeGroup.add(boosterCoreFlame);

  const outerFlameGeo = new THREE.ConeGeometry(0.28, 2.35, 16);
  outerFlameGeo.rotateX(Math.PI);
  outerFlameGeo.translate(0, -1.1, 0);
  const boosterOuterFlame = new THREE.Mesh(
    outerFlameGeo,
    new THREE.MeshBasicMaterial({
      color: '#ff7b1c',
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  boosterPlumeGroup.add(boosterOuterFlame);

  const rocketLight = new THREE.PointLight('#ff9436', 0, 16, 1.5);
  rocketLight.position.set(0, -0.6, 0);
  boosterPlumeGroup.add(rocketLight);

  // 3. SECOND STAGE + VACUUM PLUME
  const stage2Group = new THREE.Group();
  root.add(stage2Group);

  const whiteMat = new THREE.MeshStandardMaterial({
    color: SCENE_PALETTE.rocketBody,
    roughness: 0.35,
    metalness: 0.15,
  });
  const s2Cyl = new THREE.Mesh(new THREE.CylinderGeometry(s1Radius, s1Radius, 0.62, 24), whiteMat);
  s2Cyl.position.y = 0.31;
  s2Cyl.castShadow = true;
  stage2Group.add(s2Cyl);

  // Payload satellite stack inside the fairing
  const payloadSat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.1, 0.38, 12),
    new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.3, metalness: 0.8 })
  );
  payloadSat.position.y = 0.82;
  stage2Group.add(payloadSat);

  // MVac Vacuum Plume
  const s2PlumeGeo = new THREE.ConeGeometry(0.32, 1.45, 16);
  s2PlumeGeo.rotateX(Math.PI);
  s2PlumeGeo.translate(0, -0.72, 0);
  const stage2Plume = new THREE.Mesh(
    s2PlumeGeo,
    new THREE.MeshBasicMaterial({
      color: '#60a5fa',
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  stage2Group.add(stage2Plume);

  // 4. TWO CLAMSHELL PAYLOAD FAIRING HALVES + STRIPED PARAFOILS
  const buildFairingHalf = (side: -1 | 1): FairingHalfRig => {
    const group = new THREE.Group();
    root.add(group);

    // Half-cylinder + ogive nose cone
    const phiStart = side === 1 ? 0 : Math.PI;
    const shellGroup = new THREE.Group();

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(s1Radius * 1.12, s1Radius, 0.46, 16, 1, false, phiStart, Math.PI),
      whiteMat
    );
    barrel.position.y = 0.23;
    barrel.castShadow = true;
    shellGroup.add(barrel);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(s1Radius * 1.12, 0.44, 16, 1, false, phiStart, Math.PI),
      whiteMat
    );
    nose.position.y = 0.68;
    nose.castShadow = true;
    shellGroup.add(nose);

    const dummyShell = new THREE.Mesh();
    dummyShell.add(shellGroup);
    group.add(dummyShell);

    // Striped Ram-Air Parafoil Canopy + Suspension Lines
    const parafoilGroup = new THREE.Group();
    parafoilGroup.position.set(0, 1.35, 0);
    parafoilGroup.visible = false;
    group.add(parafoilGroup);

    const stripeCount = 5;
    const cellWidth = 0.13;
    for (let s = 0; s < stripeCount; s++) {
      const xOff = (s - (stripeCount - 1) / 2) * cellWidth;
      const archY = -Math.abs(s - 2) * 0.035;
      const cellMat = new THREE.MeshStandardMaterial({
        color: s % 2 === 0 ? '#ea580c' : '#f8fafc',
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      const cell = new THREE.Mesh(new THREE.BoxGeometry(cellWidth * 0.96, 0.03, 0.36), cellMat);
      cell.position.set(xOff, archY, 0);
      cell.rotation.z = -(s - 2) * 0.1;
      parafoilGroup.add(cell);
    }

    // Suspension shroud lines
    const shroudMat = new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.7 });
    [
      [-0.26, -0.05, -0.14],
      [0.26, -0.05, -0.14],
      [-0.26, -0.05, 0.14],
      [0.26, -0.05, 0.14],
    ].forEach(([lx, ly, lz]) => {
      const lGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(lx, ly, lz),
        new THREE.Vector3(0, -0.95, 0),
      ]);
      parafoilGroup.add(new THREE.Line(lGeo, shroudMat));
    });

    return { group, shell: dummyShell, parafoilGroup };
  };

  const fairings: [FairingHalfRig, FairingHalfRig] = [buildFairingHalf(-1), buildFairingHalf(1)];

  // 5. AUTONOMOUS SPACEPORT DRONE SHIP (ASDS "OF COURSE I STILL WOBBLE")
  const droneShipGroup = new THREE.Group();
  root.add(droneShipGroup);

  const hullMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.bargeHull, roughness: 0.65, metalness: 0.35 });
  const deckMat = new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.bargeDeck, roughness: 0.78, metalness: 0.2 });

  const hullMesh = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.36, 1.72), hullMat);
  hullMesh.position.y = -0.02;
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  droneShipGroup.add(hullMesh);

  const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(2.82, 0.08, 1.88), deckMat);
  deckMesh.position.y = 0.18;
  deckMesh.receiveShadow = true;
  deckMesh.castShadow = true;
  deckMesh.name = 'drone_ship_target';
  droneShipGroup.add(deckMesh);

  // Illuminated Landing Circle + 'X' on ASDS deck
  const droneShipRingMat = new THREE.MeshBasicMaterial({ color: '#10b981', side: THREE.DoubleSide });
  const shipRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 32), droneShipRingMat);
  shipRing.rotation.x = -Math.PI / 2;
  shipRing.position.y = 0.225;
  droneShipGroup.add(shipRing);

  const xMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' });
  [-1, 1].forEach((dir) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.01, 0.1), xMat);
    bar.position.y = 0.226;
    bar.rotation.y = (dir * Math.PI) / 4;
    droneShipGroup.add(bar);
  });

  // Bow & Stern equipment containers and blast shields on ASDS
  const equipMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.5 });
  const bowWall = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 1.45), equipMat);
  bowWall.position.set(-1.18, 0.36, 0);
  bowWall.castShadow = true;
  droneShipGroup.add(bowWall);

  const sternGen = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.65), new THREE.MeshStandardMaterial({ color: '#eab308' }));
  sternGen.position.set(1.16, 0.34, -0.45);
  sternGen.castShadow = true;
  droneShipGroup.add(sternGen);

  // 6. HARBOUR TUGBOAT + TOW CABLE
  const tugBoatGroup = new THREE.Group();
  root.add(tugBoatGroup);

  const tugHull = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.26, 0.46),
    new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.tugHull, roughness: 0.6 })
  );
  tugHull.position.y = 0.04;
  tugHull.castShadow = true;
  tugBoatGroup.add(tugHull);

  const tugCabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.28, 0.32),
    new THREE.MeshStandardMaterial({ color: SCENE_PALETTE.tugCabin, roughness: 0.45 })
  );
  tugCabin.position.set(-0.08, 0.28, 0);
  tugCabin.castShadow = true;
  tugBoatGroup.add(tugCabin);

  const tugStack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.055, 0.24, 8),
    new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.5 })
  );
  tugStack.position.set(0.16, 0.32, 0);
  tugBoatGroup.add(tugStack);

  // Tow Line between Tugboat and Drone Ship
  const towLinePositions = new Float32Array(6);
  const towGeo = new THREE.BufferGeometry();
  towGeo.setAttribute('position', new THREE.BufferAttribute(towLinePositions, 3));
  const towLine = new THREE.Line(
    towGeo,
    new THREE.LineBasicMaterial({ color: '#fbbf24', linewidth: 2 })
  );
  towLine.visible = false;
  root.add(towLine);

  // 7. FAIRING RECOVERY VESSEL ("MS. JELLY" WITH OUTSTRETCHED CATCH NET)
  const fairingBoatGroup = new THREE.Group();
  root.add(fairingBoatGroup);

  const fbHull = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.24, 0.58),
    new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.5 })
  );
  fbHull.position.y = 0.04;
  fbHull.castShadow = true;
  fairingBoatGroup.add(fbHull);

  const fbCabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.44),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 })
  );
  fbCabin.position.set(-0.24, 0.26, 0);
  fbCabin.castShadow = true;
  fairingBoatGroup.add(fbCabin);

  // 4 Outstretched Arms + Yellow Catch Net above the stern
  const armMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.5, roughness: 0.3 });
  [
    [-0.1, -0.45],
    [-0.1, 0.45],
    [0.65, -0.45],
    [0.65, 0.45],
  ].forEach(([ax, az]) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.72, 6), armMat);
    strut.position.set(ax, 0.42, az * 0.7);
    strut.rotation.x = az > 0 ? 0.35 : -0.35;
    fairingBoatGroup.add(strut);
  });

  const netMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.88, 6, 6),
    new THREE.MeshBasicMaterial({
      color: SCENE_PALETTE.fairingNet,
      wireframe: true,
      side: THREE.DoubleSide,
    })
  );
  netMesh.rotation.x = -Math.PI / 2;
  netMesh.position.set(0.28, 0.72, 0);
  fairingBoatGroup.add(netMesh);

  return {
    crawlerGroup,
    strongbackPivot,
    boosterGroup,
    boosterBodyMat,
    gridFinPivots,
    legPivots,
    boosterPlumeGroup,
    boosterCoreFlame,
    boosterOuterFlame,
    rocketLight,
    stage2Group,
    stage2Plume,
    fairings,
    droneShipGroup,
    droneShipTargetMesh: deckMesh,
    droneShipRingMat,
    tugBoatGroup,
    towLine,
    towLinePositions,
    fairingBoatGroup,
  };
}
