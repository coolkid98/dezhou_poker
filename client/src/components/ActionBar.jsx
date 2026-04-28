import React, { useState, useEffect } from 'react';
import { clampBet, poolRaiseTo } from './betSizing.js';

export default function ActionBar({ me, currentBet, minRaise, pot, myTurn, turnDeadline, onAct }) {
  const toCall = Math.max(0, currentBet - me.bet);
  const canCheck = toCall === 0;
  const minRaiseTo = Math.min(currentBet + minRaise, me.bet + me.stack);
  const maxRaiseTo = me.bet + me.stack;
  const [raiseTo, setRaiseTo] = useState(minRaiseTo);
  const [raiseInput, setRaiseInput] = useState(String(minRaiseTo));
  const [remain, setRemain] = useState(60);

  useEffect(() => {
    const next = clampBet(minRaiseTo, minRaiseTo, maxRaiseTo);
    setRaiseTo(next);
    setRaiseInput(String(next));
  }, [minRaiseTo, maxRaiseTo]);

  useEffect(() => {
    if (!myTurn || !turnDeadline) { setRemain(60); return; }
    const tick = () => setRemain(Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [myTurn, turnDeadline]);

  const canRaise = me.stack > toCall && maxRaiseTo > currentBet;
  const disabled = !myTurn || me.folded;
  const showRaiseControls = canRaise || disabled;
  const statusText = me.folded
    ? '你已弃牌'
    : myTurn
    ? '轮到你行动'
    : '等待其他玩家行动';
  const setRaiseAmount = (value) => {
    const next = clampBet(value, minRaiseTo, maxRaiseTo);
    setRaiseTo(next);
    setRaiseInput(String(next));
  };
  const setPoolFraction = (fraction) => {
    setRaiseAmount(poolRaiseTo({
      pot,
      fraction,
      meBet: me.bet,
      toCall,
      minRaiseTo,
      maxRaiseTo,
    }));
  };

  return (
    <div className={`action-bar${disabled ? ' action-disabled' : ''}`}>
      <div className="action-status">{statusText}</div>
      {/* 主操作行：计时 + 弃牌/过牌/跟注 + All-in */}
      <div className="action-main">
        <div className={`timer-pill${remain <= 10 ? ' urgent' : ''}`}>⏱ {remain}s</div>
        <button className="btn-fold" disabled={disabled} onClick={() => onAct('fold')}>弃牌</button>
        {canCheck ? (
          <button className="btn-check" disabled={disabled} onClick={() => onAct('check')}>过牌</button>
        ) : (
          <button className="btn-call" disabled={disabled} onClick={() => onAct('call')}>
            跟注 {Math.min(toCall, me.stack)}
          </button>
        )}
        <button className="btn-allin" disabled={disabled} onClick={() => onAct('allin')}>All-in</button>
      </div>

      {/* 加注行（可选） */}
      {showRaiseControls && (
        <div className="action-raise">
          <div className="raise-group">
            <div className="raise-input-row">
              <span>加注至</span>
              <input
                type="number"
                min={minRaiseTo}
                max={maxRaiseTo}
                value={raiseInput}
                disabled={disabled}
                onChange={e => {
                  setRaiseInput(e.target.value);
                  setRaiseTo(clampBet(e.target.value, minRaiseTo, maxRaiseTo));
                }}
                onBlur={() => setRaiseAmount(raiseInput)}
              />
            </div>
            <div className="raise-quick">
              <button type="button" disabled={disabled} onClick={() => setPoolFraction(1 / 4)}>1/4池</button>
              <button type="button" disabled={disabled} onClick={() => setPoolFraction(1 / 3)}>1/3池</button>
              <button type="button" disabled={disabled} onClick={() => setPoolFraction(1 / 2)}>1/2池</button>
              <button type="button" disabled={disabled} onClick={() => setRaiseAmount(minRaiseTo)}>最小</button>
              <button type="button" disabled={disabled} onClick={() => setRaiseAmount(maxRaiseTo)}>MAX</button>
            </div>
          </div>
          <button className="btn-raise" disabled={disabled} onClick={() => onAct('raise', raiseTo)}>
            加注至 {raiseTo}
          </button>
        </div>
      )}
    </div>
  );
}
