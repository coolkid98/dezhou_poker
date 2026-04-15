import { newDeck } from './deck.js';
import { evaluate7, compareRanks } from './evaluator.js';

function cardKey(c) {
  return `${c.r}${c.s}`;
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * 蒙特卡洛胜率模拟
 * @param {Array} holeCards  - [{r,s},{r,s}] 当前玩家手牌（原始对象）
 * @param {Array} boardCards - [{r,s},...] 公共牌（0-5张）
 * @param {number} numOpponents - 对手数量
 * @param {number} simulations - 模拟次数
 * @returns {{ winRate: number, tieRate: number, equity: number }}  均为 0-100 的百分比
 */
export function monteCarloWinRate(holeCards, boardCards, numOpponents, simulations = 1500) {
  const knownKeys = new Set([
    ...holeCards.map(cardKey),
    ...boardCards.map(cardKey),
  ]);

  const remaining = newDeck().filter(c => !knownKeys.has(cardKey(c)));
  const boardNeeded = 5 - boardCards.length;
  const cardsPerSim = boardNeeded + numOpponents * 2;

  if (remaining.length < cardsPerSim) {
    return { winRate: 0, tieRate: 0, equity: 0 };
  }

  let wins = 0, ties = 0, total = 0;

  for (let i = 0; i < simulations; i++) {
    shuffleArr(remaining);
    let idx = 0;

    // 补全公共牌
    const board = [...boardCards];
    for (let b = 0; b < boardNeeded; b++) board.push(remaining[idx++]);

    // 分配对手手牌并评估
    const myRank = evaluate7([...holeCards, ...board]);

    let result = 'win';
    for (let o = 0; o < numOpponents; o++) {
      const oppHole = [remaining[idx++], remaining[idx++]];
      const oppRank = evaluate7([...oppHole, ...board]);
      const cmp = compareRanks(myRank, oppRank);
      if (cmp < 0) { result = 'lose'; break; }
      if (cmp === 0) result = 'tie';
    }

    if (result === 'win') wins++;
    else if (result === 'tie') ties++;
    total++;
  }

  const winRate = total > 0 ? (wins / total) * 100 : 0;
  const tieRate = total > 0 ? (ties / total) * 100 : 0;
  // equity：赢+平分的期望权益
  const equity = winRate + tieRate / 2;

  return {
    winRate: Math.round(winRate),
    tieRate: Math.round(tieRate),
    equity: Math.round(equity),
  };
}
