import React, { useEffect, useState } from 'react';
import Card from './Card.jsx';
import { seatPosFor } from '../layout.js';

export default function Seat({
  player, position, total,
  isSelf, isTurn, isButton, isSB, isBB, isHost, turnDeadline,
  hole, showdownHole, showdownHandName, isWinner, actionPopup,
}) {
  const [x, y] = seatPosFor(total, position);

  // 倒计时进度条
  const [progress, setProgress] = useState(100);
  useEffect(() => {
    if (!isTurn || !turnDeadline) { setProgress(100); return; }
    const total = 30_000;
    const tick = () => {
      const remain = Math.max(0, turnDeadline - Date.now());
      setProgress(Math.max(0, Math.min(100, (remain / total) * 100)));
    };
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [isTurn, turnDeadline]);

  const showCards = isSelf ? hole : showdownHole;
  const classes = [
    'seat',
    isTurn && 'turn',
    player.folded && 'folded',
    isSelf && 'self',
    isWinner && 'winner',
  ].filter(Boolean).join(' ');

  const positionBadge = isButton
    ? { label: 'D', cls: 'btn-chip' }
    : isSB
    ? { label: 'SB', cls: 'sb-chip' }
    : isBB
    ? { label: 'BB', cls: 'bb-chip' }
    : null;

  return (
    <div className={classes} style={{ left: `${x}%`, top: `${y}%` }}>
      {isTurn && (
        <div className="turn-ring">
          <div className="turn-ring-progress" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className={`seat-cards ${player.folded ? 'folding' : ''}`}>
        {showCards && showCards.length === 2
          ? showCards.map((c, i) => <Card key={i} code={c} />)
          : player.hasCards
          ? <><Card hidden /><Card hidden /></>
          : null}
      </div>

      <div className="seat-info">
        <div className="seat-name">
          {isHost && <span className="host-crown" title="房主">👑</span>}
          {positionBadge && <span className={positionBadge.cls}>{positionBadge.label}</span>}
          <span className="nick">{player.nickname}</span>
          {player.sittingOut && <span className="tag">旁观</span>}
          {player.allIn && <span className="tag allin">ALL-IN</span>}
          {!player.hasCards && player.ready && <span className="tag ready">READY</span>}
        </div>
        <div className="seat-stack">💰 {player.stack}</div>
      </div>

      {player.bet > 0 && (
        <div className="bet-chip">
          <span className="chip-dot" /> {player.bet}
        </div>
      )}

      {actionPopup && (
        <div key={actionPopup.key} className={`action-popup ${actionPopup.cls}`}>
          {actionPopup.text}
          {actionPopup.amount > 0 && <span className="amt"> {actionPopup.amount}</span>}
        </div>
      )}

      {showdownHandName && (
        <div className="handname-popup">{showdownHandName}</div>
      )}
    </div>
  );
}
