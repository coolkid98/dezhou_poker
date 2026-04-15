import { getToken } from './api.js';

// 动作语音播报：播放服务端预生成的 TTS 音频文件
class Tts {
  constructor() {
    this.enabled = true;
  }

  // 播放预生成的动作音频（fold/check/call/raise/allin/blind）
  play(action) {
    if (!this.enabled) return;
    try {
      const audio = new Audio(`/audio/${action}.mp3`);
      audio.volume = 0.85;
      audio.play().catch(() => {});
    } catch {}
  }

  // 动态合成任意文本并播放（用于获胜播报等）
  async speak(text, emotion = 'happy', speed = 0.95) {
    if (!this.enabled) return;
    try {
      const token = getToken();
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, emotion, speed }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 0.85;
      audio.play().catch(() => {});
      audio.onended = () => URL.revokeObjectURL(url);
    } catch {}
  }

  setEnabled(e) { this.enabled = !!e; }
  isEnabled() { return this.enabled; }
}

export const tts = new Tts();
