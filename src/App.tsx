import React, { useEffect, useRef, useState } from 'react';
import {
  Anchor,
  CheckCircle2,
  CloudLightning,
  Compass,
  Eye,
  Navigation,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  ShieldAlert,
  Ship,
  Volume2,
  VolumeX,
  Waves,
  Wind,
} from 'lucide-react';
import { JELLY_FLAVOURS, JellyFlavourKey } from './config/designTokens';
import { SpaceportSimulation } from './scene/SpaceportSimulation';
import { CameraPreset, TelemetrySnapshot } from './types/simulation';

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  phase: 'on_pad',
  phaseLabel: 'On the pad · ready for count',
  missionTime: 0,
  clockDisplay: 'T-00:10',
  altitudeKm: 0,
  velocityMs: 0,
  downrangeKm: 0,
  throttlePct: 0,
  stage2Status: 'LOX / RP-1 propellant load complete',
  droneShipStatus: 'On station · ready to catch B1',
  fairingBoatStatus: 'In harbour · ready to depart',
  boosterSerial: 'B1081',
  flightNumber: 1,
  sootLevel: 0,
  launches: 0,
  landings: 0,
  fairingsCaught: 0,
  reflows: 0,
  landingTarget: 'drone_ship',
  flavour: 'lime',
  firmness: 65,
  waveDamping: 38,
  windSpeed: 6,
  storm: false,
  paused: false,
  soundEnabled: true,
  cameraPreset: 'overview',
  weatherNoGoReason: null,
};

const CAMERA_LABELS: Record<CameraPreset, string> = {
  overview: 'Diorama Overview',
  pad: 'Launch Complex 1',
  booster: 'Booster Tracking',
  ship: 'Drone Ship Deck',
  reef: 'Subsurface Reef',
};

export function App() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<SpaceportSimulation | null>(null);
  const [snap, setSnap] = useState<TelemetrySnapshot>(INITIAL_TELEMETRY);

  useEffect(() => {
    if (!viewportRef.current) return;
    const sim = new SpaceportSimulation(viewportRef.current, (nextSnap) => {
      setSnap({ ...nextSnap });
    });
    simRef.current = sim;
    return () => {
      sim.dispose();
      simRef.current = null;
    };
  }, []);

  const isInHangar = snap.phase === 'in_hangar';
  const isRollingOrErecting = snap.phase === 'rolling_out' || snap.phase === 'erecting';
  const isOnPad = snap.phase === 'on_pad';
  const isCountdown = snap.phase === 'countdown';
  const isHold = snap.phase === 'hold';
  const isInFlight =
    !isInHangar && !isRollingOrErecting && !isOnPad && !isCountdown && !isHold;

  return (
    <div
      data-theme={snap.storm ? 'storm' : 'day'}
      className="relative w-screen h-screen overflow-hidden select-none"
    >
      {/* Fullscreen Interactive 3D WebGL Diorama Canvas */}
      <div
        ref={viewportRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* TOP-LEFT EDITORIAL MASTHEAD & LIVE TELEMETRY */}
      <header className="pointer-events-none absolute top-6 left-7 z-10 max-w-xs sm:max-w-sm">
        <div className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.2em] uppercase text-[var(--color-on-surface-muted)]">
          <span>MATERIAL STUDIES</span>
          <span className="opacity-40">/</span>
          <span className="font-mono-tech">NO. 08</span>
        </div>

        <h1 className="font-editorial mt-1.5 text-[64px] sm:text-[76px] leading-[0.88] tracking-[-0.02em] text-[var(--color-on-surface)]">
          Launch
          <br />
          <span className="italic">Jelly.</span>
        </h1>

        <p className="mt-3.5 text-[13.5px] leading-[1.52] text-[var(--color-on-surface-muted)] max-w-[250px]">
          A spaceport on a low island, its rockets flying and coming home, set in a block of jelly.
        </p>

        {/* Weather & Range Status Pill */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {snap.weatherNoGoReason ? (
            <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wider uppercase bg-red-500/15 text-red-500 border border-red-500/30 backdrop-blur-md">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{snap.weatherNoGoReason}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wider uppercase bg-emerald-500/12 text-[var(--color-success)] border border-emerald-500/25 backdrop-blur-md">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>FAIR WEATHER · RANGE GO</span>
            </div>
          )}

          {snap.flightNumber > 1 && (
            <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-mono-tech font-medium bg-[var(--color-surface)] text-[var(--color-on-surface)] border border-[var(--color-outline)] backdrop-blur-md">
              <span>FLIGHT-PROVEN · {snap.flightNumber}X</span>
            </div>
          )}
        </div>

        {/* Live Ascent/Descent Flight Telemetry Strip */}
        {(isInFlight || isCountdown) && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl p-2.5 bg-[var(--color-surface)] border border-[var(--color-outline)] backdrop-blur-md shadow-sm max-w-[290px]">
            <div>
              <div className="text-[9.5px] uppercase tracking-wider text-[var(--color-on-surface-muted)]">
                ALTITUDE
              </div>
              <div className="font-mono-tech text-[14px] font-semibold text-[var(--color-on-surface)]">
                {snap.altitudeKm.toFixed(1)} <span className="text-[10px] font-normal">km</span>
              </div>
            </div>
            <div>
              <div className="text-[9.5px] uppercase tracking-wider text-[var(--color-on-surface-muted)]">
                VELOCITY
              </div>
              <div className="font-mono-tech text-[14px] font-semibold text-[var(--color-on-surface)]">
                {snap.velocityMs} <span className="text-[10px] font-normal">m/s</span>
              </div>
            </div>
            <div>
              <div className="text-[9.5px] uppercase tracking-wider text-[var(--color-on-surface-muted)]">
                THROTTLE
              </div>
              <div className="font-mono-tech text-[14px] font-semibold text-[var(--color-on-surface)]">
                {snap.throttlePct}%
              </div>
            </div>
          </div>
        )}
      </header>

      {/* BOTTOM-LEFT "HOW TO PLAY" & CAMERA VIEW BAR */}
      <footer className="pointer-events-none absolute bottom-5 left-7 z-10 max-w-md lg:max-w-lg hidden sm:block">
        <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--color-on-surface-muted)]">
          HOW TO PLAY
        </div>
        <div className="font-editorial italic text-[20px] leading-snug text-[var(--color-on-surface)] mt-0.5">
          Roll it out. Light it up. Bring the booster home.
        </div>
        <p className="mt-1.5 text-[11px] leading-[1.58] text-[var(--color-on-surface-muted)] opacity-90">
          The erector carries the rocket out of the hangar and stands it on the pad · launch for a
          ten-second count, ignition and liftoff (press again during the count to hold) · the
          booster separates, turns back and lands on the drone ship at sea or at the landing zone
          (choose which, or tap the ship or the pad) · the fairing halves come down under parafoils
          for the boat&apos;s net · the tug tows the drone ship in and the crane lifts the booster
          off · a recovered booster flies again · no launches in a storm or above 15 m/s of wind ·
          Space rolls out and launches · drag across the water to make waves · drag the side of the
          block to tip it · drag empty space or right-drag to orbit · scroll or pinch to zoom
        </p>

        {/* Interactive Camera Preset Selector Pills */}
        <div className="pointer-events-auto mt-3 flex flex-wrap items-center gap-1.5">
          {(['overview', 'pad', 'booster', 'ship', 'reef'] as CameraPreset[]).map((preset) => {
            const active = snap.cameraPreset === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => simRef.current?.setCameraPreset(preset)}
                className={`px-2.5 py-1 rounded-md text-[10.5px] font-medium transition-all cursor-pointer border ${
                  active
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)] shadow-xs'
                    : 'bg-[var(--color-surface)] text-[var(--color-on-surface-muted)] border-[var(--color-outline)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                {CAMERA_LABELS[preset]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => simRef.current?.exciteJellyImpulse(1.5, 2.5, 1.1)}
            className="px-2.5 py-1 rounded-md text-[10.5px] font-medium bg-[var(--color-surface)] text-[var(--color-on-surface)] border border-[var(--color-outline)] hover:border-[var(--color-outline-strong)] transition-all cursor-pointer inline-flex items-center gap-1"
            title="Trigger elastic impulse across the jelly block"
          >
            <Waves className="w-3 h-3" />
            <span>Jiggle Jelly</span>
          </button>
        </div>
      </footer>

      {/* RIGHT-SIDE FLIGHT OPERATIONS & MATERIAL CONTROL PANEL */}
      <aside className="pointer-events-auto absolute top-5 right-5 bottom-5 z-20 w-[308px] sm:w-[324px] flex flex-col justify-between rounded-2xl bg-[var(--color-surface)] border border-[var(--color-outline)] backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] p-4 overflow-y-auto">
        {/* SECTION 01: FLIGHT OPERATIONS */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between border-b border-[var(--color-outline)] pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-[var(--color-on-surface-muted)]">
                01 / FLIGHT OPERATIONS
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono-tech font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE SIM
            </span>
          </div>

          {/* Booster ID & Mission Countdown Clock */}
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[11px] font-mono-tech font-medium text-[var(--color-on-surface-muted)]">
                {snap.boosterSerial} · flight {snap.flightNumber}
              </div>
              <div className="text-[12px] font-semibold text-[var(--color-on-surface)] mt-0.5">
                {snap.phaseLabel}
              </div>
            </div>
            <div className="font-mono-tech text-[24px] font-semibold tracking-tight text-[var(--color-on-surface)]">
              {snap.clockDisplay}
            </div>
          </div>

          {/* Primary Action Buttons: Roll out & Launch / Hold */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!isInHangar}
              onClick={() => simRef.current?.triggerRollOut()}
              className={`h-10 rounded-lg px-3 text-[12px] font-semibold flex items-center justify-between transition-all border ${
                isInHangar
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)] cursor-pointer hover:opacity-95 shadow-xs'
                  : 'bg-[var(--color-surface-elevated)] text-[var(--color-on-surface-muted)] border-[var(--color-outline)] opacity-60 cursor-not-allowed'
              }`}
            >
              <span>
                {isInHangar
                  ? 'Roll out'
                  : isRollingOrErecting
                  ? 'Rolling...'
                  : 'On pad'}
              </span>
              <Navigation className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              disabled={!isOnPad && !isCountdown && !isHold}
              onClick={() => simRef.current?.triggerLaunchOrHold()}
              className={`h-10 rounded-lg px-3 text-[12px] font-semibold flex items-center justify-between transition-all border ${
                isCountdown
                  ? 'bg-amber-600 text-white border-amber-600 cursor-pointer hover:bg-amber-500'
                  : isHold
                  ? 'bg-emerald-600 text-white border-emerald-600 cursor-pointer hover:bg-emerald-500'
                  : isOnPad && !snap.weatherNoGoReason
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)] cursor-pointer hover:opacity-95 shadow-xs'
                  : 'bg-[var(--color-surface-elevated)] text-[var(--color-on-surface-muted)] border-[var(--color-outline)] opacity-60 cursor-not-allowed'
              }`}
            >
              <span>
                {isCountdown
                  ? 'Hold'
                  : isHold
                  ? 'Resume'
                  : isInFlight
                  ? 'In flight...'
                  : 'Launch'}
              </span>
              <Rocket className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Landing Target Selector: Drone Ship vs Landing Pad */}
          <div>
            <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--color-on-surface-muted)] mb-1.5">
              BRING IT HOME TO
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[var(--color-background)] border border-[var(--color-outline)]">
              <button
                type="button"
                onClick={() => simRef.current?.setLandingTarget('drone_ship')}
                className={`py-1.5 px-2.5 rounded-md text-[11.5px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  snap.landingTarget === 'drone_ship'
                    ? 'bg-[var(--color-surface-elevated)] text-[var(--color-on-surface)] shadow-xs border border-[var(--color-outline)]'
                    : 'text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                <Ship className="w-3.5 h-3.5" />
                <span>Drone ship</span>
              </button>
              <button
                type="button"
                onClick={() => simRef.current?.setLandingTarget('landing_pad')}
                className={`py-1.5 px-2.5 rounded-md text-[11.5px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  snap.landingTarget === 'landing_pad'
                    ? 'bg-[var(--color-surface-elevated)] text-[var(--color-on-surface)] shadow-xs border border-[var(--color-outline)]'
                    : 'text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Landing pad</span>
              </button>
            </div>
          </div>

          {/* Subsystem Live Status Rows */}
          <div className="space-y-2 pt-1 border-t border-[var(--color-outline)]">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 p-1.5 rounded-md bg-[var(--color-background)] border border-[var(--color-outline)]">
                <Rocket className="w-3.5 h-3.5 text-[var(--color-on-surface)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[var(--color-on-surface)]">Rocket</div>
                <div className="text-[11px] text-[var(--color-on-surface-muted)] truncate">
                  {snap.stage2Status}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 p-1.5 rounded-md bg-[var(--color-background)] border border-[var(--color-outline)]">
                <Ship className="w-3.5 h-3.5 text-[var(--color-on-surface)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[var(--color-on-surface)]">
                  Drone ship
                </div>
                <div className="text-[11px] text-[var(--color-on-surface-muted)] truncate">
                  {snap.droneShipStatus}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 p-1.5 rounded-md bg-[var(--color-background)] border border-[var(--color-outline)]">
                <Anchor className="w-3.5 h-3.5 text-[var(--color-on-surface)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[var(--color-on-surface)]">
                  Fairing boat
                </div>
                <div className="text-[11px] text-[var(--color-on-surface-muted)] truncate">
                  {snap.fairingBoatStatus}
                </div>
              </div>
            </div>
          </div>

          {/* Mission Counters: Launches / Landings / Fairings */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--color-outline)] text-center">
            <div className="rounded-lg py-1.5 bg-[var(--color-background)] border border-[var(--color-outline)]">
              <div className="font-mono-tech text-[17px] font-semibold text-[var(--color-on-surface)]">
                {snap.launches}
              </div>
              <div className="text-[9px] font-semibold tracking-wider uppercase text-[var(--color-on-surface-muted)]">
                LAUNCHES
              </div>
            </div>
            <div className="rounded-lg py-1.5 bg-[var(--color-background)] border border-[var(--color-outline)]">
              <div className="font-mono-tech text-[17px] font-semibold text-[var(--color-on-surface)]">
                {snap.landings}
              </div>
              <div className="text-[9px] font-semibold tracking-wider uppercase text-[var(--color-on-surface-muted)]">
                LANDINGS
              </div>
            </div>
            <div className="rounded-lg py-1.5 bg-[var(--color-background)] border border-[var(--color-outline)]">
              <div className="font-mono-tech text-[17px] font-semibold text-[var(--color-on-surface)]">
                {snap.fairingsCaught}
              </div>
              <div className="text-[9px] font-semibold tracking-wider uppercase text-[var(--color-on-surface-muted)]">
                FAIRINGS
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 02: MATERIAL & WEATHER */}
        <div className="space-y-3 pt-3 border-t border-[var(--color-outline)] mt-3">
          <div className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-[var(--color-on-surface-muted)]">
            02 / MATERIAL &amp; WEATHER
          </div>

          {/* Jelly Flavour Selector Cards */}
          <div>
            <div className="flex items-center justify-between text-[10.5px] font-medium text-[var(--color-on-surface-muted)] mb-1.5">
              <span>FLAVOUR</span>
              <span className="font-mono-tech text-[10px]">
                IOR {JELLY_FLAVOURS[snap.flavour].ior.toFixed(3)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(JELLY_FLAVOURS) as JellyFlavourKey[]).map((key) => {
                const item = JELLY_FLAVOURS[key];
                const selected = snap.flavour === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => simRef.current?.setFlavour(key)}
                    className={`flex flex-col items-center justify-center py-2 px-1.5 rounded-lg border transition-all cursor-pointer ${
                      selected
                        ? 'bg-[var(--color-surface-elevated)] border-[var(--color-primary)] shadow-xs'
                        : 'bg-[var(--color-background)] border-[var(--color-outline)] opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full shadow-inner mb-1 border border-white/40"
                      style={{ background: item.swatchGradient }}
                    />
                    <span className="text-[11px] font-semibold text-[var(--color-on-surface)]">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sliders: Firmness, Wave Damping, Wind */}
          <div className="space-y-2.5">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-medium text-[var(--color-on-surface)]">Firmness</span>
                <span className="font-mono-tech text-[var(--color-on-surface-muted)]">
                  {snap.firmness}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={snap.firmness}
                onChange={(e) => simRef.current?.setFirmness(Number(e.target.value))}
                className="jelly-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-medium text-[var(--color-on-surface)]">Wave damping</span>
                <span className="font-mono-tech text-[var(--color-on-surface-muted)]">
                  {snap.waveDamping}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={snap.waveDamping}
                onChange={(e) => simRef.current?.setWaveDamping(Number(e.target.value))}
                className="jelly-slider"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-medium text-[var(--color-on-surface)] flex items-center gap-1">
                  <Wind className="w-3 h-3" />
                  <span>Wind</span>
                </span>
                <span
                  className={`font-mono-tech ${
                    snap.windSpeed > 15
                      ? 'text-red-500 font-semibold'
                      : 'text-[var(--color-on-surface-muted)]'
                  }`}
                >
                  {snap.windSpeed} m/s {snap.windSpeed > 15 ? '(NO-GO)' : ''}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={25}
                value={snap.windSpeed}
                onChange={(e) => simRef.current?.setWindSpeed(Number(e.target.value))}
                className="jelly-slider"
              />
            </div>
          </div>

          {/* Storm Toggle */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11.5px] font-medium text-[var(--color-on-surface)] flex items-center gap-1.5">
              <CloudLightning className="w-3.5 h-3.5 text-amber-500" />
              <span>Storm squall</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={snap.storm}
              onClick={() => simRef.current?.setStorm(!snap.storm)}
              className={`w-10 h-5.5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                snap.storm ? 'bg-amber-500' : 'bg-slate-400/40'
              }`}
            >
              <span
                className={`bg-white w-4.5 h-4.5 rounded-full shadow-xs transform transition-transform ${
                  snap.storm ? 'translate-x-4.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Bottom Utility Controls Bar: Reset / Pause / Sound / View */}
          <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-[var(--color-outline)]">
            <button
              type="button"
              onClick={() => simRef.current?.resetSimulation()}
              className="py-1.5 px-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-outline)] hover:border-[var(--color-outline-strong)] text-[11px] font-medium text-[var(--color-on-surface)] flex items-center justify-center gap-1 cursor-pointer transition-all"
              title="Reset spaceport simulation"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={() => simRef.current?.togglePause()}
              className="py-1.5 px-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-outline)] hover:border-[var(--color-outline-strong)] text-[11px] font-medium text-[var(--color-on-surface)] flex items-center justify-center gap-1 cursor-pointer transition-all"
              title="Pause or resume simulation"
            >
              {snap.paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              <span>{snap.paused ? 'Play' : 'Pause'}</span>
            </button>

            <button
              type="button"
              onClick={() => simRef.current?.toggleSound()}
              className="py-1.5 px-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-outline)] hover:border-[var(--color-outline-strong)] text-[11px] font-medium text-[var(--color-on-surface)] flex items-center justify-center gap-1 cursor-pointer transition-all"
              title="Toggle procedural sound effects"
            >
              {snap.soundEnabled ? (
                <Volume2 className="w-3 h-3 text-emerald-500" />
              ) : (
                <VolumeX className="w-3 h-3 text-[var(--color-on-surface-muted)]" />
              )}
              <span>{snap.soundEnabled ? 'Sound' : 'Muted'}</span>
            </button>

            <button
              type="button"
              onClick={() => simRef.current?.cycleCameraPreset()}
              className="py-1.5 px-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-outline)] hover:border-[var(--color-outline-strong)] text-[11px] font-medium text-[var(--color-on-surface)] flex items-center justify-center gap-1 cursor-pointer transition-all"
              title="Cycle camera angle preset"
            >
              <Eye className="w-3 h-3" />
              <span>View</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
export default App;
