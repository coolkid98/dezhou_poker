import React, { useState, useEffect } from 'react';

export default function ActionBar({ me, currentBet, minRaise, myTurn, turnDeadline, onAct }) {
  const toCall = Math.max(0, currentBet - me.bet);
  const canCheck = toCall === 0;
  const minRaiseTo = Math.min(currentBet + minRaise, me.bet + me.stack);
  const maxRaiseTo = me.bet + me.stack;
  const [raiseTo, setRaiseTo] = useState(minRaiseTo);
  const [remain, setRemain] = useState(30);

  useEffect(() => {
    setRaiseTo(Math.min(Math.max(minRaiseTo, me.bet), maxRaiseTo));
  }, [minRaiseTo, maxRaiseTo, me.bet]);

  useEffect(() => {
    if (!myTurn || !turnDeadline) { setRemain(30); return; }
    const tick = () => setRemain(Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [myTurn, turnDeadline]);

  if (!myTurn) {
    return <div className="action-bar waiting">等待其他玩家行动...</div>;
  }
  if (me.folded) return <div className="action-bar waiting">你已弃牌</div>;

  const canRaise = me.stack > toCall && maxRaiseTo > currentBet;

  return (
    <div className="action-bar">
      {/* 主操作行：计时 + 弃牌/过牌/跟注 + All-in */}
      <div className="action-main">
        <div className="timer-pill">⏱ {remain}s</div>
        <button className="btn-fold" onClick={() => onAct('fold')}>弃牌</button>
        {canCheck ? (
          <button className="btn-check" onClick={() => onAct('check')}>过牌</button>
        ) : (
          <button className="btn-call" onClick={() => onAct('call')}>
            跟注 {Math.min(toCall, me.stack)}
          </button>
        )}
        <button className="btn-allin" onClick={() => onAct('allin')}>All-in</button>
      </div>

      {/* 加注行（可选） */}
      {canRaise && (
        <div className="action-raise">
          <div className="raise-group">
            <input
              type="range"
              min={minRaiseTo}
              max={maxRaiseTo}
              value={raiseTo}
              onChange={e => setRaiseTo(+e.target.value)}
            />
            <div className="raise-quick">
              <button type="button" onClick={() => setRaiseTo(minRaiseTo)}>最小</button>
              <button type="button" onClick={() => setRaiseTo(Math.min(maxRaiseTo, currentBet * 2 + me.bet))}>2x</button>
              <button type="button" onClick={() => setRaiseTo(Math.min(maxRaiseTo, currentBet * 3 + me.bet))}>3x</button>
              <button type="button" onClick={() => setRaiseTo(maxRaiseTo)}>MAX</button>
            </div>
          </div>
          <button className="btn-raise" onClick={() => onAct('raise', raiseTo)}>
            加注至 {raiseTo}
          </button>
        </div>
      )}
    </div>
  );
}
