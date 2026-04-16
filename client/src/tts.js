import { getToken } from './api.js';

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

  // 内部：请求 TTS API，返回可播放的 HTMLAudioElement
  async _fetchAudio(text, emotion = 'happy', speed = 0.95) {
    const token = getToken();
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, emotion, speed }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 0.85;
    audio.onended = () => URL.revokeObjectURL(url);
    return audio;
  }

  // 立即合成并播放
  async speak(text, emotion = 'happy', speed = 0.95) {
    if (!this.enabled) return;
    try {
      const audio = await this._fetchAudio(text, emotion, speed);
      audio?.play().catch(() => {});
    } catch {}
  }

  // 立即开始请求音频，但等 delayMs 后才播放
  // 用于获胜播报：提前请求减少空白等待，播放时机对齐动画结束
  speakAfter(text, delayMs, emotion = 'happy', speed = 0.95) {
    if (!this.enabled) return;
    const fetchPromise = this._fetchAudio(text, emotion, speed).catch(() => null);
    Promise.all([
      fetchPromise,
      new Promise(r => setTimeout(r, delayMs)),
    ]).then(([audio]) => {
      if (audio && this.enabled) audio.play().catch(() => {});
    });
  }

  setEnabled(e) { this.enabled = !!e; }
  isEnabled() { return this.enabled; }
}

export const tts = new Tts();
