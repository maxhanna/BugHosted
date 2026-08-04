// Dependency-free MIDI player for the racing title screen.
// Browsers can't decode .mid files natively, so this parses the SMF (Standard
// MIDI File) binary format and synthesizes the notes with WebAudio oscillators
// (a small saw + square lead through a lowpass filter — reads as a retro synth
// without shipping any SoundFont or third-party library).

export class MidiPlayer {
  private ctx: AudioContext;
  private master: GainNode;
  private notes: { start: number; duration: number; note: number; velocity: number }[] = [];
  private totalDuration = 0;
  private playing = false;
  private activeNodes: AudioNode[] = [];
  private loopHandle: number | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(ctx.destination);
  }

  get isPlaying(): boolean { return this.playing; }

  /** Fetch + parse a .mid file. Resolves once ready to play. */
  async load(url: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MIDI fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    this.parse(new Uint8Array(buf));
  }

  /** Schedule the whole song now, looping until stop() is called. */
  play() {
    if (this.playing || this.notes.length === 0) return;
    this.playing = true;
    const startAt = this.ctx.currentTime + 0.08;
    for (const n of this.notes) {
      this.scheduleNote(startAt + n.start, n.duration, n.note, n.velocity);
    }
    // Loop: when the song finishes, tear down its nodes and restart.
    this.loopHandle = window.setTimeout(() => {
      this.stopAllNodes();
      if (this.playing) this.play();
    }, this.totalDuration * 1000 + 120);
  }

  stop() {
    this.playing = false;
    if (this.loopHandle !== null) { clearTimeout(this.loopHandle); this.loopHandle = null; }
    this.stopAllNodes();
  }

  private scheduleNote(start: number, dur: number, midi: number, vel: number) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = freq * 2;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800 + vel * 3200;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    const peak = 0.09 * vel + 0.02;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.06, dur));
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    const end = start + dur + 0.05;
    osc.start(start); osc.stop(end);
    osc2.start(start); osc2.stop(end);
    this.activeNodes.push(osc, osc2, filter, gain);
  }

  private stopAllNodes() {
    const now = this.ctx.currentTime;
    for (const node of this.activeNodes) {
      try {
        if (node instanceof OscillatorNode) { try { node.stop(now + 0.02); } catch { } }
        node.disconnect();
      } catch { }
    }
    this.activeNodes = [];
  }

  // ── SMF binary parsing ────────────────────────────────────────────────────
  private parse(data: Uint8Array): void {
    let pos = 0;
    const readU8 = () => data[pos++];
    const readU16 = () => { const v = (data[pos] << 8) | data[pos + 1]; pos += 2; return v; };
    const readU32 = () => {
      const v = ((data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]) >>> 0;
      pos += 4; return v;
    };
    const readVLQ = (): number => {
      let value = 0, b: number;
      do { b = readU8(); value = (value << 7) | (b & 0x7f); } while (b & 0x80);
      return value;
    };

    // Header chunk
    const tag = String.fromCharCode(readU8(), readU8(), readU8(), readU8());
    if (tag !== 'MThd') throw new Error('Not a MIDI file');
    const headerLen = readU32();
    readU16();          // format
    const ntrks = readU16();
    const division = readU16();
    pos += headerLen - 6;

    // Tempo map (tick → microseconds per quarter note). Default 500000.
    const tempos: { tick: number; tempo: number }[] = [{ tick: 0, tempo: 500000 }];
    const rawEvents: { tick: number; on: boolean; note: number; vel: number }[] = [];

    for (let t = 0; t < ntrks; t++) {
      const trackTag = String.fromCharCode(readU8(), readU8(), readU8(), readU8());
      if (trackTag !== 'MTrk') break;
      const trackLen = readU32();
      const trackEnd = pos + trackLen;
      let tick = 0;
      let runningStatus = 0;

      while (pos < trackEnd) {
        tick += readVLQ();
        let status = readU8();
        if (status < 0x80) {
          // Running status — the byte we just read is actually the first data byte.
          pos--;
          status = runningStatus || 0x90;
        } else {
          runningStatus = status;
        }
        const high = status & 0xf0;

        if (status === 0xff) {
          const metaType = readU8();
          const len = readVLQ();
          if (metaType === 0x51 && len >= 3) {
            const tempo = (readU8() << 16) | (readU8() << 8) | readU8();
            tempos.push({ tick, tempo });
            pos += len - 3;
          } else {
            pos += len;
          }
          if (metaType === 0x2f) break; // end of track
        } else if (status === 0xf0 || status === 0xf7) {
          const len = readVLQ();
          pos += len;
        } else if (high === 0x90) {
          const note = readU8();
          const vel = readU8();
          rawEvents.push({ tick, on: vel > 0, note, vel });
        } else if (high === 0x80) {
          const note = readU8();
          readU8();
          rawEvents.push({ tick, on: false, note, vel: 0 });
        } else if (high === 0xb0 || high === 0xe0 || high === 0xa0) {
          pos += 2; // controller / pitch bend / poly aftertouch
        } else if (high === 0xc0 || high === 0xd0) {
          pos += 1; // program change / channel aftertouch
        }
      }
      pos = trackEnd; // safety
    }

    const ppqn = (division & 0x7fff) || 480;
    tempos.sort((a, b) => a.tick - b.tick);
    const tickToSec = (tick: number): number => {
      let secs = 0;
      let prevTick = 0;
      let tempo = tempos[0].tempo;
      for (const tp of tempos) {
        if (tp.tick >= tick) break;
        secs += ((tp.tick - prevTick) / ppqn) * (tempo / 1e6);
        prevTick = tp.tick;
        tempo = tp.tempo;
      }
      secs += ((tick - prevTick) / ppqn) * (tempo / 1e6);
      return secs;
    };

    // Pair note-on events with their note-off to build (start, duration) notes.
    rawEvents.sort((a, b) => a.tick - b.tick);
    const activeOn: { [note: number]: { tick: number; vel: number } } = {};
    const notes: { start: number; duration: number; note: number; velocity: number }[] = [];
    for (const ev of rawEvents) {
      if (ev.on) {
        activeOn[ev.note] = { tick: ev.tick, vel: ev.vel };
      } else if (activeOn[ev.note]) {
        const start = tickToSec(activeOn[ev.note].tick);
        const end = tickToSec(ev.tick);
        notes.push({ start, duration: Math.max(0.08, end - start), note: ev.note, velocity: activeOn[ev.note].vel / 127 });
        delete activeOn[ev.note];
      }
    }
    // Close any dangling note-ons (missing note-offs) with a short tail.
    for (const note in activeOn) {
      const start = tickToSec(activeOn[note].tick);
      notes.push({ start, duration: 0.4, note: +note, velocity: activeOn[note].vel / 127 });
    }

    notes.sort((a, b) => a.start - b.start);
    this.notes = notes;
    this.totalDuration = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0) + 0.5;
  }
}
