export class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private thrustGain: GainNode | null = null;
  private thrustFilter: BiquadFilterNode | null = null;
  private subOsc: OscillatorNode | null = null;
  private subGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.ensureContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } else if (this.ctx) {
      if (this.thrustGain) {
        this.thrustGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      }
      if (this.ambientGain) {
        this.ambientGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.setupContinuousLoops();
    }
    return this.ctx;
  }

  private setupContinuousLoops(): void {
    if (!this.ctx) return;

    // Create 3-second brown/pink noise buffer for rocket plume and ocean wind
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.04 * white) / 1.04;
      lastOut = data[i];
      data[i] *= 2.8;
    }

    // Rocket thrust loop
    const thrustSource = this.ctx.createBufferSource();
    thrustSource.buffer = noiseBuffer;
    thrustSource.loop = true;

    this.thrustFilter = this.ctx.createBiquadFilter();
    this.thrustFilter.type = 'lowpass';
    this.thrustFilter.frequency.value = 180;
    this.thrustFilter.Q.value = 1.4;

    this.thrustGain = this.ctx.createGain();
    this.thrustGain.gain.value = 0;

    thrustSource.connect(this.thrustFilter);
    this.thrustFilter.connect(this.thrustGain);
    this.thrustGain.connect(this.ctx.destination);
    thrustSource.start();

    // Sub-bass engine resonance
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'sawtooth';
    this.subOsc.frequency.value = 46;
    const subFilter = this.ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.value = 95;
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0;

    this.subOsc.connect(subFilter);
    subFilter.connect(this.subGain);
    this.subGain.connect(this.ctx.destination);
    this.subOsc.start();

    // Ambient ocean/wind loop
    const ambientSource = this.ctx.createBufferSource();
    ambientSource.buffer = noiseBuffer;
    ambientSource.loop = true;

    this.ambientFilter = this.ctx.createBiquadFilter();
    this.ambientFilter.type = 'bandpass';
    this.ambientFilter.frequency.value = 320;
    this.ambientFilter.Q.value = 0.7;

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0;

    ambientSource.connect(this.ambientFilter);
    this.ambientFilter.connect(this.ambientGain);
    this.ambientGain.connect(this.ctx.destination);
    ambientSource.start();
  }

  public updateContinuous(thrustIntensity: number, windSpeed: number, storm: boolean, paused: boolean): void {
    if (!this.enabled || !this.ctx || paused) {
      if (this.ctx && this.thrustGain && this.subGain && this.ambientGain) {
        this.thrustGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
        this.subGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
        this.ambientGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      }
      return;
    }

    const now = this.ctx.currentTime;
    const clampedThrust = Math.max(0, Math.min(1, thrustIntensity));
    if (this.thrustGain && this.thrustFilter && this.subGain && this.subOsc) {
      this.thrustGain.gain.setTargetAtTime(clampedThrust * 0.24, now, 0.06);
      this.thrustFilter.frequency.setTargetAtTime(140 + clampedThrust * 520, now, 0.08);
      this.subGain.gain.setTargetAtTime(clampedThrust * 0.14, now, 0.06);
      this.subOsc.frequency.setTargetAtTime(38 + clampedThrust * 18, now, 0.08);
    }

    if (this.ambientGain && this.ambientFilter) {
      const windNorm = Math.min(1, windSpeed / 25);
      const targetAmbient = (0.015 + windNorm * 0.045) * (storm ? 1.8 : 1.0);
      this.ambientGain.gain.setTargetAtTime(targetAmbient, now, 0.2);
      this.ambientFilter.frequency.setTargetAtTime(240 + windNorm * 480 + (storm ? 180 : 0), now, 0.2);
    }
  }

  public playWobble(strength: number, firmness: number): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';

    const baseFreq = 65 + (firmness / 100) * 75;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.45, now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.82, now + 0.28);

    const vol = Math.min(0.16, Math.max(0.02, strength * 0.12));
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  public playCountdownBeep(secondsRemaining: number): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const freq = secondsRemaining <= 0 ? 1046.5 : secondsRemaining <= 3 ? 784 : 587.33;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (secondsRemaining <= 0 ? 0.35 : 0.12));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (secondsRemaining <= 0 ? 0.36 : 0.14));
  }

  public playStageSep(): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.22);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playSonicBoom(): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    [0, 0.14].forEach((offset) => {
      const now = ctx.currentTime + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(115, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.26);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    });
  }

  public playRecoveryChime(): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    });
  }
}

export const soundEngine = new SoundEngine();
