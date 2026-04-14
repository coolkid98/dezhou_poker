// 程序化赌场爵士背景音乐 — WebAudio
// 风格：Jazz Lounge，108 BPM，Am-F-C-G 循环
// 层次：鼓组（kick/snare/ride）+ 行走低音 + 和弦衬垫 + 旋律

const BPM        = 108;
const BEAT       = 60 / BPM;          // 四分音符 ≈ 0.556s
const HALF       = BEAT / 2;          // 八分音符
const CHORD_DUR  = BEAT * 8;          // 每个和弦 2 小节（8 拍）
const LOOP_DUR   = CHORD_DUR * 4;     // 4 和弦 = 32 拍 ≈ 17.8s

// ── 和弦衬垫频率（正弦波，多声部） ──────────────────────────────
const PADS = [
  [220.00, 261.63, 329.63, 440.00],  // Am:  A3 C4 E4 A4
  [174.61, 220.00, 261.63, 349.23],  // F:   F3 A3 C4 F4
  [261.63, 329.63, 392.00, 523.25],  // C:   C4 E4 G4 C5
  [196.00, 246.94, 293.66, 392.00],  // G:   G3 B3 D4 G4
];

// ── 行走低音（三角波），每拍一音 ────────────────────────────────
const BASS = [
  // Am — A2 G2 A2 C3 A2 G2 E2 G2
  [110.00,  98.00, 110.00, 130.81, 110.00,  98.00,  82.41,  98.00],
  // F  — F2 A2 F2 C3 F2 A2 G2 F2
  [ 87.31, 110.00,  87.31, 130.81,  87.31, 110.00,  98.00,  87.31],
  // C  — C3 G2 E3 C3 G2 C3 E3 C3
  [130.81,  98.00, 164.81, 130.81,  98.00, 130.81, 164.81, 130.81],
  // G  — G2 B2 G2 D3 B2 G2 A2 G2
  [ 98.00, 123.47,  98.00, 146.83, 123.47,  98.00, 110.00,  98.00],
];

// ── 旋律（A小调五声音阶），每条 = 8拍 ──────────────────────────
// 每项：[频率|null, 拍数]
const _B4 = 493.88;
const MEL = [
  // Am — 爬升收尾
  [[440, 1.5], [null, 0.5], [523.25, 1], [659.25, 2], [587.33, 1], [523.25, 1], [440, 1]],
  // F  — 下行
  [[523.25, 1], [440, 1.5], [null, 0.5], [392, 1], [349.23, 2], [392, 1], [440, 1]],
  // C  — 上扬
  [[392, 1], [523.25, 1.5], [null, 0.5], [659.25, 1], [523.25, 2], [587.33, 1], [523.25, 1]],
  // G  — 张力 → 解决
  [[783.99, 1.5], [null, 0.5], [659.25, 1], [587.33, 1], [_B4, 2], [440, 1], [null, 1]],
];

// ── 鼓点位置（以拍为单位，浮点可用于切分音） ──────────────────
// 每和弦 8 拍（2 小节），0-indexed
const KICK_POS  = [0, 2.5, 4, 6.5];          // 切分踢鼓，富有弹性
const SNARE_POS = [1, 3, 5, 7];              // 2 & 4 拍军鼓
// Ride：每个八分音符一下，共 16 次
const RIDE_POS  = Array.from({ length: 16 }, (_, i) => i * 0.5);

// ────────────────────────────────────────────────────────────────
class Music {
  constructor() {
    this.ctx        = null;
    this.master     = null;
    this.noiseBuf   = null;   // 预生成白噪声 buffer，供鼓组复用
    this.playing    = false;
    this.nextTime   = 0;
    this.timer      = null;
    this.targetVolume = 0.52;
  }

  _ensureCtx() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // 预生成 1s 白噪声（鼓组共用）
    const sr   = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, sr, sr);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < sr; i++) data[i] = Math.random() * 2 - 1;
  }

  // ── 底鼓：正弦从 110Hz 指数衰减到 40Hz ──────────────────────
  _kick(t) {
    const { ctx, master } = this;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + 0.25);
  }

  // ── 军鼓：白噪声 + 高通滤波 ─────────────────────────────────
  _snare(t) {
    const { ctx, master, noiseBuf } = this;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1200;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.15);
  }

  // ── Ride 镲：白噪声 + 极高通，力度两档 ─────────────────────
  _ride(t, accent) {
    const { ctx, master, noiseBuf } = this;
    const dur = accent ? 0.16 : 0.07;
    const vol = accent ? 0.14 : 0.07;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 8000;

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // ── 低音：三角波 + 低通，短 ADSR ────────────────────────────
  _bass(freq, t, dur) {
    const { ctx, master } = this;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500;

    const g = ctx.createGain();
    const sustain = dur * 0.75;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.48, t + 0.02);
    g.gain.setValueAtTime(0.48, t + sustain);
    g.gain.linearRampToValueAtTime(0, t + dur);

    osc.connect(lp); lp.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // ── 和弦衬垫：多正弦，缓慢淡入淡出 ─────────────────────────
  _pad(freqs, t, dur) {
    for (const freq of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 10;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 1.8);
      g.gain.setValueAtTime(0.09, t + dur - 1.5);
      g.gain.linearRampToValueAtTime(0, t + dur);

      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.1);
    }
  }

  // ── 旋律音：正弦，适度 ADSR ─────────────────────────────────
  _note(freq, t, dur) {
    if (!freq) return;
    const { ctx, master } = this;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const att = Math.min(0.04, dur * 0.08);
    const rel = Math.min(0.12, dur * 0.25);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.20, t + att);
    g.gain.setValueAtTime(0.20, t + dur - rel);
    g.gain.linearRampToValueAtTime(0, t + dur);

    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // ── 编排单个和弦段（8拍）──────────────────────────────────
  _scheduleChord(idx, startTime) {
    const pad  = PADS[idx];
    const bass = BASS[idx];
    const mel  = MEL[idx];

    // 衬垫
    this._pad(pad, startTime, CHORD_DUR);

    // 行走低音
    bass.forEach((freq, i) => {
      this._bass(freq, startTime + i * BEAT, BEAT * 0.88);
    });

    // 鼓组
    KICK_POS.forEach(b  => this._kick(startTime + b * BEAT));
    SNARE_POS.forEach(b => this._snare(startTime + b * BEAT));
    RIDE_POS.forEach(b  => this._ride(startTime + b * BEAT, Number.isInteger(b)));

    // 旋律
    let t = startTime;
    for (const [freq, beats] of mel) {
      this._note(freq, t, beats * BEAT);
      t += beats * BEAT;
    }
  }

  _scheduleLoop() {
    if (!this.playing) return;
    for (let i = 0; i < 4; i++) {
      this._scheduleChord(i, this.nextTime + i * CHORD_DUR);
    }
    this.nextTime += LOOP_DUR;
    // 提前一个和弦时长排下一段，确保无缝衔接
    this.timer = setTimeout(
      () => this._scheduleLoop(),
      (LOOP_DUR - CHORD_DUR) * 1000,
    );
    if (this.timer.unref) this.timer.unref();
  }

  async start() {
    this._ensureCtx();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch {}
    }
    if (this.playing) return;
    this.playing = true;

    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.targetVolume, now + 1.5);

    this.nextTime = now;
    this._scheduleLoop();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 1.0);
    }
  }

  setVolume(v) {
    this.targetVolume = Math.max(0, Math.min(1, v));
    if (this.master && this.playing) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(this.targetVolume, now + 0.3);
    }
  }

  isPlaying() { return this.playing; }
}

export const music = new Music();
