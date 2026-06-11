/* =========================================================================
   AudioEngine
   - Synthesizes all sounds dynamically via Web Audio API
   - Procedural sounds: shoot, hit, roundEnd
   - Procedural background music: looping retro arpeggio/bassline
   ========================================================================= */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.isPlayingMusic = false;
    this.musicInterval = null;
    this.step = 0;
  }

  unlock() {
    if (this.unlocked) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.unlocked = true;
    } catch (e) {
      console.warn('Web Audio API not supported on this browser.');
    }
  }

  // Short noise burst, lowpass-filtered (laser fire)
  shoot() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = 0.08;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const src = ctx.createBufferSource();
    src.buffer = buf;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  // Sine sweep 440 -> 180 with mild waveshaper distortion (damage hit)
  hit() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = 0.18;
    
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; // punchier than sine
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + dur);
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i / 511) * 2 - 1;
      curve[i] = Math.tanh(x * 3.0);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    
    osc.connect(filter);
    filter.connect(shaper);
    shaper.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  // Three descending square tones, 200ms each (round conclusion)
  roundEnd() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const tones = [330, 247, 165];
    
    tones.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
      gain.gain.linearRampToValueAtTime(0.0, t + 0.21);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(t);
      osc.stop(t + 0.23);
    });
  }

  // Loop a procedural bassline arpeggio for ambient background music
  startMusic() {
    if (!this.unlocked || !this.ctx || this.isPlayingMusic) return;
    this.isPlayingMusic = true;
    this.step = 0;

    const bpm = 125;
    const stepTime = 60 / bpm / 2; // eighth notes (0.24s)
    let nextNoteTime = this.ctx.currentTime;

    // A retro-sounding chiptune bass progression (Frequencies in Hz)
    // A2 (110), C3 (130.81), E3 (164.81), G3 (196), D3 (146.83)
    const seq = [
      110, 110, 164.81, 110, 130.81, 110, 164.81, 196,
      146.83, 146.83, 196, 146.83, 164.81, 146.83, 196, 220
    ];

    const scheduler = () => {
      while (nextNoteTime < this.ctx.currentTime + 0.15) {
        this.playBassNote(seq[this.step % seq.length], nextNoteTime, stepTime);
        nextNoteTime += stepTime;
        this.step++;
      }
    };

    this.musicInterval = setInterval(scheduler, 50);
  }

  playBassNote(freq, time, duration) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle'; // triangle gives a warm retro bass tone
    osc.frequency.setValueAtTime(freq, time);

    // Filter frequency sweeps down over the note (acid/synth-like)
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + duration - 0.02);

    // Envelope
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.07, time + 0.02); // volume is low so it acts as background
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.01);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    this.isPlayingMusic = false;
  }
}
