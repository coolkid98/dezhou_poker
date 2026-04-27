export function createSettlement(players, buyIns, endedAt = Date.now()) {
  const getBuyIn = (playerId, fallback = 0) => {
    if (buyIns instanceof Map) return buyIns.get(playerId) ?? fallback;
    return buyIns?.[playerId] ?? fallback;
  };

  const results = players.map(p => {
    const buyIn = getBuyIn(p.id, 0);
    const finalStack = p.stack || 0;
    return {
      playerId: p.id,
      nickname: p.nickname,
      buyIn,
      finalStack,
      net: finalStack - buyIn,
    };
  });

  const winners = results
    .filter(p => p.net > 0)
    .map(p => ({ ...p, remaining: p.net }));
  const losers = results
    .filter(p => p.net < 0)
    .map(p => ({ ...p, remaining: -p.net }));
  const transfers = [];

  let winnerIdx = 0;
  for (const loser of losers) {
    while (loser.remaining > 0 && winnerIdx < winners.length) {
      const winner = winners[winnerIdx];
      const amount = Math.min(loser.remaining, winner.remaining);
      if (amount > 0) {
        transfers.push({
          fromPlayerId: loser.playerId,
          fromNickname: loser.nickname,
          toPlayerId: winner.playerId,
          toNickname: winner.nickname,
          amount,
        });
      }
      loser.remaining -= amount;
      winner.remaining -= amount;
      if (winner.remaining === 0) winnerIdx++;
    }
  }

  const totalBuyIn = results.reduce((sum, p) => sum + p.buyIn, 0);
  const totalFinal = results.reduce((sum, p) => sum + p.finalStack, 0);

  return {
    endedAt,
    totalBuyIn,
    totalFinal,
    balanced: totalBuyIn === totalFinal,
    players: results,
    transfers,
  };
}
