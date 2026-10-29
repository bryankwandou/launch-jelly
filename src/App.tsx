import React, { useEffect, useRef, useState } from 'react';
import { JELLY_FLAVOURS, JellyFlavourKey } from './config/designTokens';
import { SpaceportSimulation } from './scene/SpaceportSimulation';
import { TelemetrySnapshot } from './types/simulation';

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  phase: 'on_pad',
  phaseLabel: 'On the pad',
  missionTime: 0,
  clockDisplay: 'T-10',
  altitudeKm: 0,
  velocityMs: 0,
  downrangeKm: 0,
  throttlePct: 0,
  stage2Status: 'Count',
  droneShipStatus: 'On station',
  fairingBoatStatus: 'In harbour',
  boosterSerial: 'B1081',
  flightNumber: 1,
  sootLevel: 0,
  launches: 0,
  landings: 0,
  fairingsCaught: 0,
  reflows: 0,
  landingTarget: 'drone_ship',
  flavour: 'lime',
  firmness: 50,
  waveDamping: 30,
  windSpeed: 6,
  storm: false,
  paused: false,
  soundEnabled: true,
  cameraPreset: 'overview',
  weatherNoGoReason: null,
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

  // Progress bar percentage for THE RANGE status bar
  let rangeProgress = 35;
  if (isInHangar) rangeProgress = 10;
  else if (isRollingOrErecting) rangeProgress = 25;
  else if (isOnPad) rangeProgress = 42;
  else if (isCountdown || isHold) rangeProgress = 65;
  else if (isInFlight) rangeProgress = 100;

  return (
    <div
      data-theme={snap.storm ? 'storm' : 'day'}
      className="relative w-screen h-screen overflow-hidden select-none bg-[#e6e8ea] text-[#1c2026]"
    >
      {/* Fullscreen Interactive 3D WebGL Diorama Canvas */}
      <div
        ref={viewportRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* TOP-LEFT EDITORIAL MASTHEAD */}
      <header className="pointer-events-none absolute top-5 left-6 z-10 max-w-[230px]">
        <div className="text-[9.5px] font-semibold tracking-[0.18em] uppercase text-[#5c6470]">
          MATERIAL STUDIES
        </div>

        <h1
          className="font-editorial italic mt-1 text-[#171a20] leading-[0.88] tracking-[-0.02em]"
          style={{ fontSize: 'clamp(2.5rem, 4.4vw, 4.1rem)' }}
        >
          Launch
          <br />
          Jelly.
        </h1>

        <p className="mt-2.5 text-[11.5px] leading-[1.45] text-[#4a515c] max-w-[195px]">
          A spaceport on a low island, its rockets flying and coming home, set in a block of jelly.
        </p>

        {snap.weatherNoGoReason && (
          <div className="mt-2 inline-block rounded px-2 py-0.5 text-[9.5px] font-semibold tracking-wider uppercase bg-red-500/15 text-red-600 border border-red-500/30">
            {snap.weatherNoGoReason}
          </div>
        )}
      </header>

      {/* BOTTOM-LEFT "HOW TO PLAY" EDITORIAL CAPTION */}
      <footer className="pointer-events-none absolute bottom-4 left-6 z-10 max-w-[355px] hidden sm:block">
        <div className="text-[8.5px] font-semibold tracking-[0.16em] uppercase text-[#68707c]">
          HOW TO PLAY
        </div>
        <div className="font-editorial italic text-[16.5px] leading-snug text-[#1c2026] mt-0.5">
          Roll it out. Light it up. Bring the booster home.
        </div>
        <p className="mt-1 text-[9.5px] leading-[1.48] text-[#5c6470]">
          The erector carries the rocket out of the hangar and stands it on the pad · launch for a
          ten-second count, ignition and liftoff (press again during the count to hold) · the
          booster separates, turns back and lands on the drone ship at sea or at the landing zone
          (choose which, or tap the ship or the pad) · the fairing halves come down under parafoils
          for the boat&apos;s net · the tug tows the drone ship in and the crane lifts the booster
          off · a recovered booster flies again · no launches in a storm or above 15 m/s of wind ·
          Space rolls out and launches · drag across the water to make waves · drag the side of the
          block to tip it · drag empty space or right-drag to orbit · scroll or pinch to zoom
        </p>
      </footer>

      {/* RIGHT-SIDE COMPACT RANGE & MATERIAL CONTROL PANEL (MATCHING REFERENCE) */}
      <div className="pointer-events-auto absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
        {/* Live Renderer Status Pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-semibold tracking-[0.12em] uppercase text-[#2d333d] shadow-xs border border-black/8 backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>WEBGPU · LIVE</span>
        </div>

        {/* Main Control Card (218px wide, zero scrollbar, crisp technical layout) */}
        <aside className="w-[218px] rounded-lg bg-[#f4f5f6]/95 border border-black/10 shadow-[0_8px_28px_rgba(0,0,0,0.08)] backdrop-blur-md p-3 text-[#1e232b]">
          {/* THE RANGE */}
          <div className="text-[9px] font-semibold tracking-[0.14em] uppercase text-[#68707c] mb-2">
            THE RANGE
          </div>

          {/* 2x2 Primary Control Grid */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (isInHangar) simRef.current?.triggerRollOut();
                else if (isOnPad) simRef.current?.triggerLaunchOrHold();
              }}
              className={`h-7 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                isInHangar
                  ? 'bg-[#1b2430] text-white hover:bg-[#283546]'
                  : 'bg-[#86909c] text-white'
              }`}
            >
              {isInHangar
                ? 'Roll out'
                : isRollingOrErecting
                ? 'Rolling...'
                : isOnPad || isCountdown || isHold
                ? 'On the pad'
                : 'In flight...'}
            </button>

            <button
              type="button"
              onClick={() => simRef.current?.triggerLaunchOrHold()}
              className={`h-7 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                isCountdown
                  ? 'bg-[#1b2430] text-white hover:bg-[#283546]'
                  : isHold
                  ? 'bg-amber-600 text-white hover:bg-amber-500'
                  : isOnPad
                  ? 'bg-[#1b2430] text-white hover:bg-[#283546]'
                  : 'bg-[#86909c] text-white'
              }`}
            >
              {isCountdown
                ? 'Hold'
                : isHold
                ? 'Resume'
                : isInFlight
                ? 'Launched'
                : 'Launch'}
            </button>

            <button
              type="button"
              onClick={() =>
                simRef.current?.setLandingTarget(
                  snap.landingTarget === 'drone_ship' ? 'landing_pad' : 'drone_ship'
                )
              }
              className="h-7 rounded bg-[#1b2430] hover:bg-[#283546] text-white text-[10.5px] font-semibold transition-colors cursor-pointer"
            >
              {snap.landingTarget === 'drone_ship' ? 'Land on ship' : 'Land on pad'}
            </button>

            <button
              type="button"
              onClick={() => simRef.current?.setStorm(!snap.storm)}
              className={`h-7 rounded text-[10.5px] font-semibold transition-colors cursor-pointer ${
                snap.storm
                  ? 'bg-amber-600 text-white'
                  : 'bg-[#1b2430] hover:bg-[#283546] text-white'
              }`}
            >
              Storm
            </button>
          </div>

          {/* Emerald Range Progress Line */}
          <div className="mt-2 h-[2px] w-full bg-black/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${rangeProgress}%` }}
            />
          </div>

          {/* Inline Counters */}
          <div className="mt-2 flex items-center justify-between text-[9.5px] text-[#5c6470]">
            <span>
              Launches <strong className="text-[#1c2026] font-mono-tech">{snap.launches}</strong>
            </span>
            <span>
              Landings <strong className="text-[#1c2026] font-mono-tech">{snap.landings}</strong>
            </span>
            <span>
              Fairings{' '}
              <strong className="text-[#1c2026] font-mono-tech">{snap.fairingsCaught}</strong>
            </span>
          </div>

          {/* Dotted Telemetry Status Rows */}
          <div className="mt-2 pt-2 border-t border-black/8 space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[#68707c]">Rocket </span>
                <span className="font-medium text-[#1c2026]">{snap.stage2Status}</span>
              </div>
              <span className="font-mono-tech font-semibold text-[#1c2026]">
                {snap.clockDisplay}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-dotted border-black/12 pt-1">
              <div>
                <span className="text-[#68707c]">Drone ship </span>
                <span className="font-medium text-[#1c2026]">{snap.droneShipStatus}</span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-dotted border-black/12 pt-1">
              <div>
                <span className="text-[#68707c]">Fairing boat </span>
                <span className="font-medium text-[#1c2026]">{snap.fairingBoatStatus}</span>
              </div>
            </div>
          </div>

          {/* FLAVOUR */}
          <div className="mt-2.5 pt-2.5 border-t border-black/8">
            <div className="text-[9px] font-semibold tracking-[0.14em] uppercase text-[#68707c] mb-1.5">
              FLAVOUR
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
                    className={`flex flex-col items-center justify-center py-1.5 px-1 rounded border transition-all cursor-pointer ${
                      selected
                        ? 'bg-white border-[#1b2430] shadow-2xs'
                        : 'bg-white/50 border-black/10 hover:bg-white/80'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full mb-1 shadow-inner border border-black/10"
                      style={{ background: item.swatchGradient }}
                    />
                    <span className="text-[9.5px] font-medium text-[#1c2026] leading-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SLIDERS: Firmness, Wave damping, Wind */}
          <div className="mt-2.5 pt-2.5 border-t border-black/8 space-y-2">
            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-[#1c2026] font-medium">Firmness</span>
                <span className="font-mono-tech text-[#68707c]">{snap.firmness}</span>
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
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-[#1c2026] font-medium">Wave damping</span>
                <span className="font-mono-tech text-[#68707c]">{snap.waveDamping}</span>
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
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-[#1c2026] font-medium">Wind</span>
                <span
                  className={`font-mono-tech ${
                    snap.windSpeed > 15 ? 'text-red-600 font-semibold' : 'text-[#68707c]'
                  }`}
                >
                  {snap.windSpeed} m/s
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

          {/* Bottom 4 Utility Buttons: Reset | Pause | Sound on | View */}
          <div className="mt-2.5 pt-2.5 border-t border-black/8 grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => simRef.current?.resetSimulation()}
              className="h-7 rounded bg-white/80 hover:bg-white border border-black/12 text-[9.5px] font-medium text-[#1c2026] cursor-pointer transition-colors"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => simRef.current?.togglePause()}
              className="h-7 rounded bg-white/80 hover:bg-white border border-black/12 text-[9.5px] font-medium text-[#1c2026] cursor-pointer transition-colors"
            >
              {snap.paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={() => simRef.current?.toggleSound()}
              className="h-7 rounded bg-white/80 hover:bg-white border border-black/12 text-[9px] leading-none font-medium text-[#1c2026] cursor-pointer transition-colors"
            >
              {snap.soundEnabled ? (
                <>
                  Sound
                  <br />
                  on
                </>
              ) : (
                <>
                  Sound
                  <br />
                  off
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => simRef.current?.cycleCameraPreset()}
              className="h-7 rounded bg-white/80 hover:bg-white border border-black/12 text-[9.5px] font-medium text-[#1c2026] cursor-pointer transition-colors"
            >
              View
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
export default App;
