export function chipColors(amount) {
  if (amount >= 500) return { base: '#1a1a1a', edge: '#ffffff', text: '#ffd33d' };
  if (amount >= 100) return { base: '#1e3a8a', edge: '#ffffff', text: '#ffffff' };
  if (amount >= 25)  return { base: '#0f7a36', edge: '#ffffff', text: '#ffffff' };
  if (amount >= 5)   return { base: '#b31b1b', edge: '#ffffff', text: '#ffffff' };
  return { base: '#f0f0f0', edge: '#555555', text: '#1a1a1a' };
}

export function potChipStyle(index) {
  const { left, bottom, rotation } = potChipOffset(index);
  return {
    left: `${left}px`,
    bottom: `${bottom}px`,
    zIndex: index + 1,
    '--chip-rot': rotation,
  };
}

export function potChipOffset(index) {
  const col = index % 6;
  const row = Math.floor(index / 6);
  return {
    left: col * 13,
    bottom: row * 4,
    rotation: `${((index % 5) - 2) * 8}deg`,
  };
}

export function potChipTarget({ feltRect, stackRect, clientLeft = 0, clientTop = 0, index, chipSize = 30 }) {
  if (!feltRect || !stackRect) return { x: null, y: null };
  const offset = potChipOffset(index);
  const radius = chipSize / 2;
  return {
    x: stackRect.left - feltRect.left - clientLeft + offset.left + radius,
    y: stackRect.bottom - feltRect.top - clientTop - offset.bottom - radius,
  };
}
