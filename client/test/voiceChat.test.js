import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  createRemoteAudioElement,
  getVoiceIndicator,
  removeVoicePeer,
  upsertVoicePeer,
} from '../src/voiceChat.js';

test('upsertVoicePeer: 新增和更新语音玩家状态', () => {
  const first = upsertVoicePeer({}, { playerId: 'p1', nickname: 'kid' });
  assert.deepEqual(first, {
    p1: { playerId: 'p1', nickname: 'kid', speaking: true },
  });

  const updated = upsertVoicePeer(first, { playerId: 'p1', nickname: 'kid2' });
  assert.deepEqual(updated, {
    p1: { playerId: 'p1', nickname: 'kid2', speaking: true },
  });
});

test('removeVoicePeer: 移除指定玩家且保留其他语音状态', () => {
  const peers = {
    p1: { playerId: 'p1', nickname: 'kid', speaking: true },
    p2: { playerId: 'p2', nickname: 'kid2', speaking: true },
  };

  assert.deepEqual(removeVoicePeer(peers, 'p1'), {
    p2: { playerId: 'p2', nickname: 'kid2', speaking: true },
  });
});

test('getVoiceIndicator: 只有自己的麦克风图标可点击切换', () => {
  assert.deepEqual(getVoiceIndicator({ isSelf: true, isVoiceOn: false }), {
    title: '开启麦克风',
    className: 'voice-seat-btn voice-self',
    clickable: true,
  });
  assert.deepEqual(getVoiceIndicator({ isSelf: true, isVoiceOn: true }), {
    title: '关闭麦克风',
    className: 'voice-seat-btn voice-on voice-self',
    clickable: true,
  });
  assert.deepEqual(getVoiceIndicator({ isSelf: false, isVoiceOn: true }), {
    title: '语音已开启',
    className: 'voice-seat-btn voice-on',
    clickable: false,
  });
});

test('createRemoteAudioElement: 创建隐藏的远端音频元素', () => {
  const originalDocument = globalThis.document;
  const stream = { id: 'stream-1' };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'audio');
      return { dataset: {}, style: {} };
    },
  };

  try {
    const audio = createRemoteAudioElement('p1', stream);
    assert.equal(audio.autoplay, true);
    assert.equal(audio.playsInline, true);
    assert.equal(audio.dataset.playerId, 'p1');
    assert.equal(audio.srcObject, stream);
    assert.equal(audio.style.display, 'none');
  } finally {
    globalThis.document = originalDocument;
  }
});
