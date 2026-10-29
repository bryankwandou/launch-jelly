import { JellyFlavourKey } from '../config/designTokens';

export type RocketPhase =
  | 'in_hangar'
  | 'rolling_out'
  | 'erecting'
  | 'on_pad'
  | 'countdown'
  | 'hold'
  | 'ignition'
  | 'liftoff'
  | 'max_q'
  | 'meco_sep'
  | 'boostback_burn'
  | 'entry_burn'
  | 'grid_fin_glide'
  | 'landing_burn'
  | 'landed'
  | 'tug_recovery'
  | 'crane_offload'
  | 'refurbishing';

export type LandingTarget = 'drone_ship' | 'landing_pad';

export type CameraPreset = 'overview' | 'pad' | 'booster' | 'ship' | 'reef';

export interface TelemetrySnapshot {
  phase: RocketPhase;
  phaseLabel: string;
  missionTime: number;
  clockDisplay: string;
  altitudeKm: number;
  velocityMs: number;
  downrangeKm: number;
  throttlePct: number;
  stage2Status: string;
  droneShipStatus: string;
  fairingBoatStatus: string;
  boosterSerial: string;
  flightNumber: number;
  sootLevel: number;
  launches: number;
  landings: number;
  fairingsCaught: number;
  reflows: number;
  landingTarget: LandingTarget;
  flavour: JellyFlavourKey;
  firmness: number;
  waveDamping: number;
  windSpeed: number;
  storm: boolean;
  paused: boolean;
  soundEnabled: boolean;
  cameraPreset: CameraPreset;
  weatherNoGoReason: string | null;
}

export interface SimulationControls {
  triggerPrimaryAction: () => void;
  triggerRollOut: () => void;
  triggerLaunchOrHold: () => void;
  setLandingTarget: (target: LandingTarget) => void;
  setFlavour: (flavour: JellyFlavourKey) => void;
  setFirmness: (val: number) => void;
  setWaveDamping: (val: number) => void;
  setWindSpeed: (val: number) => void;
  setStorm: (storm: boolean) => void;
  togglePause: () => void;
  toggleSound: () => void;
  cycleCameraPreset: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  resetSimulation: () => void;
  exciteJellyImpulse: (nx: number, nz: number, strength: number) => void;
}
