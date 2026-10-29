import * as THREE from 'three';
import { SCENE_PALETTE } from '../config/designTokens';

export interface FairingHalfRig {
  group: THREE.Group;
  shell: THREE.Mesh;
  parafoilGroup: THREE.Group;
}

export interface VehiclesRig {
  crawlerGroup: THREE.Group;
  strongbackPivot: THREE.Group;

  boosterGroup: THREE.Group;
  boosterBodyMat: THREE.MeshStandardMaterial;
  gridFinPivots: THREE.Group[];
  legPivots: THREE.Group[];
  boosterPlumeGroup: THREE.Group;
  boosterCoreFlame: THREE.Mesh;
  boosterOuterFlame: THREE.Mesh;
  rocketLight: THREE.PointLight;

  stage2Group: THREE.Group;
  stage2Plume: THREE.Mesh;

  fairings: [FairingHalfRig, FairingHalfRig];

  droneShipGroup: THREE.Group;
  droneShipTargetMesh: THREE.Mesh;
  droneShipRingMat: THREE.MeshBasicMaterial;

  tugBoatGroup: THREE.Group;
  towLine: THREE.Line;
  towLinePositions: Float32Array;

  fairingBoatGroup: THREE.Group;
}

export const STAGE1_TOP_OFFSET = 2.95;
export const FAIRING_BASE_OFFSET = 3.55;

export function buildAllVehicles(root: THREE.Group): VehiclesRig {
  // 1. TRANSPORTER-ERECTOR (CRAWLER + OPEN-LATTICE STRONGBACK)
  const crawlerGroup = new THREE.Group();
  root.add(crawlerGroup);

  const steelMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.45, metalness: 0.65 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1b1f27', roughness: 0.52, metalness: 0.45 });

  const crawlerBase = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.14, 0.86), steelMat);
  crawlerBase.position.y = 0.22;
  crawlerBase.castShadow = true;
  crawlerGroup.add(crawlerBase);

  const strongbackPivot = new THREE.Group();
  strongbackPivot.position.set(0, 0.28, 0);
  crawlerGroup.add(strongbackPivot);

  // Open-lattice Strongback mast (2 vertical side chords + cross rungs)
  const sbHeight = 3.75;
  [-0.1, 0.1].forEach((sz) => {
    const chord = new THREE.Mesh(new THREE.BoxGeometry(0.08, sbHeight, 0.05), steelMat);
    chord.position.set(-0.26, sbHeight / 2, sz);
    chord.castShadow = true;
    strongbackPivot.add(chord);
  });

  for (let r = 1; r <= 10; r++) {
    const ry = (r / 10) * sbHeight;
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.24), steelMat);
    rung.position.set(-0.26, ry, 0);
    strongbackPivot.add(rung);
  }

  // Upper clamp arm embracing the rocket interstage
  const upperClamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.34), steelMat);
  upperClamp.position.set(-0.1, 2.95, 0);
  strongbackPivot.add(upperClamp);

  // 2. STAGE 1 BOOSTER (FALCON 9 PROPORTIONS)
  const boosterGroup = new THREE.Group();
  root.add(boosterGroup);

  const boosterBodyMat = new THREE.MeshStandardMaterial({
    color: '#f8f8f6',
    roughness: 0.34,
    metalness: 0.14,
  });

  const s1Height = 2.55;
  const s1Radius = 0.135;
  const s1Cyl = new THREE.Mesh(new THREE.CylinderGeometry(s1Radius, s1Radius, s1Height, 24), boosterBodyMat);
  s1Cyl.position.y = s1Height / 2 + 0.08;
  s1Cyl.castShadow = true;
  s1Cyl.receiveShadow = true;
  boosterGroup.add(s1Cyl);

  // Black vertical raceway stripe along fuselage
  const raceway = new THREE.Mesh(new THREE.BoxGeometry(0.02, s1Height * 0.92, 0.03), darkMat);
  raceway.position.set(0, s1Height / 2 + 0.08, s1Radius);
  boosterGroup.add(raceway);

  // Black Carbon-Fiber Interstage
  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(s1Radius + 0.003, s1Radius + 0.003, 0.38, 24),
    darkMat
  );
  interstage.position.y = s1Height + 0.25;
  interstage.castShadow = true;
  boosterGroup.add(interstage);

  // Octaweb + 9 Merlin Engine Nozzles
  const octaweb = new THREE.Mesh(new THREE.CylinderGeometry(s1Radius, s1Radius * 0.86, 0.12, 16), darkMat);
  octaweb.position.y = 0.06;
  boosterGroup.add(octaweb);

  // 4 Deployable Titanium Grid Fins
  const gridFinPivots: THREE.Group[] = [];
  const finMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.35, metalness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(angle) * s1Radius, s1Height + 0.2, Math.sin(angle) * s1Radius);
    pivot.rotation.y = -angle;
    boosterGroup.add(pivot);

    const finGeo = new THREE.BoxGeometry(0.2, 0.022, 0.14);
    finGeo.translate(0.1, 0, 0);
    const finMesh = new THREE.Mesh(finGeo, finMat);
    finMesh.castShadow = true;
    pivot.add(finMesh);
    gridFinPivots.push(pivot);
  }

  // 4 Deployable Black Carbon-Fiber Landing Legs
  const legPivots: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(angle) * (s1Radius - 0.005), 0.1, Math.sin(angle) * (s1Radius - 0.005));
    pivot.rotation.y = -angle;
    boosterGroup.add(pivot);

    const legGeo = new THREE.BoxGeometry(0.038, 0.65, 0.085);
    legGeo.translate(0.02, 0.325, 0);
    const legMesh = new THREE.Mesh(legGeo, darkMat);
    legMesh.castShadow = true;
    pivot.add(legMesh);
    legPivots.push(pivot);
  }

  // Volumetric Exhaust Plume + PointLight
  const boosterPlumeGroup = new THREE.Group();
  boosterGroup.add(boosterPlumeGroup);

  const coreFlameGeo = new THREE.ConeGeometry(0.13, 1.35, 16);
  coreFlameGeo.rotateX(Math.PI);
  coreFlameGeo.translate(0, -0.65, 0);
  const boosterCoreFlame = new THREE.Mesh(
    coreFlameGeo,
    new THREE.MeshBasicMaterial({ color: '#fffbeb', transparent: true, opacity: 0.95 })
  );
  boosterPlumeGroup.add(boosterCoreFlame);

  const outerFlameGeo = new THREE.ConeGeometry(0.26, 2.35, 16);
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
    color: '#f8f8f6',
    roughness: 0.34,
    metalness: 0.14,
  });
  const s2Cyl = new THREE.Mesh(new THREE.CylinderGeometry(s1Radius, s1Radius, 0.6, 24), whiteMat);
  s2Cyl.position.y = 0.3;
  s2Cyl.castShadow = true;
  stage2Group.add(s2Cyl);

  const payloadSat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.095, 0.36, 12),
    new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.3, metalness: 0.8 })
  );
  payloadSat.position.y = 0.78;
  stage2Group.add(payloadSat);

  const s2PlumeGeo = new THREE.ConeGeometry(0.3, 1.35, 16);
  s2PlumeGeo.rotateX(Math.PI);
  s2PlumeGeo.translate(0, -0.68, 0);
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

    const phiStart = side === 1 ? 0 : Math.PI;
    const shellGroup = new THREE.Group();

    const fairingR = s1Radius * 1.22;
    const adapter = new THREE.Mesh(
      new THREE.CylinderGeometry(fairingR, s1Radius, 0.14, 16, 1, false, phiStart, Math.PI),
      whiteMat
    );
    adapter.position.y = 0.07;
    shellGroup.add(adapter);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(fairingR, fairingR, 0.48, 16, 1, false, phiStart, Math.PI),
      whiteMat
    );
    barrel.position.y = 0.38;
    barrel.castShadow = true;
    shellGroup.add(barrel);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(fairingR, 0.46, 16, 1, false, phiStart, Math.PI),
      whiteMat
    );
    nose.position.y = 0.85;
    nose.castShadow = true;
    shellGroup.add(nose);

    const dummyShell = new THREE.Mesh();
    dummyShell.add(shellGroup);
    group.add(dummyShell);

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

  // 5. AUTONOMOUS SPACEPORT DRONE SHIP (ASDS — MATCHING CROP_TOP_ISLAND.PNG)
  const droneShipGroup = new THREE.Group();
  root.add(droneShipGroup);

  const hullMat = new THREE.MeshStandardMaterial({ color: '#272c35', roughness: 0.65, metalness: 0.35 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#3b424f', roughness: 0.75, metalness: 0.2 });
  const whiteLineMat = new THREE.MeshBasicMaterial({ color: '#f8fafc', side: THREE.DoubleSide });

  const hullMesh = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.34, 1.68), hullMat);
  hullMesh.position.y = -0.04;
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  droneShipGroup.add(hullMesh);

  const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.08, 1.8), deckMat);
  deckMesh.position.y = 0.15;
  deckMesh.receiveShadow = true;
  deckMesh.castShadow = true;
  deckMesh.name = 'drone_ship_target';
  droneShipGroup.add(deckMesh);

  // White perimeter deck border lines (exact detail from crop_top_island.png)
  const borderPts = [
    new THREE.Vector3(-1.26, 0.195, -0.82),
    new THREE.Vector3(1.26, 0.195, -0.82),
    new THREE.Vector3(1.26, 0.195, 0.82),
    new THREE.Vector3(-1.26, 0.195, 0.82),
    new THREE.Vector3(-1.26, 0.195, -0.82),
  ];
  droneShipGroup.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(borderPts),
      new THREE.LineBasicMaterial({ color: '#e2e8f0' })
    )
  );

  // Landing Circle + 'X' on ASDS deck
  const droneShipRingMat = new THREE.MeshBasicMaterial({ color: '#f8fafc', side: THREE.DoubleSide });
  const shipRing = new THREE.Mesh(new THREE.RingGeometry(0.54, 0.62, 32), droneShipRingMat);
  shipRing.rotation.x = -Math.PI / 2;
  shipRing.position.y = 0.195;
  droneShipGroup.add(shipRing);

  [-1, 1].forEach((dir) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.01, 0.085), whiteLineMat);
    bar.position.y = 0.196;
    bar.rotation.y = (dir * Math.PI) / 4;
    droneShipGroup.add(bar);
  });

  // 4 Corner Equipment Containers & Submerged Azimuth Thruster Pods on ASDS (matching reference video)
  const equipMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.5 });
  [
    [-1.08, -0.66],
    [1.08, -0.66],
    [1.08, 0.66],
    [-1.08, 0.66],
  ].forEach(([cx, cz]) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.22), equipMat);
    box.position.set(cx, 0.28, cz);
    box.castShadow = true;
    droneShipGroup.add(box);

    // Submerged azimuth thruster pod visible through the translucent jelly below the barge hull
    const podStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 8), hullMat);
    podStrut.position.set(cx * 0.82, -0.28, cz * 0.78);
    droneShipGroup.add(podStrut);

    const podShroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.18, 10).rotateZ(Math.PI / 2),
      hullMat
    );
    podShroud.position.set(cx * 0.82, -0.40, cz * 0.78);
    droneShipGroup.add(podShroud);
  });

  // 6. RED-AND-WHITE HARBOUR TUGBOAT (MATCHING CROP_TOP_ISLAND.PNG)
  const tugBoatGroup = new THREE.Group();
  root.add(tugBoatGroup);

  const tugHull = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.2, 0.36),
    new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.5 })
  );
  tugHull.position.y = 0.04;
  tugHull.castShadow = true;
  tugBoatGroup.add(tugHull);

  const tugCabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.22, 0.26),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 })
  );
  tugCabin.position.set(-0.06, 0.22, 0);
  tugCabin.castShadow = true;
  tugBoatGroup.add(tugCabin);

  const towLinePositions = new Float32Array(6);
  const towGeo = new THREE.BufferGeometry();
  towGeo.setAttribute('position', new THREE.BufferAttribute(towLinePositions, 3));
  const towLine = new THREE.Line(
    towGeo,
    new THREE.LineBasicMaterial({ color: '#fbbf24', linewidth: 2 })
  );
  towLine.visible = false;
  root.add(towLine);

  // 7. FAIRING RECOVERY VESSEL ("MS. JELLY" WITH ELEVATED CATCH NET CANOPY)
  const fairingBoatGroup = new THREE.Group();
  root.add(fairingBoatGroup);

  const fbHull = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.22, 0.54),
    new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.48 })
  );
  fbHull.position.y = 0.04;
  fbHull.castShadow = true;
  fairingBoatGroup.add(fbHull);

  const fbCabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.24, 0.42),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 })
  );
  fbCabin.position.set(-0.32, 0.24, 0);
  fbCabin.castShadow = true;
  fairingBoatGroup.add(fbCabin);

  const armMat = new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.5, roughness: 0.3 });
  [
    [-0.12, -0.42],
    [-0.12, 0.42],
    [0.58, -0.42],
    [0.58, 0.42],
  ].forEach(([ax, az]) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.68, 6), armMat);
    strut.position.set(ax, 0.38, az * 0.68);
    strut.rotation.x = az > 0 ? 0.32 : -0.32;
    fairingBoatGroup.add(strut);
  });

  const netMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.78, 7, 7),
    new THREE.MeshBasicMaterial({
      color: '#334155',
      wireframe: true,
      side: THREE.DoubleSide,
    })
  );
  netMesh.rotation.x = -Math.PI / 2;
  netMesh.position.set(0.24, 0.68, 0);
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
