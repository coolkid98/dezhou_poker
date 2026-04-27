export function getSeatVisibility({ player, isSelf, hole, showdownHole }) {
  const showCards = isSelf
    ? (hole?.length === 2 ? hole : showdownHole)
    : showdownHole;
  const isOwnFoldedHand = Boolean(isSelf && player.folded && showCards?.length === 2);

  return {
    showCards,
    isOwnFoldedHand,
    foldClass: player.folded ? (isOwnFoldedHand ? 'self-folded' : 'folded') : null,
    shouldAnimateFold: Boolean(player.folded && !isOwnFoldedHand),
  };
}
