// 程序化生成的背景音乐 — 不依赖外部音频文件
// 4 和弦循环 pad（A minor 调性），低通滤波，适合长时间聆听不疲劳
//
// 使用方法：music.start() / music.stop()
// 浏览器会阻止自动播放，必须在用户交互（点击）后调用 start()

const CHORDS = [
  // Am (A, C, E, A) + 高八度 C
  [110.00, 130.81, 164.81, 220.00, 261.63],
  // F (F, A, C) + 低八度 F + 高 A
  [87.31, 130.81, 174.61, 220.00, 261.63],
  // Cmaj (C, E, G, C) + 高 E
  [130.81, 164.81, 196.00, 261.63, 329.63],
  // G (G, B, D, G) + 高 B
  [98.00, 123.47, 146.83, 196.00, 246.94],
];

const CHORD_DURATION = 4.0;
const LOOP_DURATION = CHORDS.length * CHORD_DURATION; // 16s

class Music {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.playing = false;
    this.nextTime = 0;
    this.timer = null;
    this.targetVolume = 0.55;
  }

  _ensureCtx() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;

    // 低通滤波 → 柔和
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.5;

    this.master.connect(filter);
    filter.connect(this.ctx.destination);
  }

  _playChord(chord, startTime) {
    for (const freq of chord) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // 轻微 detune 让音色温暖些
      osc.detune.value = (Math.random() - 0.5) * 6;

      // 独立 gain 节点做 ADSR，避免 note-on 点击声
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.16, startTime + 1.5);
      g.gain.setValueAtTime(0.16, startTime + CHORD_DURATION - 1.5);
      g.gain.linearRampToValueAtTime(0, startTime + CHORD_DURATION);

      osc.connect(g);
      g.connect(this.master);
      osc.start(startTime);
      osc.stop(startTime + CHORD_DURATION + 0.1);
    }
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
    this.master.gain.linearRampToValueAtTime(this.targetVolume, now + 1.2);

    this.nextTime = now;
    this._scheduleLoop();
  }

  _scheduleLoop() {
    if (!this.playing) return;
    // 预排 16s 一整段
    for (let i = 0; i < CHORDS.length; i++) {
      this._playChord(CHORDS[i], this.nextTime + i * CHORD_DURATION);
    }
    this.nextTime += LOOP_DURATION;
    // 提前 4 秒排下一段，避免衔接断层
    this.timer = setTimeout(
      () => this._scheduleLoop(),
      (LOOP_DURATION - 4) * 1000,
    );
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.8);
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
