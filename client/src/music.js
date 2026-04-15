// 背景音乐播放器 — 使用 MiniMax 生成的 MP3 文件循环播放
class Music {
  constructor() {
    this.audio       = null;
    this.playing     = false;
    this.targetVolume = 0.45;
    this._fadeTimer  = null;
  }

  _ensureAudio() {
    if (this.audio) return;
    this.audio = new Audio('/bgm.mp3');
    this.audio.loop   = true;
    this.audio.volume = 0;
  }

  async start() {
    this._ensureAudio();
    if (this.playing) return;
    this.playing = true;

    // 先从 0 淡入
    this.audio.volume = 0;
    try { await this.audio.play(); } catch { return; }

    this._fadeTo(this.targetVolume, 1500);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    this._fadeTo(0, 1000, () => {
      this.audio?.pause();
    });
  }

  setVolume(v) {
    this.targetVolume = Math.max(0, Math.min(1, v));
    if (this.playing && this.audio) {
      this._fadeTo(this.targetVolume, 300);
    }
  }

  isPlaying() { return this.playing; }

  // 线性淡变 volume，duration ms
  _fadeTo(target, duration, onDone) {
    if (!this.audio) return;
    if (this._fadeTimer) { clearInterval(this._fadeTimer); this._fadeTimer = null; }
    const start    = this.audio.volume;
    const diff     = target - start;
    const steps    = Math.max(1, Math.round(duration / 20));
    const stepVol  = diff / steps;
    let   count    = 0;
    this._fadeTimer = setInterval(() => {
      count++;
      this.audio.volume = Math.max(0, Math.min(1, start + stepVol * count));
      if (count >= steps) {
        clearInterval(this._fadeTimer);
        this._fadeTimer = null;
        this.audio.volume = target;
        onDone?.();
      }
    }, 20);
  }
}

export const music = new Music();
