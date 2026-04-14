import React, { useState } from 'react';

export default function HandHistory({ history }) {
  const [open, setOpen] = useState(false);
  return (
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
                <div className="h-head">手#{h.handNo || h.hand_no} · 底池 {h.pot}</div>
                <div className="h-board">{Array.isArray(h.board) ? h.board.join(' ') : h.board}</div>
                {h.winners.map((w, j) => (
                  <div key={j} className="h-winner">🏆 {w.nickname}: {w.amount} ({w.handName})</div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
