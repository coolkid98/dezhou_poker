/**
 * 使用 MiniMax 文生图 API 生成游戏所需美术资源
 * 运行: node generate-assets.mjs
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const API_KEY = 'sk-cp-ieTjSoF1mnCHGgLBZrxd5cKV_p1R_ovG3POcd1C8VZFlyxeQrwtPTe3ukwwUUlI_NeerSGx7j2o62zOlUfI3MUCAi6nM8sDZQebCC1LTni_AQyR6FKLGngM';
const API_URL = 'https://api.minimaxi.com/v1/image_generation';
const OUT_DIR = './client/public';

async function generate(prompt, filename, aspectRatio = '1:1') {
  console.log(`\n🎨 生成: ${filename}`);
  console.log(`   prompt: ${prompt.slice(0, 80)}...`);

  const body = JSON.stringify({
    model: 'image-01',
    prompt,
    aspect_ratio: aspectRatio,
    response_format: 'url',
    n: 1,
    prompt_optimizer: false,
  });

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body,
  });

  const json = await res.json();
  if (!res.ok || !json.data?.image_urls?.[0]) {
    console.error('  ❌ 生成失败:', JSON.stringify(json));
    return null;
  }

  const url = json.data.image_urls[0];
  console.log(`  ✅ 图片 URL: ${url.slice(0, 60)}...`);
  await download(url, path.join(OUT_DIR, filename));
  console.log(`  💾 已保存: ${filename}`);
  return filename;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. 单枚筹码图（顶视微倾，用于底池筹码堆叠）
  await generate(
    'A single casino poker chip, top-down view tilted slightly, photorealistic 3D render, ' +
    'red and white color, gold metallic rim, intricate edge stripe pattern, ' +
    'centered on pure black background, dramatic studio lighting, sharp focus, ' +
    '8k quality, no text, no numbers',
    'chip-single.png',
    '1:1',
  );

  // 2. 牌背面图
  await generate(
    'Premium playing card back design, deep navy blue background, ' +
    'elegant symmetric diamond lattice pattern with gold foil accent, ' +
    'ornate classic border frame, luxury casino quality, flat lay top view, ' +
    'crisp sharp edges, no people, no text',
    'card-back.png',
    '2:3',
  );

  // 3. 牌桌毡布纹理（16:9）
  await generate(
    'Luxury casino poker table top-down view, rich deep emerald green baize felt, ' +
    'subtle fine fabric weave texture, oval table edge with dark walnut wood grain border, ' +
    'soft ambient lighting, no people, no cards, no chips, seamless texture, ' +
    'photorealistic, ultra detailed',
    'table-felt.jpg',
    '16:9',
  );

  console.log('\n✅ 全部资源生成完毕！');
}

main().catch(console.error);
