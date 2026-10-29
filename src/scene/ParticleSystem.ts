import * as THREE from 'three';

interface SmokePuff {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  warmth: number;
}

const MAX_PUFFS = 220;
const RAIN_COUNT = 320;

export class SpaceportEffectsSystem {
  private puffs: SmokePuff[] = [];
  private instancedSmoke: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private colorTemp = new THREE.Color();

  private rainLines: THREE.LineSegments;
  private rainPositions: Float32Array;

  constructor(parent: THREE.Group) {
    // 1. Volumetric Smoke / Steam Puff Instanced Spheres
    const puffGeo = new THREE.IcosahedronGeometry(0.32, 1);
    const puffMat = new THREE.MeshLambertMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });

    this.instancedSmoke = new THREE.InstancedMesh(puffGeo, puffMat, MAX_PUFFS);
    this.instancedSmoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedSmoke.frustumCulled = false;

    for (let i = 0; i < MAX_PUFFS; i++) {
      this.puffs.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 1,
        startScale: 0.2,
        endScale: 1.0,
        warmth: 0,
      });
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.instancedSmoke.setMatrixAt(i, this.dummy.matrix);
      this.instancedSmoke.setColorAt(i, new THREE.Color('#f8fafc'));
    }

    parent.add(this.instancedSmoke);

    // 2. Storm Rain Streaks
    this.rainPositions = new Float32Array(RAIN_COUNT * 6);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const rx = (Math.random() - 0.5) * 24;
      const ry = Math.random() * 14;
      const rz = (Math.random() - 0.5) * 24;
      this.rainPositions[i * 6] = rx;
      this.rainPositions[i * 6 + 1] = ry;
      this.rainPositions[i * 6 + 2] = rz;
      this.rainPositions[i * 6 + 3] = rx - 0.15;
      this.rainPositions[i * 6 + 4] = ry - 0.65;
      this.rainPositions[i * 6 + 5] = rz;
    }

    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: '#93c5fd',
      transparent: true,
      opacity: 0.42,
    });
    this.rainLines = new THREE.LineSegments(rainGeo, rainMat);
    this.rainLines.visible = false;
    parent.add(this.rainLines);
  }

  public spawnSmoke(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    startScale = 0.28,
    endScale = 1.45,
    maxAge = 1.8,
    warmth = 0.0
  ): void {
    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = this.puffs[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = vx;
        p.vy = vy;
        p.vz = vz;
        p.age = 0;
        p.maxAge = maxAge;
        p.startScale = startScale;
        p.endScale = endScale;
        p.warmth = warmth;
        return;
      }
    }
  }

  public update(dt: number, windSpeed: number, storm: boolean): void {
    const windDriftX = (windSpeed / 25) * 1.45;
    let matrixDirty = false;

    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = this.puffs[i];
      if (!p.active) continue;

      matrixDirty = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        this.instancedSmoke.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      const t = p.age / p.maxAge;
      p.x += (p.vx + windDriftX) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.96;
      p.vz *= 0.96;
      p.vy = p.vy * 0.96 + 0.35 * dt;

      const scale =
        t < 0.72
          ? THREE.MathUtils.lerp(p.startScale, p.endScale, t / 0.72)
          : THREE.MathUtils.lerp(p.endScale, 0.01, (t - 0.72) / 0.28);

      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(Math.max(0.01, scale));
      this.dummy.updateMatrix();
      this.instancedSmoke.setMatrixAt(i, this.dummy.matrix);

      // Warm ignition glow fading into white acoustic steam
      const glow = Math.max(0, p.warmth * (1 - t * 2.2));
      this.colorTemp.setRGB(
        0.96 + glow * 0.04,
        0.96 - glow * 0.26,
        0.97 - glow * 0.55
      );
      this.instancedSmoke.setColorAt(i, this.colorTemp);
    }

    if (matrixDirty) {
      this.instancedSmoke.instanceMatrix.needsUpdate = true;
      if (this.instancedSmoke.instanceColor) {
        this.instancedSmoke.instanceColor.needsUpdate = true;
      }
    }

    // Update storm rain streaks
    this.rainLines.visible = storm;
    if (storm) {
      const slantX = -0.35 - (windSpeed / 25) * 0.55;
      const fallSpeed = 16.5;
      for (let i = 0; i < RAIN_COUNT; i++) {
        let rx = this.rainPositions[i * 6] + slantX * dt * 8;
        let ry = this.rainPositions[i * 6 + 1] - fallSpeed * dt;
        const rz = this.rainPositions[i * 6 + 2];

        if (ry < 1.5) {
          ry = 13.5 + Math.random() * 2.0;
          rx = (Math.random() - 0.5) * 24;
        }
        this.rainPositions[i * 6] = rx;
        this.rainPositions[i * 6 + 1] = ry;
        this.rainPositions[i * 6 + 2] = rz;
        this.rainPositions[i * 6 + 3] = rx + slantX;
        this.rainPositions[i * 6 + 4] = ry - 0.75;
        this.rainPositions[i * 6 + 5] = rz;
      }
      this.rainLines.geometry.attributes.position.needsUpdate = true;
    }
  }
}
