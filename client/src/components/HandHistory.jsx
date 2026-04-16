import React, { useState } from 'react';

const ACTION_TEXT = {
  fold: '弃牌', check: '过牌', call: '跟注',
  raise: '加注', allin: 'All-in', blind: '盲注',
};

function ReplayModal({ item, onClose }) {
  // 按阶段拆分 actions
  const phases = [];
  let cur = { name: 'PREFLOP', board: [], actions: [] };
  for (const a of (item.actions || [])) {
    if (a.type === 'phase') {
      phases.push(cur);
      cur = { name: a.phase, board: a.board || [], actions: [] };
    } else {
      cur.actions.push(a);
    }
  }
  phases.push(cur);

  const names = item.playerNames || {};
  const getName = (id) => names[id] || id?.slice(0, 6) || '?';

  const renderAction = (a, i) => {
    if (a.type === 'blind') {
      return (
        <div key={i} className="replay-action blind">
          {getName(a.playerId)} 盲注 {a.amount}
        </div>
      );
    }
    const label = ACTION_TEXT[a.type] || a.type;
    const amt = a.amount > 0 ? ` ${a.amount}` : '';
    const cls = a.type === 'fold' ? 'fold'
      : a.type === 'allin' ? 'allin'
      : a.type === 'raise' ? 'raise'
      : 'normal';
    return (
      <div key={i} className={`replay-action ${cls}`}>
        {getName(a.playerId)} {label}{amt}
      </div>
    );
  };

  const boardArr = Array.isArray(item.board)
    ? item.board
    : (item.board?.split(' ') || []);

  return (
    <div className="replay-backdrop" onClick={onClose}>
      <div className="replay-modal" onClick={e => e.stopPropagation()}>
        <div className="replay-header">
          <span>手#{item.handNo || item.hand_no} 回放</span>
          <button className="history-close" onClick={onClose}>✕</button>
        </div>

        {/* 最终公共牌 */}
        <div className="replay-board-row">
          <span className="replay-section-title">公共牌</span>
          <span className="replay-cards">{boardArr.join(' ') || '—'}</span>
          <span className="replay-pot-total">底池 {item.pot}</span>
        </div>

        {/* 摊牌手牌 */}
        {item.showdownHoles?.length > 0 && (
          <div className="replay-showdown">
            <span className="replay-section-title">摊牌</span>
            {item.showdownHoles.map((h, i) => (
              <div key={i} className="replay-player-hand">
                <span className="replay-player-name">{h.nickname}</span>
                <span className="replay-cards">{h.hole?.join(' ')}</span>
                {h.handName && <span className="replay-handname">{h.handName}</span>}
              </div>
            ))}
          </div>
        )}

        {/* 获胜者 */}
        <div className="replay-winners">
          {item.winners.map((w, i) => (
            <div key={i} className="replay-winner-line">
              🏆 {w.nickname} +{w.amount}{w.handName ? ` (${w.handName})` : ''}
            </div>
          ))}
        </div>

        {/* 行动记录（按阶段） */}
        {item.actions?.length > 0 && (
          <div className="replay-phases">
            <span className="replay-section-title">行动记录</span>
            {phases.filter(ph => ph.actions.length > 0).map((ph, pi) => (
              <div key={pi} className="replay-phase">
                <div className="replay-phase-name">
                  {ph.name}
                  {ph.board?.length > 0 && (
                    <span className="replay-phase-board"> [{ph.board.join(' ')}]</span>
                  )}
                </div>
                {ph.actions.map(renderAction)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HandHistory({ history }) {
  const [open, setOpen] = useState(false);
  const [replayItem, setReplayItem] = useState(null);

  return (
    <>
      <div className={`history ${open ? 'open' : ''}`}>
        <button className="history-toggle" onClick={() => setOpen(!open)}>
          {open ? '→' : '←'} 历史 ({history.length})
        </button>
        {open && (
          <>
            <div className="history-backdrop" onClick={() => setOpen(false)} />
            <div className="history-list">
              <div className="history-header">
                <span>手牌历史</span>
                <button className="history-close" onClick={() => setOpen(false)}>✕</button>
              </div>
              {history.length === 0 && <div className="empty">暂无历史</div>}
              {history.map((h, i) => (
                <div key={i} className="history-item">
                  <div className="h-head">
                    手#{h.handNo || h.hand_no} · 底池 {h.pot}
                    {h.actions && (
                      <button
                        className="h-replay-btn"
                        onClick={() => setReplayItem(h)}
                      >
                        详情
                      </button>
                    )}
                  </div>
                  <div className="h-board">
                    {Array.isArray(h.board) ? h.board.join(' ') : h.board}
                  </div>
                  {h.winners.map((w, j) => (
                    <div key={j} className="h-winner">
                      🏆 {w.nickname}: {w.amount} ({w.handName})
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {replayItem && (
        <ReplayModal item={replayItem} onClose={() => setReplayItem(null)} />
      )}
    </>
  );
}
