import * as THREE from 'three';
import {
  JELLY_FLAVOURS,
  JellyFlavourKey,
  SCENE_PALETTE,
} from '../config/designTokens';
import {
  CameraPreset,
  LandingTarget,
  RocketPhase,
  TelemetrySnapshot,
} from '../types/simulation';
import {
  BLOCK_BOTTOM_Y,
  BLOCK_HALF_SIZE,
  JELLY_SURFACE_FRAGMENT,
  JELLY_SURFACE_VERTEX,
  JELLY_WALL_FRAGMENT,
  JELLY_WALL_VERTEX,
  MAX_RIPPLES,
  RippleImpulse,
  WATER_LEVEL,
  evaluateJellySurface,
  evaluateSeabedHeight,
} from './JellyShaders';
import { AnimatedIslandHandles, buildIslandAndSeabed } from './IslandBuilder';
import { VehiclesRig, buildAllVehicles } from './VehiclesBuilder';
import { SpaceportEffectsSystem } from './ParticleSystem';
import { soundEngine } from '../audio/SoundEngine';

export class SpaceportSimulation {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private dioramaGroup: THREE.Group;
  private islandHandles: AnimatedIslandHandles;
  private vehicles: VehiclesRig;
  private effects: SpaceportEffectsSystem;

  // Lights & Environment
  private ambientLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private floorMesh: THREE.Mesh;
  private floorMat: THREE.MeshStandardMaterial;
  private causticGlowMat: THREE.MeshBasicMaterial;

  // Jelly Shader Uniforms
  private jellySurfaceMat!: THREE.ShaderMaterial;
  private jellyWallMat!: THREE.ShaderMaterial;
  private jellySurfaceMesh!: THREE.Mesh;
  private ripples: RippleImpulse[] = [];
  private rippleUniformArray: THREE.Vector4[] = [];

  // Elastic Jelly Wobble & Block Tilt Physics
  private wobbleX = 0;
  private wobbleZ = 0;
  private wobbleVelX = 0;
  private wobbleVelZ = 0;
  private targetTiltX = 0;
  private targetTiltZ = 0;

  // Camera Spherical Orbit & Target Framing
  private camSpherical = { theta: 0.72, phi: 1.04, radius: 28.5 };
  private camTargetSpherical = { theta: 0.72, phi: 1.04, radius: 28.5 };
  private camLookAt = new THREE.Vector3(0, 0.8, 0);
  private camTargetLookAt = new THREE.Vector3(0, 0.8, 0);

  // Pointer Interaction State
  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2();
  private dragMode: 'none' | 'water' | 'block' | 'orbit' = 'none';
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private lastRippleSpawnTime = 0;

  // Simulation State
  private simTime = 0;
  private phase: RocketPhase = 'on_pad';
  private phaseElapsed = 0;
  private countdownRemaining = 10.0;
  private lastBeepSecond = 11;
  private sonicBoomPlayed = false;

  private boosterSerial = 'B1081';
  private flightNumber = 1;
  private sootLevel = 0;
  private launches = 0;
  private landings = 0;
  private fairingsCaught = 0;
  private reflows = 0;

  private landingTarget: LandingTarget = 'drone_ship';
  private flavour: JellyFlavourKey = 'lime';
  private firmness = 65;
  private waveDamping = 38;
  private windSpeed = 6;
  private storm = false;
  private paused = false;
  private soundEnabled = true;
  private cameraPreset: CameraPreset = 'overview';

  // Interpolated Jelly Colors
  private currentShallowColor = new THREE.Color(JELLY_FLAVOURS.lime.shallowHex);
  private currentDeepColor = new THREE.Color(JELLY_FLAVOURS.lime.deepHex);
  private currentCausticColor = new THREE.Color(JELLY_FLAVOURS.lime.causticHex);
  private currentSpecColor = new THREE.Color(JELLY_FLAVOURS.lime.specularHex);

  // Live Telemetry Values
  private altitudeKm = 0;
  private velocityMs = 0;
  private downrangeKm = 0;
  private throttlePct = 0;
  private stage2Status = 'Mounted on stack';
  private droneShipStatus = 'On station · ready to catch';
  private fairingBoatStatus = 'In harbour · net ready';

  // Vessel World Coordinates
  private droneShipPos = new THREE.Vector2(3.6, 5.2);
  private tugBoatPos = new THREE.Vector2(2.4, 0.2);
  private fairingBoatPos = new THREE.Vector2(6.8, -0.1);

  private onTelemetryCallback: (snap: TelemetrySnapshot) => void;
  private lastUiEmit = 0;
  private animFrameId = 0;
  private lastFrameTime = performance.now();

  constructor(
    container: HTMLElement,
    onTelemetry: (snap: TelemetrySnapshot) => void
  ) {
    this.container = container;
    this.onTelemetryCallback = onTelemetry;

    // 1. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_PALETTE.dayBackground);
    this.scene.fog = new THREE.FogExp2(SCENE_PALETTE.dayBackground, 0.0085);

    this.camera = new THREE.PerspectiveCamera(
      36,
      container.clientWidth / container.clientHeight,
      0.5,
      180
    );

    // 3. Studio Lighting
    this.ambientLight = new THREE.HemisphereLight('#ffffff', '#cbd5e1', 0.92);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight('#fffbeb', 1.85);
    this.sunLight.position.set(-16, 26, -14);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 68;
    const d = 17.5;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight('#e0f2fe', 0.55);
    this.rimLight.position.set(18, 12, 16);
    this.scene.add(this.rimLight);

    // 4. Studio Tabletop Floor & Refracted Jelly Caustic Shadow Patch
    this.floorMat = new THREE.MeshStandardMaterial({
      color: SCENE_PALETTE.dayFloor,
      roughness: 0.92,
      metalness: 0.02,
    });
    const floorGeo = new THREE.PlaneGeometry(160, 160);
    floorGeo.rotateX(-Math.PI / 2);
    this.floorMesh = new THREE.Mesh(floorGeo, this.floorMat);
    this.floorMesh.position.y = BLOCK_BOTTOM_Y - 0.02;
    this.floorMesh.receiveShadow = true;
    this.scene.add(this.floorMesh);

    // Translucent Colored Jelly Caustic Transmission Glow on the Tabletop Floor
    this.causticGlowMat = new THREE.MeshBasicMaterial({
      color: JELLY_FLAVOURS.lime.shallowHex,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const causticPatch = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), this.causticGlowMat);
    causticPatch.rotation.x = -Math.PI / 2;
    causticPatch.position.set(5.2, BLOCK_BOTTOM_Y + 0.01, 5.2);
    this.scene.add(causticPatch);

    // 5. Build Diorama Group (Island + Seabed + Vehicles + Jelly Volume + Effects)
    this.dioramaGroup = new THREE.Group();
    this.scene.add(this.dioramaGroup);

    this.islandHandles = buildIslandAndSeabed(this.dioramaGroup);
    this.vehicles = buildAllVehicles(this.dioramaGroup);
    this.effects = new SpaceportEffectsSystem(this.dioramaGroup);
    this.buildJellyVolume();

    // Initialize default state ("On the pad" ready to launch immediately, just like frame0 of the reference!)
    this.setLandingTarget('drone_ship');
    this.positionStackOnPad();
    this.updateDigitalScoreboard('T-00:10', '#10b981');

    // Bind Events
    this.bindEvents();
    this.emitTelemetry(true);
    this.animate();
  }

  private buildJellyVolume(): void {
    for (let i = 0; i < MAX_RIPPLES; i++) {
      this.rippleUniformArray.push(new THREE.Vector4(0, 0, -100, 0));
    }

    const sharedUniforms = {
      uTime: { value: 0 },
      uWindSpeed: { value: this.windSpeed },
      uStorm: { value: 0 },
      uDamping: { value: this.waveDamping },
      uWobble: { value: new THREE.Vector2(0, 0) },
      uRipples: { value: this.rippleUniformArray },
      uShallowColor: { value: this.currentShallowColor },
      uDeepColor: { value: this.currentDeepColor },
      uCausticColor: { value: this.currentCausticColor },
      uSpecularColor: { value: this.currentSpecColor },
      uSunDir: { value: new THREE.Vector3(-0.5, 0.8, -0.4).normalize() },
      uRocketLightPos: { value: new THREE.Vector3(3.8, 3.0, -5.8) },
      uRocketLightIntensity: { value: 0.0 },
    };

    // Top Wave Surface
    const topGeo = new THREE.PlaneGeometry(BLOCK_HALF_SIZE * 2, BLOCK_HALF_SIZE * 2, 128, 128);
    topGeo.rotateX(-Math.PI / 2);
    topGeo.translate(0, WATER_LEVEL, 0);

    this.jellySurfaceMat = new THREE.ShaderMaterial({
      vertexShader: JELLY_SURFACE_VERTEX,
      fragmentShader: JELLY_SURFACE_FRAGMENT,
      uniforms: sharedUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.jellySurfaceMesh = new THREE.Mesh(topGeo, this.jellySurfaceMat);
    this.jellySurfaceMesh.name = 'jelly_water_surface';
    this.jellySurfaceMesh.renderOrder = 2;
    this.dioramaGroup.add(this.jellySurfaceMesh);

    // 4 Vertical Cut-Block Jelly Side Walls
    this.jellyWallMat = new THREE.ShaderMaterial({
      vertexShader: JELLY_WALL_VERTEX,
      fragmentShader: JELLY_WALL_FRAGMENT,
      uniforms: sharedUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const wallHeight = WATER_LEVEL - -3.8;
    const wallCenterY = (-3.8 + WATER_LEVEL) / 2;

    const wallConfigs: { x: number; z: number; rotY: number }[] = [
      { x: 0, z: BLOCK_HALF_SIZE + 0.01, rotY: 0 },
      { x: 0, z: -BLOCK_HALF_SIZE - 0.01, rotY: Math.PI },
      { x: BLOCK_HALF_SIZE + 0.01, z: 0, rotY: Math.PI / 2 },
      { x: -BLOCK_HALF_SIZE - 0.01, z: 0, rotY: -Math.PI / 2 },
    ];

    wallConfigs.forEach((cfg) => {
      const wGeo = new THREE.PlaneGeometry(BLOCK_HALF_SIZE * 2, wallHeight, 96, 24);
      wGeo.rotateY(cfg.rotY);
      wGeo.translate(cfg.x, wallCenterY, cfg.z);
      const wMesh = new THREE.Mesh(wGeo, this.jellyWallMat);
      wMesh.name = 'block_side_wall';
      wMesh.renderOrder = 1;
      this.dioramaGroup.add(wMesh);
    });
  }

  public exciteJellyImpulse(x: number, z: number, strength = 0.85): void {
    this.ripples.unshift({
      x,
      z,
      time: this.simTime,
      strength,
    });
    if (this.ripples.length > MAX_RIPPLES) {
      this.ripples.pop();
    }
    this.wobbleVelX += (Math.random() - 0.5) * strength * 2.4;
    this.wobbleVelZ += (Math.random() - 0.5) * strength * 2.4;
  }

  private updateDigitalScoreboard(text: string, hexColor: string): void {
    const ctx = this.islandHandles.scoreboardCtx;
    const w = this.islandHandles.scoreboardCanvas.width;
    const h = this.islandHandles.scoreboardCanvas.height;

    ctx.fillStyle = '#0f141c';
    ctx.fillRect(0, 0, w, h);

    // Subtle LED matrix grid background
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '600 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`LC-1 · ${this.boosterSerial}.${this.flightNumber}`, w / 2, 24);

    ctx.fillStyle = hexColor;
    ctx.font = '700 40px "JetBrains Mono", monospace';
    ctx.fillText(text, w / 2, 74);

    this.islandHandles.scoreboardTexture.needsUpdate = true;
  }

  // ============================================================================
  // PUBLIC SIMULATION CONTROLS
  // ============================================================================

  public getWeatherNoGoReason(): string | null {
    if (this.storm) return 'NO LAUNCH IN STORM';
    if (this.windSpeed > 15) return `WIND ${this.windSpeed} M/S > 15 M/S LIMIT`;
    return null;
  }

  public triggerPrimaryAction(): void {
    if (this.phase === 'in_hangar') {
      this.triggerRollOut();
    } else if (this.phase === 'on_pad' || this.phase === 'countdown' || this.phase === 'hold') {
      this.triggerLaunchOrHold();
    }
  }

  public triggerRollOut(): void {
    if (this.phase !== 'in_hangar') return;
    this.phase = 'rolling_out';
    this.phaseElapsed = 0;
    soundEngine.playWobble(0.4, this.firmness);
    this.emitTelemetry(true);
  }

  public triggerLaunchOrHold(): void {
    const weatherBlock = this.getWeatherNoGoReason();

    if (this.phase === 'on_pad') {
      if (weatherBlock) {
        soundEngine.playWobble(0.6, this.firmness);
        this.emitTelemetry(true);
        return;
      }
      this.phase = 'countdown';
      this.phaseElapsed = 0;
      this.countdownRemaining = 10.0;
      this.lastBeepSecond = 11;
      soundEngine.playCountdownBeep(10);
      this.emitTelemetry(true);
    } else if (this.phase === 'countdown') {
      // Press again during the count to hold!
      this.phase = 'hold';
      this.updateDigitalScoreboard('HOLD', '#f59e0b');
      soundEngine.playCountdownBeep(5);
      this.emitTelemetry(true);
    } else if (this.phase === 'hold') {
      if (weatherBlock) {
        this.emitTelemetry(true);
        return;
      }
      this.phase = 'countdown';
      soundEngine.playCountdownBeep(Math.ceil(this.countdownRemaining));
      this.emitTelemetry(true);
    }
  }

  public setLandingTarget(target: LandingTarget): void {
    this.landingTarget = target;
    if (target === 'drone_ship') {
      this.vehicles.droneShipRingMat.color.set('#10b981');
      this.islandHandles.landingPadRingMat.color.set('#64748b');
    } else {
      this.vehicles.droneShipRingMat.color.set('#64748b');
      this.islandHandles.landingPadRingMat.color.set('#10b981');
    }
    this.emitTelemetry(true);
  }

  public setFlavour(flavour: JellyFlavourKey): void {
    this.flavour = flavour;
    this.exciteJellyImpulse(2.0, 2.5, 0.65);
    soundEngine.playWobble(0.55, this.firmness);
    this.emitTelemetry(true);
  }

  public setFirmness(val: number): void {
    this.firmness = THREE.MathUtils.clamp(val, 10, 100);
    this.emitTelemetry(true);
  }

  public setWaveDamping(val: number): void {
    this.waveDamping = THREE.MathUtils.clamp(val, 10, 100);
    this.jellySurfaceMat.uniforms.uDamping.value = this.waveDamping;
    this.emitTelemetry(true);
  }

  public setWindSpeed(val: number): void {
    this.windSpeed = THREE.MathUtils.clamp(val, 0, 25);
    this.jellySurfaceMat.uniforms.uWindSpeed.value = this.windSpeed;
    if (this.phase === 'countdown' && this.windSpeed > 15) {
      this.phase = 'hold';
      this.updateDigitalScoreboard('WIND HOLD', '#ef4444');
    }
    this.emitTelemetry(true);
  }

  public setStorm(storm: boolean): void {
    this.storm = storm;
    if (storm && this.windSpeed < 16) {
      this.windSpeed = 18;
      this.jellySurfaceMat.uniforms.uWindSpeed.value = this.windSpeed;
    } else if (!storm && this.windSpeed > 14) {
      this.windSpeed = 6;
      this.jellySurfaceMat.uniforms.uWindSpeed.value = this.windSpeed;
    }
    if (this.phase === 'countdown' && storm) {
      this.phase = 'hold';
      this.updateDigitalScoreboard('STORM', '#ef4444');
    }
    this.exciteJellyImpulse(0, 3.0, 1.1);
    this.emitTelemetry(true);
  }

  public togglePause(): void {
    this.paused = !this.paused;
    this.emitTelemetry(true);
  }

  public toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    soundEngine.setEnabled(this.soundEnabled);
    if (this.soundEnabled) {
      soundEngine.playWobble(0.45, this.firmness);
    }
    this.emitTelemetry(true);
  }

  public cycleCameraPreset(): void {
    const order: CameraPreset[] = ['overview', 'pad', 'booster', 'ship', 'reef'];
    const nextIdx = (order.indexOf(this.cameraPreset) + 1) % order.length;
    this.setCameraPreset(order[nextIdx]);
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.cameraPreset = preset;
    if (preset === 'overview') {
      this.camTargetSpherical = { theta: 0.72, phi: 1.04, radius: 28.5 };
      this.camTargetLookAt.set(0, 0.8, 0);
    } else if (preset === 'pad') {
      this.camTargetSpherical = { theta: 0.45, phi: 1.18, radius: 13.5 };
      this.camTargetLookAt.set(2.4, 2.8, -5.2);
    } else if (preset === 'ship') {
      this.camTargetSpherical = { theta: 0.55, phi: 1.15, radius: 12.8 };
      this.camTargetLookAt.set(this.droneShipPos.x, 2.0, this.droneShipPos.y);
    } else if (preset === 'reef') {
      this.camTargetSpherical = { theta: 0.78, phi: 1.36, radius: 16.5 };
      this.camTargetLookAt.set(2.5, -1.2, 4.5);
    }
    this.emitTelemetry(true);
  }

  public resetSimulation(): void {
    this.phase = 'on_pad';
    this.phaseElapsed = 0;
    this.countdownRemaining = 10.0;
    this.altitudeKm = 0;
    this.velocityMs = 0;
    this.downrangeKm = 0;
    this.throttlePct = 0;
    this.droneShipPos.set(3.6, 5.2);
    this.tugBoatPos.set(2.4, 0.2);
    this.fairingBoatPos.set(6.8, -0.1);
    this.vehicles.towLine.visible = false;
    this.positionStackOnPad();
    this.updateDigitalScoreboard('T-00:10', '#10b981');
    this.setCameraPreset('overview');
    this.exciteJellyImpulse(0, 2.0, 0.9);
    this.emitTelemetry(true);
  }

  // ============================================================================
  // VEHICLE STACK POSITIONING HELPERS
  // ============================================================================

  private attachFullStackToStrongback(crawlerX: number, strongbackAngleZ: number, retractAngle = 0): void {
    const padBaseY = evaluateSeabedHeight(3.8, -5.8);
    this.vehicles.crawlerGroup.position.set(crawlerX, padBaseY, -5.8);
    this.vehicles.strongbackPivot.rotation.set(0, 0, strongbackAngleZ + retractAngle);

    // Position rocket along strongback angle (when strongback retracts slightly, rocket stays vertical)
    const rocketAngle = strongbackAngleZ;
    const pivotWorld = new THREE.Vector3(crawlerX, padBaseY + 0.36, -5.8);

    this.vehicles.boosterGroup.position.copy(pivotWorld);
    this.vehicles.boosterGroup.rotation.set(0, 0, rocketAngle);
    this.vehicles.boosterPlumeGroup.visible = false;
    this.vehicles.rocketLight.intensity = 0;

    // Fold grid fins & legs flat
    this.vehicles.gridFinPivots.forEach((p) => p.rotation.set(0, p.rotation.y, -Math.PI / 2));
    this.vehicles.legPivots.forEach((p) => p.rotation.set(0, p.rotation.y, 0));

    // Place Stage 2 & Fairings on top of Booster (offset 2.38m along booster axis)
    const upDir = new THREE.Vector3(-Math.sin(rocketAngle), Math.cos(rocketAngle), 0);
    const s2Pos = pivotWorld.clone().addScaledVector(upDir, 2.38);

    this.vehicles.stage2Group.visible = true;
    this.vehicles.stage2Group.position.copy(s2Pos);
    this.vehicles.stage2Group.rotation.set(0, 0, rocketAngle);
    this.vehicles.stage2Plume.visible = false;

    const fairingPos = pivotWorld.clone().addScaledVector(upDir, 3.0);
    this.vehicles.fairings.forEach((f) => {
      f.group.visible = true;
      f.group.position.copy(fairingPos);
      f.group.rotation.set(0, 0, rocketAngle);
      f.parafoilGroup.visible = false;
    });
  }

  private positionStackOnPad(): void {
    this.islandHandles.hangarDoorLeft.position.z = -2.6 * 0.24;
    this.islandHandles.hangarDoorRight.position.z = 2.6 * 0.24;
    this.islandHandles.craneTurret.rotation.y = 0;
    this.islandHandles.craneCable.scale.y = 1.4;
    this.islandHandles.craneSpreader.position.y = -1.4;
    this.attachFullStackToStrongback(3.8, 0, -0.06);
  }

  // ============================================================================
  // MAIN ANIMATION & PHYSICS STEP
  // ============================================================================

  private updateFlightSequence(dt: number): void {
    this.phaseElapsed += dt;
    const padBaseY = evaluateSeabedHeight(3.8, -5.8);
    let currentThrustSound = 0;

    switch (this.phase) {
      case 'in_hangar': {
        this.attachFullStackToStrongback(-5.5, -Math.PI / 2, 0);
        this.islandHandles.hangarDoorLeft.position.z = THREE.MathUtils.lerp(
          this.islandHandles.hangarDoorLeft.position.z,
          -2.6 * 0.24,
          dt * 5
        );
        this.islandHandles.hangarDoorRight.position.z = THREE.MathUtils.lerp(
          this.islandHandles.hangarDoorRight.position.z,
          2.6 * 0.24,
          dt * 5
        );
        this.altitudeKm = 0;
        this.velocityMs = 0;
        this.throttlePct = 0;
        this.stage2Status = 'Horizontal integration in HIF';
        this.droneShipStatus = 'On station · awaiting rollout';
        this.fairingBoatStatus = 'In harbour · standby';
        this.updateDigitalScoreboard('HANGAR', '#38bdf8');
        break;
      }

      case 'rolling_out': {
        const dur = 3.8;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);
        const smoothT = THREE.MathUtils.smoothstep(t, 0, 1);

        // Open bi-parting hangar doors
        this.islandHandles.hangarDoorLeft.position.z = THREE.MathUtils.lerp(-0.62, -1.18, Math.min(1, t * 3));
        this.islandHandles.hangarDoorRight.position.z = THREE.MathUtils.lerp(0.62, 1.18, Math.min(1, t * 3));

        const crawlerX = THREE.MathUtils.lerp(-5.5, 3.8, smoothT);
        this.attachFullStackToStrongback(crawlerX, -Math.PI / 2, 0);
        this.updateDigitalScoreboard('ROLL OUT', '#38bdf8');
        this.stage2Status = 'Transporter rolling to LC-1';

        if (t >= 1) {
          this.phase = 'erecting';
          this.phaseElapsed = 0;
        }
        break;
      }

      case 'erecting': {
        const dur = 2.6;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);
        const smoothT = THREE.MathUtils.smoothstep(t, 0, 1);
        const angle = THREE.MathUtils.lerp(-Math.PI / 2, 0, smoothT);

        // Close hangar doors once clear
        this.islandHandles.hangarDoorLeft.position.z = THREE.MathUtils.lerp(-1.18, -0.62, smoothT);
        this.islandHandles.hangarDoorRight.position.z = THREE.MathUtils.lerp(1.18, 0.62, smoothT);

        this.attachFullStackToStrongback(3.8, angle, 0);
        this.updateDigitalScoreboard('ERECTING', '#38bdf8');
        this.stage2Status = 'Strongback raising stack vertical';

        if (t >= 1) {
          this.phase = 'on_pad';
          this.phaseElapsed = 0;
          this.countdownRemaining = 10.0;
          this.updateDigitalScoreboard('T-00:10', '#10b981');
          this.emitTelemetry(true);
        }
        break;
      }

      case 'on_pad': {
        this.attachFullStackToStrongback(3.8, 0, -0.05);
        // Occasional cryogenic LOX vent puff
        if (Math.random() < dt * 3.5) {
          this.effects.spawnSmoke(3.8, padBaseY + 2.1, -5.8, 0.35, 0.25, 0.1, 0.08, 0.32, 1.1, 0);
        }
        this.stage2Status = 'LOX / RP-1 propellant load complete';
        this.droneShipStatus =
          this.landingTarget === 'drone_ship'
            ? 'On station · ready to catch B1'
            : 'Standby at sea (RTLS selected)';
        this.fairingBoatStatus = 'In harbour · ready to depart';
        break;
      }

      case 'hold': {
        this.attachFullStackToStrongback(3.8, 0, -0.06);
        this.stage2Status = 'Countdown holding · awaiting range go';
        break;
      }

      case 'countdown': {
        const weatherBlock = this.getWeatherNoGoReason();
        if (weatherBlock) {
          this.phase = 'hold';
          this.updateDigitalScoreboard('NO-GO', '#ef4444');
          this.emitTelemetry(true);
          break;
        }

        this.countdownRemaining = Math.max(0, this.countdownRemaining - dt);
        const secCeil = Math.ceil(this.countdownRemaining);
        if (secCeil !== this.lastBeepSecond && secCeil >= 1) {
          this.lastBeepSecond = secCeil;
          soundEngine.playCountdownBeep(secCeil);
        }

        const retract = this.countdownRemaining < 3.5 ? -0.18 : -0.06;
        this.attachFullStackToStrongback(3.8, 0, retract);

        // Pre-ignition deluge water steam at T-3s
        if (this.countdownRemaining < 3.0) {
          for (let s = 0; s < 2; s++) {
            this.effects.spawnSmoke(
              3.8 + (Math.random() - 0.5) * 0.4,
              padBaseY + 0.35,
              -5.8 + (Math.random() - 0.5) * 0.4,
              (Math.random() - 0.5) * 1.8,
              0.45,
              (Math.random() - 0.5) * 1.8,
              0.16,
              0.75,
              1.2,
              this.countdownRemaining < 1.2 ? 0.6 : 0.0
            );
          }
        }

        const padSec = String(secCeil).padStart(2, '0');
        this.updateDigitalScoreboard(`T-00:${padSec}`, secCeil <= 3 ? '#f59e0b' : '#10b981');
        this.stage2Status = secCeil <= 3 ? 'Water deluge & engine chilldown' : 'Startup — internal power';

        if (this.countdownRemaining <= 0) {
          this.phase = 'ignition';
          this.phaseElapsed = 0;
          this.launches += 1;
          soundEngine.playCountdownBeep(0);
          this.exciteJellyImpulse(3.8, -3.5, 1.35);
          this.emitTelemetry(true);
        }
        break;
      }

      case 'ignition': {
        const dur = 1.25;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);
        this.attachFullStackToStrongback(3.8, 0, -0.26);

        this.vehicles.boosterPlumeGroup.visible = true;
        this.vehicles.boosterPlumeGroup.scale.setScalar(0.85 + Math.random() * 0.35);
        this.vehicles.rocketLight.intensity = 4.5 + Math.random() * 1.5;
        this.jellySurfaceMat.uniforms.uRocketLightPos.value.set(3.8, padBaseY + 1.0, -5.8);
        this.jellySurfaceMat.uniforms.uRocketLightIntensity.value = 1.6;
        currentThrustSound = 0.85;
        this.throttlePct = 100;

        // Massive flame trench steam & ignition smoke billowing outward
        for (let i = 0; i < 5; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 1.8 + Math.random() * 2.8;
          this.effects.spawnSmoke(
            3.8 + Math.cos(ang) * 0.3,
            padBaseY + 0.35,
            -5.8 + Math.sin(ang) * 0.3,
            Math.cos(ang) * spd,
            0.3 + Math.random() * 0.6,
            Math.sin(ang) * spd,
            0.25,
            1.65,
            1.9,
            0.85
          );
        }

        this.updateDigitalScoreboard('IGNITION', '#f97316');
        if (t >= 1) {
          this.phase = 'liftoff';
          this.phaseElapsed = 0;
        }
        break;
      }

      case 'liftoff':
      case 'max_q': {
        const totalAscentElapsed =
          this.phase === 'liftoff' ? this.phaseElapsed : 4.0 + this.phaseElapsed;
        const normT = THREE.MathUtils.clamp(totalAscentElapsed / 7.8, 0, 1);

        // Accelerating vertical climb + gentle gravity turn pitch downrange (+X, +Z)
        const climbY = Math.pow(normT, 1.88) * 16.8;
        const downrangeZ = Math.pow(normT, 2.1) * 4.2;
        const downrangeX = Math.pow(normT, 2.1) * 1.4;
        const pitchZ = -normT * 0.16;
        const pitchX = normT * 0.24;

        const rx = 3.8 + downrangeX;
        const ry = padBaseY + 0.36 + climbY;
        const rz = -5.8 + downrangeZ;

        this.vehicles.boosterGroup.position.set(rx, ry, rz);
        this.vehicles.boosterGroup.rotation.set(pitchX, 0, pitchZ);
        this.vehicles.boosterPlumeGroup.visible = true;
        this.vehicles.boosterPlumeGroup.scale.set(
          0.95 + Math.random() * 0.2,
          1.15 + Math.random() * 0.3,
          0.95 + Math.random() * 0.2
        );
        this.vehicles.rocketLight.intensity = 4.0;
        this.jellySurfaceMat.uniforms.uRocketLightPos.value.set(rx, ry, rz);
        this.jellySurfaceMat.uniforms.uRocketLightIntensity.value = Math.max(0.2, 1.5 - normT * 1.1);

        // Attach Stage 2 & Fairings along the pitched booster axis
        const upVec = new THREE.Vector3(0, 1, 0).applyEuler(this.vehicles.boosterGroup.rotation);
        this.vehicles.stage2Group.position.copy(this.vehicles.boosterGroup.position).addScaledVector(upVec, 2.38);
        this.vehicles.stage2Group.rotation.copy(this.vehicles.boosterGroup.rotation);

        this.vehicles.fairings.forEach((f) => {
          f.group.position.copy(this.vehicles.boosterGroup.position).addScaledVector(upVec, 3.0);
          f.group.rotation.copy(this.vehicles.boosterGroup.rotation);
        });

        // Exhaust smoke plume trail
        for (let i = 0; i < 3; i++) {
          this.effects.spawnSmoke(
            rx - upVec.x * 0.6 + (Math.random() - 0.5) * 0.22,
            ry - upVec.y * 0.6,
            rz - upVec.z * 0.6 + (Math.random() - 0.5) * 0.22,
            (Math.random() - 0.5) * 0.8,
            -1.2,
            (Math.random() - 0.5) * 0.8,
            0.24,
            1.35,
            1.65,
            0.75
          );
        }

        // Fairing boat sails out downrange toward (6.5, 4.8)
        this.fairingBoatPos.x = THREE.MathUtils.lerp(6.8, 6.4, normT);
        this.fairingBoatPos.y = THREE.MathUtils.lerp(-0.1, 4.8, normT);
        this.fairingBoatStatus = 'Heading downrange · tracking fairings';

        this.altitudeKm = Math.round(normT * 68 * 10) / 10;
        this.velocityMs = Math.round(normT * 1680);
        this.downrangeKm = Math.round(normT * 32 * 10) / 10;
        this.throttlePct = 100;
        currentThrustSound = 1.0 - normT * 0.35;

        this.updateDigitalScoreboard(this.phase === 'liftoff' ? 'LIFTOFF' : 'MAX Q', '#10b981');

        if (this.phase === 'liftoff' && this.phaseElapsed >= 4.0) {
          this.phase = 'max_q';
          this.phaseElapsed = 0;
          this.emitTelemetry(true);
        } else if (this.phase === 'max_q' && this.phaseElapsed >= 3.8) {
          this.phase = 'meco_sep';
          this.phaseElapsed = 0;
          soundEngine.playStageSep();
          // Cold-gas stage separation puff ring
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            this.effects.spawnSmoke(
              rx,
              ry + 2.3,
              rz,
              Math.cos(a) * 1.4,
              0.2,
              Math.sin(a) * 1.4,
              0.18,
              0.7,
              1.1,
              0.1
            );
          }
          this.emitTelemetry(true);
        }
        break;
      }

      case 'meco_sep': {
        const dur = 2.6;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);

        // Stage 1 coasts upward slightly and begins pitching over for boostback flip
        const bPos = this.vehicles.boosterGroup.position;
        bPos.y = 19.3 + Math.sin(t * Math.PI * 0.5) * 1.4;
        this.vehicles.boosterGroup.rotation.set(0.24 + t * 0.85, 0, -0.16 - t * 0.35);
        this.vehicles.boosterPlumeGroup.visible = false;
        this.vehicles.rocketLight.intensity = 0;
        this.jellySurfaceMat.uniforms.uRocketLightIntensity.value = 0;

        // Stage 2 lights vacuum engine and accelerates up and away
        this.vehicles.stage2Plume.visible = true;
        this.vehicles.stage2Group.position.set(
          5.2 + t * 2.2,
          21.7 + t * 4.5,
          -1.6 + t * 2.8
        );

        // Clamshell Fairing halves split apart and deploy striped Parafoils!
        this.vehicles.fairings.forEach((f, idx) => {
          const side = idx === 0 ? -1 : 1;
          f.group.position.set(
            5.2 + side * (0.25 + t * 1.35),
            21.8 + t * 0.6 - t * t * 1.2,
            -1.4 + t * 1.8
          );
          f.group.rotation.set(0.2, side * 0.4, side * t * 0.5);
          f.parafoilGroup.visible = t > 0.35;
          if (f.parafoilGroup.visible) {
            const pScale = THREE.MathUtils.smoothstep(t, 0.35, 0.9);
            f.parafoilGroup.scale.setScalar(pScale);
          }
        });

        this.altitudeKm = 74.5 + t * 12;
        this.velocityMs = 1620 - Math.round(t * 140);
        this.throttlePct = 0;
        this.stage2Status = 'Second stage MVac ignition · fairing sep';
        this.updateDigitalScoreboard('STAGE SEP', '#38bdf8');

        if (t >= 1) {
          this.phase = 'boostback_burn';
          this.phaseElapsed = 0;
          this.emitTelemetry(true);
        }
        break;
      }

      case 'boostback_burn': {
        const dur = 3.6;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);

        const targetX = this.landingTarget === 'drone_ship' ? this.droneShipPos.x : -6.8;
        const targetZ = this.landingTarget === 'drone_ship' ? this.droneShipPos.y : 0.8;

        // Booster arcs at high altitude toward target while firing boostback burn
        const bx = THREE.MathUtils.lerp(5.2, (5.2 + targetX) * 0.5, t);
        const bz = THREE.MathUtils.lerp(-1.6, (-1.6 + targetZ) * 0.5, t);
        const by = 20.7 - t * 3.2;

        this.vehicles.boosterGroup.position.set(bx, by, bz);
        // Flip back to vertical engines-down orientation while deploying grid fins
        const flipAngle = THREE.MathUtils.lerp(1.05, 0.18, THREE.MathUtils.smoothstep(t, 0, 1));
        this.vehicles.boosterGroup.rotation.set(flipAngle, 0, -flipAngle * 0.4);

        this.vehicles.boosterPlumeGroup.visible = true;
        this.vehicles.boosterPlumeGroup.scale.setScalar(0.75 + Math.random() * 0.25);
        currentThrustSound = 0.55;
        this.throttlePct = 65;

        // Deploy Titanium Grid Fins outward
        const finDeploy = THREE.MathUtils.lerp(-Math.PI / 2, 0, Math.min(1, t * 2));
        this.vehicles.gridFinPivots.forEach((p) => p.rotation.set(0, p.rotation.y, finDeploy));

        // Stage 2 climbs out of frame into orbit
        this.vehicles.stage2Group.position.y += dt * 6.5;
        if (this.vehicles.stage2Group.position.y > 42) {
          this.vehicles.stage2Group.visible = false;
        }

        // Fairings glide down under parafoils toward the Fairing Boat at (6.4, 4.8)
        this.updateParafoilFairings(t * 0.35);

        this.altitudeKm = Math.round((86 - t * 18) * 10) / 10;
        this.velocityMs = Math.round(1480 - t * 420);
        this.stage2Status = 'Stage 2 in nominal orbital insertion';
        this.fairingBoatStatus = 'Lining up catch net under parafoils';
        this.updateDigitalScoreboard('BOOSTBACK', '#f97316');

        if (t >= 1) {
          this.phase = 'entry_burn';
          this.phaseElapsed = 0;
          this.emitTelemetry(true);
        }
        break;
      }

      case 'entry_burn': {
        const dur = 3.4;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);

        const targetX = this.landingTarget === 'drone_ship' ? this.droneShipPos.x : -6.8;
        const targetZ = this.landingTarget === 'drone_ship' ? this.droneShipPos.y : 0.8;

        const startX = (5.2 + targetX) * 0.5;
        const startZ = (-1.6 + targetZ) * 0.5;
        const bx = THREE.MathUtils.lerp(startX, targetX, t * 0.72);
        const bz = THREE.MathUtils.lerp(startZ, targetZ, t * 0.72);
        const by = THREE.MathUtils.lerp(17.5, 9.8, t);

        this.vehicles.boosterGroup.position.set(bx, by, bz);
        this.vehicles.boosterGroup.rotation.set(
          0.14 * (1 - t),
          0,
          -0.08 * (1 - t)
        );

        // Dramatic Entry Burn plasma trail
        this.vehicles.boosterPlumeGroup.visible = true;
        this.vehicles.boosterPlumeGroup.scale.set(1.1, 1.45, 1.1);
        currentThrustSound = 0.72;
        this.throttlePct = 78;

        for (let i = 0; i < 2; i++) {
          this.effects.spawnSmoke(
            bx + (Math.random() - 0.5) * 0.25,
            by - 0.4,
            bz + (Math.random() - 0.5) * 0.25,
            (Math.random() - 0.5) * 0.5,
            1.8,
            (Math.random() - 0.5) * 0.5,
            0.22,
            0.95,
            1.1,
            0.95
          );
        }

        this.updateParafoilFairings(0.35 + t * 0.35);

        this.altitudeKm = Math.round((68 - t * 42) * 10) / 10;
        this.velocityMs = Math.round(1060 - t * 620);
        this.updateDigitalScoreboard('ENTRY BURN', '#f97316');

        if (t >= 1) {
          this.phase = 'grid_fin_glide';
          this.phaseElapsed = 0;
          this.sonicBoomPlayed = false;
          this.emitTelemetry(true);
        }
        break;
      }

      case 'grid_fin_glide': {
        const dur = 3.0;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);

        const targetX = this.landingTarget === 'drone_ship' ? this.droneShipPos.x : -6.8;
        const targetZ = this.landingTarget === 'drone_ship' ? this.droneShipPos.y : 0.8;

        const startX = THREE.MathUtils.lerp((5.2 + targetX) * 0.5, targetX, 0.72);
        const startZ = THREE.MathUtils.lerp((-1.6 + targetZ) * 0.5, targetZ, 0.72);

        const bx = THREE.MathUtils.lerp(startX, targetX, t);
        const bz = THREE.MathUtils.lerp(startZ, targetZ, t);
        const by = THREE.MathUtils.lerp(9.8, 5.4, t);

        this.vehicles.boosterGroup.position.set(bx, by, bz);
        this.vehicles.boosterGroup.rotation.set(
          Math.sin(t * Math.PI * 2) * 0.04,
          0,
          Math.cos(t * Math.PI * 2) * 0.04
        );
        this.vehicles.boosterPlumeGroup.visible = false;
        this.throttlePct = 0;

        // Active aerodynamic grid fin steering oscillation
        this.vehicles.gridFinPivots.forEach((p, idx) => {
          p.rotation.x = Math.sin(this.simTime * 8 + idx) * 0.22;
        });

        if (t > 0.65 && !this.sonicBoomPlayed) {
          this.sonicBoomPlayed = true;
          soundEngine.playSonicBoom();
        }

        this.updateParafoilFairings(0.7 + t * 0.22);

        this.altitudeKm = Math.round((26 - t * 21) * 10) / 10;
        this.velocityMs = Math.round(440 - t * 240);
        this.updateDigitalScoreboard('GRID FINS', '#38bdf8');

        if (t >= 1) {
          this.phase = 'landing_burn';
          this.phaseElapsed = 0;
          this.emitTelemetry(true);
        }
        break;
      }

      case 'landing_burn': {
        const dur = 3.6;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);
        const easeOut = 1 - Math.pow(1 - t, 2.4);

        const targetX = this.landingTarget === 'drone_ship' ? this.droneShipPos.x : -6.8;
        const targetZ = this.landingTarget === 'drone_ship' ? this.droneShipPos.y : 0.8;
        const targetTouchdownY =
          this.landingTarget === 'drone_ship'
            ? this.vehicles.droneShipGroup.position.y + 0.24
            : evaluateSeabedHeight(-6.8, 0.8) + 0.16;

        const by = THREE.MathUtils.lerp(5.4, targetTouchdownY, easeOut);
        this.vehicles.boosterGroup.position.set(targetX, by, targetZ);
        this.vehicles.boosterGroup.rotation.set(0, 0, 0);

        this.vehicles.boosterPlumeGroup.visible = true;
        this.vehicles.boosterPlumeGroup.scale.set(0.55, 0.85 * (1 - t * 0.35), 0.55);
        this.vehicles.rocketLight.intensity = 3.2;
        this.jellySurfaceMat.uniforms.uRocketLightPos.value.set(targetX, by, targetZ);
        this.jellySurfaceMat.uniforms.uRocketLightIntensity.value = 1.25;
        currentThrustSound = 0.78 * (1 - t * 0.4);
        this.throttlePct = Math.round(85 - t * 45);

        // Deploy 4 Carbon-Fiber Landing Legs in the final 55% of landing burn!
        const legT = THREE.MathUtils.smoothstep(t, 0.38, 0.82);
        const legAngle = THREE.MathUtils.lerp(0, 2.04, legT);
        this.vehicles.legPivots.forEach((p) => {
          p.rotation.z = -legAngle;
        });

        // Plume wash ripples & mist on water/pad
        if (t > 0.35) {
          if (this.landingTarget === 'drone_ship' && Math.random() < dt * 7) {
            this.exciteJellyImpulse(targetX, targetZ, 0.38);
          }
          for (let s = 0; s < 2; s++) {
            const ang = Math.random() * Math.PI * 2;
            this.effects.spawnSmoke(
              targetX + Math.cos(ang) * 0.35,
              targetTouchdownY + 0.08,
              targetZ + Math.sin(ang) * 0.35,
              Math.cos(ang) * 1.6,
              0.25,
              Math.sin(ang) * 1.6,
              0.16,
              0.85,
              0.95,
              0.4
            );
          }
        }

        // Complete fairing catch on the Fairing Boat net!
        this.updateParafoilFairings(0.92 + t * 0.08);

        this.altitudeKm = Math.round((5.0 * (1 - easeOut)) * 100) / 100;
        this.velocityMs = Math.round(200 * (1 - easeOut));
        this.updateDigitalScoreboard('LANDING', '#f59e0b');

        if (t >= 1) {
          this.phase = 'landed';
          this.phaseElapsed = 0;
          this.landings += 1;
          this.fairingsCaught += 2;
          this.sootLevel = Math.min(1, this.sootLevel + 0.28);
          this.applyBoosterSoot();
          this.vehicles.boosterPlumeGroup.visible = false;
          this.vehicles.rocketLight.intensity = 0;
          this.jellySurfaceMat.uniforms.uRocketLightIntensity.value = 0;
          this.exciteJellyImpulse(targetX, targetZ, 0.95);
          soundEngine.playRecoveryChime();
          this.updateDigitalScoreboard('LANDED', '#10b981');
          this.emitTelemetry(true);
        }
        break;
      }

      case 'landed': {
        const dur = 2.4;
        this.pinBoosterToLandingSite();
        this.altitudeKm = 0;
        this.velocityMs = 0;
        this.throttlePct = 0;
        this.stage2Status = 'Payload deployed in orbit';
        this.fairingBoatStatus = 'Both fairing halves caught in net!';
        this.droneShipStatus =
          this.landingTarget === 'drone_ship'
            ? 'Booster landed on deck · securing'
            : 'Booster landed at LZ-1';

        if (this.phaseElapsed >= dur) {
          this.phase = this.landingTarget === 'drone_ship' ? 'tug_recovery' : 'refurbishing';
          this.phaseElapsed = 0;
          this.emitTelemetry(true);
        }
        break;
      }

      case 'tug_recovery': {
        // Tugboat tows the Drone Ship (carrying the landed booster) into the Harbour Pier beside the Crane!
        const dur = 5.2;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);
        const smoothT = THREE.MathUtils.smoothstep(t, 0, 1);

        // Drone ship moves from sea station (3.6, 5.2) to harbour berth (4.3, 0.45)
        this.droneShipPos.x = THREE.MathUtils.lerp(3.6, 4.3, smoothT);
        this.droneShipPos.y = THREE.MathUtils.lerp(5.2, 0.45, smoothT);

        // Tugboat leads ahead of the Drone Ship bow and connects the yellow tow cable
        this.tugBoatPos.x = this.droneShipPos.x - 1.65;
        this.tugBoatPos.y = this.droneShipPos.y - 0.55;

        this.vehicles.towLine.visible = true;
        this.vehicles.towLinePositions[0] = this.tugBoatPos.x + 0.35;
        this.vehicles.towLinePositions[1] = this.vehicles.tugBoatGroup.position.y + 0.15;
        this.vehicles.towLinePositions[2] = this.tugBoatPos.y;
        this.vehicles.towLinePositions[3] = this.droneShipPos.x - 1.25;
        this.vehicles.towLinePositions[4] = this.vehicles.droneShipGroup.position.y + 0.24;
        this.vehicles.towLinePositions[5] = this.droneShipPos.y;
        this.vehicles.towLine.geometry.attributes.position.needsUpdate = true;

        // Fairing boat also sails back toward harbour
        this.fairingBoatPos.x = THREE.MathUtils.lerp(6.4, 6.8, smoothT);
        this.fairingBoatPos.y = THREE.MathUtils.lerp(4.8, -0.1, smoothT);
        this.vehicles.fairings.forEach((f) => {
          f.group.visible = false;
        });

        this.pinBoosterToLandingSite();
        this.droneShipStatus = 'Under tow by harbour tug to pier';
        this.fairingBoatStatus = 'Returning caught fairings to port';
        this.updateDigitalScoreboard('UNDER TOW', '#38bdf8');

        if (t >= 1) {
          this.vehicles.towLine.visible = false;
          this.phase = 'crane_offload';
          this.phaseElapsed = 0;
          this.emitTelemetry(true);
        }
        break;
      }

      case 'crane_offload': {
        // Port Hammerhead Crane rotates over the berthed Drone Ship, lifts the booster off the deck, and swings it ashore!
        const dur = 4.6;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);

        this.droneShipStatus = 'Berthed at pier · crane offloading B1';
        this.updateDigitalScoreboard('CRANE LIFT', '#eab308');

        if (t < 0.3) {
          // Crane lowers spreader hook onto booster interstage
          const subT = t / 0.3;
          this.islandHandles.craneTurret.rotation.y = THREE.MathUtils.lerp(0, -0.12, subT);
          const cableLen = THREE.MathUtils.lerp(1.4, 2.25, subT);
          this.islandHandles.craneCable.scale.y = cableLen;
          this.islandHandles.craneSpreader.position.y = -cableLen;
          this.pinBoosterToLandingSite();
        } else {
          // Crane hoists booster up and swings turret toward shore transfer cradle
          const subT = THREE.MathUtils.smoothstep((t - 0.3) / 0.7, 0, 1);
          const rotY = THREE.MathUtils.lerp(-0.12, -1.45, subT);
          this.islandHandles.craneTurret.rotation.y = rotY;

          const liftOffset = Math.sin(subT * Math.PI) * 1.35 + subT * 0.55;
          const cableLen = Math.max(0.85, 2.25 - liftOffset * 0.65);
          this.islandHandles.craneCable.scale.y = cableLen;
          this.islandHandles.craneSpreader.position.y = -cableLen;

          // Compute world position of crane spreader hook so booster hangs directly beneath it
          const spreaderWorld = new THREE.Vector3();
          this.islandHandles.craneSpreader.getWorldPosition(spreaderWorld);
          this.dioramaGroup.worldToLocal(spreaderWorld);

          this.vehicles.boosterGroup.position.set(
            spreaderWorld.x,
            spreaderWorld.y - 2.38,
            spreaderWorld.z
          );
          this.vehicles.boosterGroup.rotation.set(0, rotY, 0);

          // Fold landing legs back up while suspended on the crane
          const legFold = THREE.MathUtils.lerp(2.04, 0, subT);
          this.vehicles.legPivots.forEach((p) => {
            p.rotation.z = -legFold;
          });
        }

        if (t >= 1) {
          this.phase = 'refurbishing';
          this.phaseElapsed = 0;
          this.emitTelemetry(true);
        }
        break;
      }

      case 'refurbishing': {
        const dur = 2.2;
        const t = THREE.MathUtils.clamp(this.phaseElapsed / dur, 0, 1);

        // Return Drone Ship to sea station and reset crane
        this.droneShipPos.x = THREE.MathUtils.lerp(this.droneShipPos.x, 3.6, dt * 3);
        this.droneShipPos.y = THREE.MathUtils.lerp(this.droneShipPos.y, 5.2, dt * 3);
        this.tugBoatPos.x = THREE.MathUtils.lerp(this.tugBoatPos.x, 2.4, dt * 3);
        this.tugBoatPos.y = THREE.MathUtils.lerp(this.tugBoatPos.y, 0.2, dt * 3);
        this.islandHandles.craneTurret.rotation.y = THREE.MathUtils.lerp(
          this.islandHandles.craneTurret.rotation.y,
          0,
          dt * 3
        );

        this.vehicles.fairings.forEach((f) => {
          f.group.visible = false;
        });

        if (t >= 1) {
          this.flightNumber += 1;
          this.reflows += 1;
          this.droneShipPos.set(3.6, 5.2);
          this.tugBoatPos.set(2.4, 0.2);
          this.fairingBoatPos.set(6.8, -0.1);
          this.phase = 'in_hangar';
          this.phaseElapsed = 0;
          this.attachFullStackToStrongback(-5.5, -Math.PI / 2, 0);
          soundEngine.playRecoveryChime();
          this.emitTelemetry(true);
        }
        break;
      }
    }

    soundEngine.updateContinuous(currentThrustSound, this.windSpeed, this.storm, this.paused);
  }

  private updateParafoilFairings(progress: number): void {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const boatX = this.fairingBoatPos.x + 0.28;
    const boatZ = this.fairingBoatPos.y;
    const catchY = this.vehicles.fairingBoatGroup.position.y + 0.78;

    this.vehicles.fairings.forEach((f, idx) => {
      const side = idx === 0 ? -1 : 1;
      f.group.visible = true;
      f.parafoilGroup.visible = p < 0.96;
      f.parafoilGroup.scale.setScalar(1.0);

      const sTurn = Math.sin(p * Math.PI * 3 + idx * 1.5) * (1 - p) * 1.4;
      const fx = THREE.MathUtils.lerp(5.2 + side * 1.6, boatX + side * 0.16, p) + sTurn;
      const fz = THREE.MathUtils.lerp(0.4, boatZ + side * 0.14, p);
      const fy = THREE.MathUtils.lerp(21.2, catchY, Math.pow(p, 0.85));

      f.group.position.set(fx, fy, fz);
      f.group.rotation.set(0.08 * (1 - p), side * 0.2, Math.cos(p * Math.PI * 3) * 0.18 * (1 - p));
    });
  }

  private pinBoosterToLandingSite(): void {
    if (this.landingTarget === 'drone_ship') {
      const shipPos = this.vehicles.droneShipGroup.position;
      const shipRot = this.vehicles.droneShipGroup.rotation;
      this.vehicles.boosterGroup.position.set(shipPos.x, shipPos.y + 0.24, shipPos.z);
      this.vehicles.boosterGroup.rotation.copy(shipRot);
    } else {
      const lzY = evaluateSeabedHeight(-6.8, 0.8);
      this.vehicles.boosterGroup.position.set(-6.8, lzY + 0.16, 0.8);
      this.vehicles.boosterGroup.rotation.set(0, 0, 0);
    }
  }

  private applyBoosterSoot(): void {
    const clean = new THREE.Color(SCENE_PALETTE.rocketBody);
    const sooty = new THREE.Color('#6b665e');
    this.vehicles.boosterBodyMat.color.copy(clean).lerp(sooty, Math.min(0.65, this.sootLevel));
  }

  private updateCameraFraming(dt: number): void {
    // Intelligent automatic framing when in 'overview' or 'booster' mode during active flight
    if (this.cameraPreset === 'booster') {
      const bPos = this.vehicles.boosterGroup.position;
      this.camTargetLookAt.lerp(new THREE.Vector3(bPos.x, Math.max(1.5, bPos.y + 0.8), bPos.z), dt * 6);
    } else if (this.cameraPreset === 'overview' && this.dragMode !== 'orbit') {
      const bPos = this.vehicles.boosterGroup.position;
      const inAir =
        this.phase === 'liftoff' ||
        this.phase === 'max_q' ||
        this.phase === 'meco_sep' ||
        this.phase === 'boostback_burn' ||
        this.phase === 'entry_burn' ||
        this.phase === 'grid_fin_glide' ||
        this.phase === 'landing_burn';

      if (inAir) {
        const focusY = THREE.MathUtils.clamp(bPos.y * 0.52, 0.8, 10.5);
        this.camTargetLookAt.set(bPos.x * 0.25, focusY, bPos.z * 0.25);
        this.camTargetSpherical.radius = 28.5 + THREE.MathUtils.clamp(bPos.y * 0.48, 0, 11.5);
      } else {
        this.camTargetLookAt.set(0, 0.8, 0);
        this.camTargetSpherical.radius = 28.5;
      }
    }

    const damp = Math.min(1, dt * 6.5);
    this.camSpherical.theta = THREE.MathUtils.lerp(this.camSpherical.theta, this.camTargetSpherical.theta, damp);
    this.camSpherical.phi = THREE.MathUtils.lerp(this.camSpherical.phi, this.camTargetSpherical.phi, damp);
    this.camSpherical.radius = THREE.MathUtils.lerp(this.camSpherical.radius, this.camTargetSpherical.radius, damp);
    this.camLookAt.lerp(this.camTargetLookAt, damp);

    const sinPhi = Math.sin(this.camSpherical.phi);
    const cx = this.camLookAt.x + this.camSpherical.radius * sinPhi * Math.sin(this.camSpherical.theta);
    const cy = this.camLookAt.y + this.camSpherical.radius * Math.cos(this.camSpherical.phi);
    const cz = this.camLookAt.z + this.camSpherical.radius * sinPhi * Math.cos(this.camSpherical.theta);

    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.camLookAt);
  }

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const rawDt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const dt = this.paused ? 0 : rawDt;

    this.simTime += dt;

    // 1. Smoothly transition Jelly Flavour optical colors & Studio Storm lighting
    const spec = JELLY_FLAVOURS[this.flavour];
    this.currentShallowColor.lerp(new THREE.Color(spec.shallowHex), rawDt * 5);
    this.currentDeepColor.lerp(new THREE.Color(spec.deepHex), rawDt * 5);
    this.currentCausticColor.lerp(new THREE.Color(spec.causticHex), rawDt * 5);
    this.currentSpecColor.lerp(new THREE.Color(spec.specularHex), rawDt * 5);
    this.causticGlowMat.color.copy(this.currentShallowColor);

    const targetBg = new THREE.Color(
      this.storm ? SCENE_PALETTE.stormBackground : SCENE_PALETTE.dayBackground
    );
    (this.scene.background as THREE.Color).lerp(targetBg, rawDt * 4);
    (this.scene.fog as THREE.FogExp2).color.copy(this.scene.background as THREE.Color);
    this.floorMat.color.lerp(
      new THREE.Color(this.storm ? SCENE_PALETTE.stormFloor : SCENE_PALETTE.dayFloor),
      rawDt * 4
    );
    this.sunLight.intensity = THREE.MathUtils.lerp(
      this.sunLight.intensity,
      this.storm ? 0.65 : 1.85,
      rawDt * 4
    );
    this.causticGlowMat.opacity = THREE.MathUtils.lerp(
      this.causticGlowMat.opacity,
      this.storm ? 0.08 : 0.24,
      rawDt * 4
    );

    // 2. Elastic Jelly Wobble Spring-Damper Physics
    const springK = 18 + (this.firmness / 100) * 48;
    const springDamp = 2.2 + (this.waveDamping / 100) * 4.5;
    const ax = -springK * (this.wobbleX - this.targetTiltX) - springDamp * this.wobbleVelX;
    const az = -springK * (this.wobbleZ - this.targetTiltZ) - springDamp * this.wobbleVelZ;
    this.wobbleVelX += ax * rawDt;
    this.wobbleVelZ += az * rawDt;
    this.wobbleX += this.wobbleVelX * rawDt;
    this.wobbleZ += this.wobbleVelZ * rawDt;

    this.dioramaGroup.rotation.z = -this.wobbleX * 0.065;
    this.dioramaGroup.rotation.x = this.wobbleZ * 0.065;

    // 3. Update Jelly Uniforms
    this.jellySurfaceMat.uniforms.uTime.value = this.simTime;
    this.jellySurfaceMat.uniforms.uStorm.value = THREE.MathUtils.lerp(
      this.jellySurfaceMat.uniforms.uStorm.value,
      this.storm ? 1.0 : 0.0,
      rawDt * 4
    );
    this.jellySurfaceMat.uniforms.uWobble.value.set(this.wobbleX, this.wobbleZ);

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = this.ripples[i];
      if (r) {
        this.rippleUniformArray[i].set(r.x, r.z, r.time, r.strength);
      } else {
        this.rippleUniformArray[i].set(0, 0, -100, 0);
      }
    }

    // 4. Float Maritime Vessels on the Live Jelly Wave Surface
    const floatVessel = (group: THREE.Group, pos2D: THREE.Vector2, baseYaw: number) => {
      const surf = evaluateJellySurface(
        pos2D.x,
        pos2D.y,
        this.simTime,
        this.windSpeed,
        this.storm,
        this.waveDamping,
        this.ripples,
        this.wobbleX,
        this.wobbleZ
      );
      group.position.set(pos2D.x, surf.y, pos2D.y);
      group.rotation.set(surf.nz * 0.55, baseYaw, -surf.nx * 0.55);
    };

    floatVessel(this.vehicles.droneShipGroup, this.droneShipPos, 0);
    floatVessel(this.vehicles.tugBoatGroup, this.tugBoatPos, 0.25);
    floatVessel(this.vehicles.fairingBoatGroup, this.fairingBoatPos, -0.35);

    // 5. Update Island Animated Details (Radar, Windsock, Palms, Kelp, Swimmers, Seagulls)
    if (!this.paused) {
      this.islandHandles.radarDish.rotation.y = this.simTime * 0.85;
      const windNorm = this.windSpeed / 25;
      this.islandHandles.windSockPivot.rotation.y = Math.sin(this.simTime * 2.2) * 0.18;
      this.islandHandles.windSockCone.rotation.z = -0.55 + windNorm * 0.52;

      this.islandHandles.palmCrowns.forEach((crown, idx) => {
        crown.rotation.z =
          windNorm * 0.28 + Math.sin(this.simTime * (2.2 + windNorm * 3) + idx) * (0.04 + windNorm * 0.09);
      });

      this.islandHandles.kelpStrands.forEach((kelp, idx) => {
        kelp.rotation.z = Math.sin(this.simTime * 1.6 + idx * 0.7) * 0.14;
        kelp.rotation.x = Math.cos(this.simTime * 1.3 + idx) * 0.09;
      });

      this.islandHandles.swimmers.forEach((sw) => {
        const a = this.simTime * sw.speed + sw.phase;
        const nx = sw.centerX + Math.cos(a) * sw.radiusX;
        const nz = sw.centerZ + Math.sin(a) * sw.radiusZ;
        const dx = -Math.sin(a) * sw.radiusX;
        const dz = Math.cos(a) * sw.radiusZ;
        sw.mesh.position.set(nx, sw.y + Math.sin(a * 2) * 0.06, nz);
        sw.mesh.rotation.y = Math.atan2(dx, dz);
      });

      this.islandHandles.seagulls.forEach((g) => {
        const a = this.simTime * g.speed + g.phase;
        const gx = g.cx + Math.cos(a) * g.rx;
        const gz = g.cz + Math.sin(a * 2) * g.rz * 0.5;
        const dx = -Math.sin(a) * g.rx;
        const dz = Math.cos(a * 2) * g.rz;
        g.group.position.set(gx, g.y + Math.sin(a * 1.5) * 0.18, gz);
        g.group.rotation.y = Math.atan2(dx, dz);
        const flap = Math.sin(this.simTime * 7.5 + g.phase) * 0.42;
        g.wingL.rotation.z = flap;
        g.wingR.rotation.z = -flap;
      });

      // 6. Step Flight & Recovery State Machine + Particle System
      this.updateFlightSequence(dt);
      this.effects.update(dt, this.windSpeed, this.storm);
    }

    // 7. Update Camera & Render
    this.updateCameraFraming(rawDt);
    this.renderer.render(this.scene, this.camera);

    // Emit live telemetry to React UI at ~15 Hz
    if (now - this.lastUiEmit > 66) {
      this.emitTelemetry(false);
      this.lastUiEmit = now;
    }
  };

  // ============================================================================
  // POINTER & KEYBOARD INTERACTION ("DRAG WATER TO STIR · DRAG SIDE TO TIP · TAP SHIP OR PAD")
  // ============================================================================

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    const updateNDC = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      updateNDC(e.clientX, e.clientY);
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.pointerDownX = e.clientX;
      this.pointerDownY = e.clientY;

      if (e.button === 2 || e.shiftKey) {
        this.dragMode = 'orbit';
        return;
      }

      this.raycaster.setFromCamera(this.pointerNDC, this.camera);
      const hits = this.raycaster.intersectObjects(this.dioramaGroup.children, true);

      if (hits.length > 0) {
        // Check if user clicked on the jelly water surface or block side wall
        const firstWaterHit = hits.find((h) => h.object.name === 'jelly_water_surface');
        const firstWallHit = hits.find((h) => h.object.name === 'block_side_wall');

        if (firstWaterHit && firstWaterHit.point) {
          const localPt = this.dioramaGroup.worldToLocal(firstWaterHit.point.clone());
          if (evaluateSeabedHeight(localPt.x, localPt.z) < WATER_LEVEL) {
            this.dragMode = 'water';
            this.exciteJellyImpulse(localPt.x, localPt.z, 0.72);
            soundEngine.playWobble(0.35, this.firmness);
            return;
          }
        }

        if (firstWallHit) {
          this.dragMode = 'block';
          soundEngine.playWobble(0.5, this.firmness);
          return;
        }
      }

      this.dragMode = 'orbit';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.dragMode === 'none') return;

      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      if (this.dragMode === 'orbit') {
        this.camTargetSpherical.theta -= dx * 0.0065;
        this.camTargetSpherical.phi = THREE.MathUtils.clamp(
          this.camTargetSpherical.phi - dy * 0.0055,
          0.32,
          1.44
        );
      } else if (this.dragMode === 'block') {
        // Tip the block elastically
        this.targetTiltX = THREE.MathUtils.clamp(this.targetTiltX + dx * 0.018, -1.8, 1.8);
        this.targetTiltZ = THREE.MathUtils.clamp(this.targetTiltZ + dy * 0.018, -1.8, 1.8);
      } else if (this.dragMode === 'water') {
        updateNDC(e.clientX, e.clientY);
        this.raycaster.setFromCamera(this.pointerNDC, this.camera);
        const hits = this.raycaster.intersectObject(this.jellySurfaceMesh, false);
        if (hits.length > 0 && this.simTime - this.lastRippleSpawnTime > 0.045) {
          const localPt = this.dioramaGroup.worldToLocal(hits[0].point.clone());
          this.exciteJellyImpulse(localPt.x, localPt.z, 0.58);
          this.lastRippleSpawnTime = this.simTime;
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const moveDist = Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY);

      // Check for direct click/tap on the Drone Ship or the Landing Pad
      if (moveDist < 6) {
        updateNDC(e.clientX, e.clientY);
        this.raycaster.setFromCamera(this.pointerNDC, this.camera);
        const hits = this.raycaster.intersectObjects(
          [this.vehicles.droneShipTargetMesh, this.islandHandles.landingPadTargetMesh],
          true
        );
        if (hits.length > 0) {
          const hitName = hits[0].object.name;
          if (hitName === 'drone_ship_target') {
            this.setLandingTarget('drone_ship');
            soundEngine.playWobble(0.4, this.firmness);
          } else if (hitName === 'landing_pad_target') {
            this.setLandingTarget('landing_pad');
            soundEngine.playWobble(0.4, this.firmness);
          }
        }
      }

      if (this.dragMode === 'block') {
        // Release the tipped block so it springs back with jelly wobble!
        this.targetTiltX = 0;
        this.targetTiltZ = 0;
        soundEngine.playWobble(0.75, this.firmness);
      }

      this.dragMode = 'none';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.camTargetSpherical.radius = THREE.MathUtils.clamp(
        this.camTargetSpherical.radius + e.deltaY * 0.018,
        11.0,
        46.0
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        this.triggerPrimaryAction();
      }
    };

    const onResize = () => {
      if (!this.container) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
  }

  private emitTelemetry(force: boolean): void {
    const phaseLabels: Record<RocketPhase, string> = {
      in_hangar: 'In hangar · roll out B1',
      rolling_out: 'Transporter rolling to pad',
      erecting: 'Strongback raising vertical',
      on_pad: 'On the pad · ready for count',
      countdown: `T-${Math.ceil(this.countdownRemaining)}s · Counting down`,
      hold: 'Hold · range paused',
      ignition: 'Main engine ignition',
      liftoff: 'Liftoff · clearing tower',
      max_q: 'Max Q · supersonic ascent',
      meco_sep: 'MECO & stage separation',
      boostback_burn: 'Boostback burn',
      entry_burn: 'Entry burn · decelerating',
      grid_fin_glide: 'Grid fins steering',
      landing_burn: 'Landing burn & legs deploy',
      landed:
        this.landingTarget === 'drone_ship'
          ? 'Landed on drone ship'
          : 'Landed at Landing Zone 1',
      tug_recovery: 'Tug towing drone ship to port',
      crane_offload: 'Port crane lifting booster',
      refurbishing: 'Refurbishing booster for reuse',
    };

    let clockDisplay = 'T-00:10';
    if (this.phase === 'countdown' || this.phase === 'hold') {
      const s = String(Math.ceil(this.countdownRemaining)).padStart(2, '0');
      clockDisplay = `T-00:${s}`;
    } else if (
      this.phase !== 'in_hangar' &&
      this.phase !== 'rolling_out' &&
      this.phase !== 'erecting' &&
      this.phase !== 'on_pad'
    ) {
      const flightSec = Math.min(99, Math.floor(this.phaseElapsed + 12));
      clockDisplay = `T+00:${String(flightSec).padStart(2, '0')}`;
    }

    this.onTelemetryCallback({
      phase: this.phase,
      phaseLabel: phaseLabels[this.phase],
      missionTime: this.simTime,
      clockDisplay,
      altitudeKm: this.altitudeKm,
      velocityMs: this.velocityMs,
      downrangeKm: this.downrangeKm,
      throttlePct: this.throttlePct,
      stage2Status: this.stage2Status,
      droneShipStatus: this.droneShipStatus,
      fairingBoatStatus: this.fairingBoatStatus,
      boosterSerial: this.boosterSerial,
      flightNumber: this.flightNumber,
      sootLevel: this.sootLevel,
      launches: this.launches,
      landings: this.landings,
      fairingsCaught: this.fairingsCaught,
      reflows: this.reflows,
      landingTarget: this.landingTarget,
      flavour: this.flavour,
      firmness: this.firmness,
      waveDamping: this.waveDamping,
      windSpeed: this.windSpeed,
      storm: this.storm,
      paused: this.paused,
      soundEnabled: this.soundEnabled,
      cameraPreset: this.cameraPreset,
      weatherNoGoReason: this.getWeatherNoGoReason(),
    });
  }

  public dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.renderer.dispose();
  }
}
