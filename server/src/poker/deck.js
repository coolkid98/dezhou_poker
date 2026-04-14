// 牌表示：{ r: 2..14, s: 'c'|'d'|'h'|'s' }
// 字符串格式："As", "Td", "9h", "2c"
export const SUITS = ['c', 'd', 'h', 's'];
export const RANK_CHARS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function cardToStr(c) {
  const r = c.r >= 11 ? RANK_CHARS[c.r] : c.r === 10 ? 'T' : String(c.r);
  return r + c.s;
}

export function newDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) deck.push({ r, s });
  }
  return deck;
}

export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
