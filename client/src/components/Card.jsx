import React from 'react';

// code 形如 "As", "Td"；empty 空槽；hidden 背面；revealing 触发翻牌动画
export default function Card({ code, empty, hidden, revealing, delay = 0 }) {
  if (empty) return <div className="card empty" />;
  if (hidden) return <div className="card back" />;
  if (!code) return <div className="card empty" />;
  const rank = code.slice(0, -1);
  const suit = code.slice(-1);
  const suitMap = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const isRed = suit === 'h' || suit === 'd';
  const className = `card ${isRed ? 'red' : 'black'}${revealing ? ' revealing' : ''}`;
  return (
    <div className={className} style={{ animationDelay: `${delay}ms` }}>
      <div className="r">{rank}</div>
      <div className="s">{suitMap[suit]}</div>
    </div>
  );
}
