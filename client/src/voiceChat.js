export const VOICE_RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function upsertVoicePeer(peers, peer) {
  if (!peer?.playerId) return peers;
  return { ...peers, [peer.playerId]: { ...peer, speaking: true } };
}

export function removeVoicePeer(peers, playerId) {
  const { [playerId]: _, ...rest } = peers;
  return rest;
}

export function getVoiceIndicator({ isSelf, isVoiceOn }) {
  return {
    title: isSelf
      ? isVoiceOn ? '关闭麦克风' : '开启麦克风'
      : isVoiceOn ? '语音已开启' : '未开启语音',
    className: [
      'voice-seat-btn',
      isVoiceOn && 'voice-on',
      isSelf && 'voice-self',
    ].filter(Boolean).join(' '),
    clickable: Boolean(isSelf),
  };
}

export function createRemoteAudioElement(playerId, stream) {
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.playsInline = true;
  audio.dataset.playerId = String(playerId);
  audio.srcObject = stream;
  audio.style.display = 'none';
  return audio;
}
