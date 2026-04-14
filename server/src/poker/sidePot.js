// 按玩家累计投入分层计算边池
// contributions: [{ playerId, amount, folded }]  amount 是整手牌累计投入
// 返回 pots: [{ amount, eligible: [playerId,...] }]
export function calculatePots(contributions) {
  const thresholds = [...new Set(contributions.map(c => c.amount))]
    .filter(a => a > 0)
    .sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const th of thresholds) {
    const layer = th - prev;
    let amount = 0;
    const eligible = [];
    for (const c of contributions) {
      if (c.amount >= th) {
        amount += layer;
        if (!c.folded) eligible.push(c.playerId);
      }
    }
    if (amount > 0 && eligible.length > 0) pots.push({ amount, eligible });
    else if (amount > 0 && eligible.length === 0) {
      // 无人争夺的层（理论不会发生，因为弃牌前提是有人继续跟注）
      if (pots.length) pots[pots.length - 1].amount += amount;
    }
    prev = th;
  }
  return pots;
}
