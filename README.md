# Launch Jelly — Material Studies No. 08

Interactive 3D orbital launch and recovery spaceport simulation set inside a physically responsive, refractive block of fruit jelly over a stratified geological island cross-section.

## Features

- **Refractive Jelly Volume & Caustics**: Custom GLSL shaders implementing Beer-Lambert depth absorption, dual-layer animated Voronoi caustics on the seabed, meniscus bevel highlights, Gerstner surface waves, and interactive cursor ripple propagation across three optical spectra (`Lime`, `Curaçao`, `Blackcurrant`).
- **Soft-Body Block Physics**: Elastic spring-damper shear and tilt deformation controlled by live `Firmness` and `Wave damping` parameters. Drag across the water to stir waves, or drag the cut block walls to tip and wobble the entire diorama.
- **Complete Orbital Launch & Booster Reuse Loop**:
  - Horizontal integration in the hangar and rail rollout on the Transporter-Erector (`Roll out`).
  - erection at Launch Complex 1 with 4 lightning towers, catenary arrestor wires, cryogenic LOX/RP-1 farm, water deluge system, and live LED countdown scoreboard (`T-00:10`).
  - 10-second countdown with `Hold` interlock and range weather safety gates (`Storm` or `Wind > 15 m/s`).
  - Ignition, liftoff, Max Q, MECO, stage separation, second-stage vacuum ignition, and clamshell fairing deployment under striped ram-air parafoils.
  - Booster flip maneuver, boostback burn, entry burn, active titanium grid-fin guidance, landing burn, 4-leg deployment, and touchdown on either the Autonomous Spaceport Drone Ship at sea or Landing Zone 1 onshore.
  - Autonomous maritime recovery: the fairing boat catches descending fairing halves in its stern net, the harbour tugboat tows the drone ship into the pier berth, and the port hammerhead crane hoists the flight-proven booster ashore for refurbishment and reflow.
- **Procedural Web Audio Synthesizer**: Real-time synthesized rocket rumble, countdown telemetry tones, double sonic booms, ocean wind, and elastic jelly resonance.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```
