import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, 'public/audio');
const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/t2a_v2';

// 每个动作对应的播报文案
const ACTIONS = {
  fold:  '弃牌',
  check: '过牌',
  call:  '跟注',
  raise: '加注',
  allin: '全押',
  blind: '盲注',
};

async function generateAudio(text) {
  const apiKey = process.env.MINIMAX_API_KEY;
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
      voice_setting: { voice_id: 'male-qn-qingse', speed: 1, vol: 1, pitch: 0 },
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
  for (const [action, text] of Object.entries(ACTIONS)) {
    const filePath = path.join(AUDIO_DIR, `${action}.mp3`);
    if (fs.existsSync(filePath)) {
      console.log(`[TTS] cached: ${action}.mp3`);
      continue;
    }
    try {
      console.log(`[TTS] generating: ${action} → "${text}"`);
      const buf = await generateAudio(text);
      fs.writeFileSync(filePath, buf);
      console.log(`[TTS] saved: ${action}.mp3 (${buf.length} bytes)`);
    } catch (err) {
      console.warn(`[TTS] failed to generate ${action}: ${err.message}`);
    }
  }
}
