// 7选5 德州扑克牌型评估
// 返回 { category, tiebreakers: [...], name }
// category: 9=皇家同花顺 8=同花顺 7=四条 6=葫芦 5=同花 4=顺子 3=三条 2=两对 1=对子 0=高牌

const CAT_NAME = [
  '高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺', '皇家同花顺',
];

function combinations(arr, k) {
  const result = [];
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    result.push(idx.map(i => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return result;
}

// 检测顺子，返回最大牌点；支持 A-5 低顺
function straightHigh(ranksSorted) {
  // ranksSorted: 降序唯一
  const rs = [...new Set(ranksSorted)];
  for (let i = 0; i + 4 < rs.length; i++) {
    if (rs[i] - rs[i + 4] === 4) return rs[i];
  }
  // 轮子 A-2-3-4-5
  if (rs.includes(14) && rs.includes(2) && rs.includes(3) && rs.includes(4) && rs.includes(5)) {
    return 5;
  }
  return 0;
}

function evalFive(cards) {
  const ranks = cards.map(c => c.r).sort((a, b) => b - a);
  const suits = cards.map(c => c.s);
  const isFlush = suits.every(s => s === suits[0]);
  const sHigh = straightHigh(ranks);
  const isStraight = sHigh > 0;

  // 统计每个点数出现次数
  const countMap = new Map();
  for (const r of ranks) countMap.set(r, (countMap.get(r) || 0) + 1);
  // [count, rank] 排序：count 降序，rank 降序
  const groups = [...countMap.entries()]
    .map(([r, c]) => ({ r, c }))
    .sort((a, b) => (b.c - a.c) || (b.r - a.r));

  if (isStraight && isFlush) {
    if (sHigh === 14) return { category: 9, tiebreakers: [14] };
    return { category: 8, tiebreakers: [sHigh] };
  }
  if (groups[0].c === 4) {
    return { category: 7, tiebreakers: [groups[0].r, groups[1].r] };
  }
  if (groups[0].c === 3 && groups[1] && groups[1].c >= 2) {
    return { category: 6, tiebreakers: [groups[0].r, groups[1].r] };
  }
  if (isFlush) {
    return { category: 5, tiebreakers: ranks };
  }
  if (isStraight) {
    return { category: 4, tiebreakers: [sHigh] };
  }
  if (groups[0].c === 3) {
    const kickers = ranks.filter(r => r !== groups[0].r);
    return { category: 3, tiebreakers: [groups[0].r, ...kickers] };
  }
  if (groups[0].c === 2 && groups[1] && groups[1].c === 2) {
    const hi = Math.max(groups[0].r, groups[1].r);
    const lo = Math.min(groups[0].r, groups[1].r);
    const kicker = ranks.find(r => r !== hi && r !== lo);
    return { category: 2, tiebreakers: [hi, lo, kicker] };
  }
  if (groups[0].c === 2) {
    const kickers = ranks.filter(r => r !== groups[0].r);
    return { category: 1, tiebreakers: [groups[0].r, ...kickers] };
  }
  return { category: 0, tiebreakers: ranks };
}

export function compareRanks(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  const la = a.tiebreakers, lb = b.tiebreakers;
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    const x = la[i] || 0, y = lb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

// 从 7 张里选最强 5 张
export function evaluate7(cards) {
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const r = evalFive(combo);
    if (!best || compareRanks(r, best) > 0) best = r;
  }
  best.name = CAT_NAME[best.category];
  return best;
}
