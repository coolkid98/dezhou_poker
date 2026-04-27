export function chipColors(amount) {
  if (amount >= 500) return { base: '#1a1a1a', edge: '#ffffff', text: '#ffd33d' };
  if (amount >= 100) return { base: '#1e3a8a', edge: '#ffffff', text: '#ffffff' };
  if (amount >= 25)  return { base: '#0f7a36', edge: '#ffffff', text: '#ffffff' };
  if (amount >= 5)   return { base: '#b31b1b', edge: '#ffffff', text: '#ffffff' };
  return { base: '#f0f0f0', edge: '#555555', text: '#1a1a1a' };
}

export function potChipStyle(index) {
  const col = index % 6;
  const row = Math.floor(index / 6);
  const offsetY = row * 4;
  return {
    left: `${col * 13}px`,
    bottom: `${offsetY}px`,
    zIndex: index + 1,
    transform: `rotate(${((index % 5) - 2) * 8}deg)`,
  };
}
