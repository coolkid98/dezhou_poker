// 程序化音效 — 不依赖外部文件
// 每个 API 对应一个游戏事件：chip（下注）、fold、check、deal、win

class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this._actionSoundEndsAt = 0; // 上一次行动音效的预计结束时间戳
  }

  // 供外部查询：行动音效结束后多少 ms 才能播翻牌音
  safeCardFlipDelay() {
    const gap = this._actionSoundEndsAt - Date.now();
    return Math.max(50, gap + 80); // 至少 50ms，结束后再加 80ms 缓冲
  }

  _ensureCtx() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
  }

  async _resume() {
    this._ensureCtx();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch {}
    }
  }

  setEnabled(e) { this.enabled = !!e; }
  isEnabled() { return this.enabled; }

  // 通用：一个简单的包络音
  _tone({ freq, type = 'sine', duration = 0.15, volume = 0.5, attack = 0.005, release = 0.08, detune = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(volume, now + attack);
    g.gain.setValueAtTime(volume, now + duration - release);
    g.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  // 短噪声脉冲（金属感）
  _noiseClick({ duration = 0.08, volume = 0.3, freq = 4000 } = {}) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 2.5;

    const g = this.ctx.createGain();
    g.gain.value = volume;

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + duration);
  }

  // 下注筹码声 —— 两三个金属短音叠加，像筹码叩击桌面
  async chip() {
    await this._resume();
    this._actionSoundEndsAt = Date.now() + 160;
    this._noiseClick({ duration: 0.06, volume: 0.35, freq: 3500 });
    setTimeout(() => this._noiseClick({ duration: 0.05, volume: 0.28, freq: 4200 }), 40);
    setTimeout(() => this._noiseClick({ duration: 0.05, volume: 0.22, freq: 3000 }), 85);
  }

  // 加注：比跟注多一个更高的亮音
  async raise() {
    await this._resume();
    this._actionSoundEndsAt = Date.now() + 220;
    this.chip();
    this._tone({ freq: 880, type: 'triangle', duration: 0.18, volume: 0.2, attack: 0.01, release: 0.1 });
  }

  // All-in：戏剧化三音上行
  async allin() {
    await this._resume();
    this._actionSoundEndsAt = Date.now() + 400;
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((f, i) => setTimeout(() => {
      this._tone({ freq: f, type: 'triangle', duration: 0.25, volume: 0.32, attack: 0.005, release: 0.15 });
      this._noiseClick({ duration: 0.06, volume: 0.3, freq: 3800 });
    }, i * 100));
  }

  // 过牌：双击叩桌声（低频闷响 × 2，像指节叩桌）
  async check() {
    await this._resume();
    this._actionSoundEndsAt = Date.now() + 230; // 110ms + ~90ms 尾音
    const knock = () => {
      this._tone({ freq: 180, type: 'triangle', duration: 0.09, volume: 0.45, attack: 0.002, release: 0.07 });
      this._noiseClick({ duration: 0.07, volume: 0.35, freq: 600 });
    };
    knock();
    setTimeout(knock, 110);
  }

  // 弃牌：软绵绵下行
  async fold() {
    await this._resume();
    this._actionSoundEndsAt = Date.now() + 220;
    this._tone({ freq: 440, type: 'sine', duration: 0.12, volume: 0.18, attack: 0.01, release: 0.08 });
    setTimeout(() => {
      this._tone({ freq: 330, type: 'sine', duration: 0.14, volume: 0.15, attack: 0.01, release: 0.1 });
    }, 60);
  }

  // 发公共牌：纸牌翻转声（通用，摊牌时使用）
  async deal() {
    await this._resume();
    this._noiseClick({ duration: 0.1, volume: 0.28, freq: 2500 });
  }

  // 单张公共牌翻开音效（更清脆的纸牌划过牌毡感）
  async cardFlip() {
    await this._resume();
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 高频纸张摩擦 → 快速衰减
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.12);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * (t < 0.05 ? t / 0.05 : 1);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    // 带通：保留纸牌感中频
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 1.8;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1.1, now);
    g.gain.linearRampToValueAtTime(0, now + 0.12);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + 0.13);

    // 叠一个短促低音，增加"落桌"质感
    this._tone({ freq: 220, type: 'triangle', duration: 0.07, volume: 0.28, attack: 0.002, release: 0.055 });
  }

  // 赢家音：上行琶音
  async win() {
    await this._resume();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
    notes.forEach((f, i) => setTimeout(() => {
      this._tone({ freq: f, type: 'triangle', duration: 0.35, volume: 0.32, attack: 0.01, release: 0.25 });
    }, i * 90));
  }
}

export const sfx = new Sfx();
