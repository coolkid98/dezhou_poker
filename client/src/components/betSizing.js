export function clampBet(value, min, max) {
  const n = Math.floor(Number(value) || 0);
  return Math.min(Math.max(n, min), max);
}

export function poolRaiseTo({ pot, fraction, meBet, toCall, minRaiseTo, maxRaiseTo }) {
  const poolAmount = Math.floor((Number(pot) || 0) * fraction);
  const target = (Number(meBet) || 0) + (Number(toCall) || 0) + poolAmount;
  return clampBet(target, minRaiseTo, maxRaiseTo);
}
