// 动作语音播报：播放服务端预生成的 TTS 音频文件
class Tts {
  constructor() {
    this.enabled = true;
  }

  play(action) {
    if (!this.enabled) return;
    try {
      const audio = new Audio(`/audio/${action}.mp3`);
      audio.volume = 0.85;
      audio.play().catch(() => {});
    } catch {}
  }

  setEnabled(e) { this.enabled = !!e; }
  isEnabled() { return this.enabled; }
}

export const tts = new Tts();
