import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, 'public/audio');
const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/t2a_v2';

// 每个动作的播报文案 + 对应语气
const ACTIONS = {
  fold:  { text: '弃牌',  emotion: 'sad',   speed: 0.9,  vol: 1 },
  check: { text: '过牌',  emotion: 'calm',  speed: 1.0,  vol: 1 },
  call:  { text: '跟注',  emotion: 'calm',  speed: 1.05, vol: 1 },
  raise: { text: '加注',  emotion: 'happy', speed: 1.1,  vol: 1 },
  allin: { text: '全押',  emotion: 'angry', speed: 1.2,  vol: 1 },
  blind: { text: '盲注',  emotion: 'calm',  speed: 1.0,  vol: 1 },
};

/**
 * 调用 MiniMax TTS，返回 MP3 Buffer
 * @param {string} text
 * @param {{ emotion?: string, speed?: number, vol?: number, pitch?: number }} [voice]
 */
export async function generateTtsBuffer(text, voice = {}) {
  const apiKey = process.env.MINIMAX_API_KEY;
  const { emotion = 'calm', speed = 1.0, vol = 1, pitch = 0 } = voice;
  const res = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'speech-2.8-hd',
      text,
      stream: false,
      voice_setting: { voice_id: 'male-qn-qingse', speed, vol, pitch, emotion },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    }),
  });
  const data = await res.json();
  if (data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg || 'TTS error');
  }
  return Buffer.from(data.data.audio, 'hex');
}

export async function initTtsCache() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  for (const [action, cfg] of Object.entries(ACTIONS)) {
    const filePath = path.join(AUDIO_DIR, `${action}.mp3`);
    // 每次启动强制重新生成（语气配置可能已更新）
    try {
      console.log(`[TTS] generating: ${action} → "${cfg.text}" (emotion: ${cfg.emotion}, speed: ${cfg.speed})`);
      const buf = await generateTtsBuffer(cfg.text, cfg);
      fs.writeFileSync(filePath, buf);
      console.log(`[TTS] saved: ${action}.mp3 (${buf.length} bytes)`);
    } catch (err) {
      console.warn(`[TTS] failed to generate ${action}: ${err.message}`);
    }
  }
}
