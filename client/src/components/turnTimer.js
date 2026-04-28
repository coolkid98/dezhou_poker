export function getTurnProgress(turnDeadline, now = Date.now(), totalMs = 60_000) {
  if (!turnDeadline) return 100;
  const remain = Math.max(0, turnDeadline - now);
  return Math.max(0, Math.min(100, (remain / totalMs) * 100));
}

export function getTurnColor(progress) {
  const hue = Math.round(Math.max(0, Math.min(100, progress)) * 1.2);
  return `hsl(${hue}, 75%, 55%)`;
}
