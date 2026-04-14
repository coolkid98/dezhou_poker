import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSocket } from '../socket.js';
import Card from '../components/Card.jsx';
import Seat from '../components/Seat.jsx';
import ActionBar from '../components/ActionBar.jsx';
import HandHistory from '../components/HandHistory.jsx';

// 行动气泡的中文文案和样式 class
const ACTION_LABELS = {
  fold: { text: '弃牌', cls: 'fold' },
  check: { text: '过牌', cls: 'check' },
  call: { text: '跟注', cls: 'call' },
  raise: { text: '加注', cls: 'raise' },
  allin: { text: 'All-In', cls: 'allin' },
  blind: { text: '盲注', cls: 'blind' },
};

export default function Table({ user }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [hole, setHole] = useState(null);
  const [history, setHistory] = useState([]);
  const [handEnd, setHandEnd] = useState(null);
  const [toast, setToast] = useState('');
  // playerId → { action, amount, key }，驱动气泡动画
  const [actionPopups, setActionPopups] = useState({});
  // 每张公共牌是否已入场（用于翻牌/转牌/河牌依次亮起）
  const [boardRevealCount, setBoardRevealCount] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;

    const join = () => s.emit('room:join', { roomId });
    s.on('connect', join);
    if (s.connected) join();

    s.on('state', (st) => {
      setState(st);
      // 公共牌数量变化时触发逐张亮起
      setBoardRevealCount(prev => {
        if (st.board.length < prev) return st.board.length;
        return prev;
      });
      if (st.board.length > 0) {
        setTimeout(() => setBoardRevealCount(st.board.length), 50);
      } else {
        setBoardRevealCount(0);
      }
    });
    s.on('private:cards', ({ hole }) => setHole(hole));

    s.on('game:event', (ev) => {
      if (ev.type === 'action') {
        const label = ACTION_LABELS[ev.kind];
        if (!label) return;
        const key = Date.now() + Math.random();
        setActionPopups(p => ({
          ...p,
          [ev.playerId]: { ...label, amount: ev.amount, key },
        }));
        setTimeout(() => {
          setActionPopups(p => {
            const cur = p[ev.playerId];
            if (!cur || cur.key !== key) return p;
            const { [ev.playerId]: _, ...rest } = p;
            return rest;
          });
        }, 1800);
      } else if (ev.type === 'hand:start') {
        setHandEnd(null);
        setActionPopups({});
      }
    });

    s.on('hand:end', (summary) => {
      setHandEnd(summary);
      setHistory(h => [{ ...summary, endedAt: Date.now() }, ...h].slice(0, 20));
      setTimeout(() => setHandEnd(null), 5000);
    });
    s.on('hand:history', (h) => setHistory(h));
    s.on('error', ({ message }) => {
      setToast(message);
      setTimeout(() => setToast(''), 2500);
    });

    return () => {
      s.emit('room:leave');
      s.off('state'); s.off('private:cards'); s.off('hand:end');
      s.off('hand:history'); s.off('error'); s.off('connect');
      s.off('game:event');
    };
  }, [roomId]);

  if (!state) return <div className="center">连接房间 {roomId}...</div>;

  const me = state.players.find(p => p.id === user.id);
  const myTurn = state.turnPlayerId === user.id;
  const inWaiting = state.phase === 'WAITING';

  const act = (type, amount) => {
    socketRef.current.emit('game:action', { type, amount });
  };

  // 计算当前牌桌活跃玩家数（有筹码 + 未完全掉线）
  const activeCount = state.players.filter(p => p.stack > 0 && !p.sittingOut).length;
  const seatedCount = state.players.length;

  const myIdx = state.players.findIndex(p => p.id === user.id);
  const ordered = myIdx >= 0
    ? [...state.players.slice(myIdx), ...state.players.slice(0, myIdx)]
    : state.players;

  return (
    <div className="table-page">
      <div className="table-top-bar">
        <button onClick={() => navigate('/lobby')}>← 返回大厅</button>
        <div>
          房间 <code>{roomId}</code> · 盲注 {state.sb}/{state.bb} ·
          <span className="phase-tag">{state.phase}</span> · 手#{state.handNo}
        </div>
      </div>

      <div className="felt">
        <div className="board-area">
          <div className="pot">底池 <span className="pot-num">{state.pot}</span></div>
          <div className="board">
            {[0, 1, 2, 3, 4].map(i => {
              const code = state.board[i];
              const revealed = i < boardRevealCount;
              if (!code) return <Card key={i} empty />;
              return (
                <Card key={i + code} code={code} revealing={revealed} delay={i * 120} />
              );
            })}
          </div>
        </div>

        <div className="seats">
          {ordered.map((p, i) => (
            <Seat
              key={p.id}
              player={p}
              position={i}
              total={ordered.length}
              isSelf={p.id === user.id}
              isTurn={state.turnPlayerId === p.id}
              turnDeadline={state.turnDeadline}
              isButton={state.buttonPlayerId === p.id}
              isSB={state.sbPlayerId === p.id}
              isBB={state.bbPlayerId === p.id}
              hole={p.id === user.id ? hole : null}
              showdownHole={handEnd?.showdownHoles?.find(h => h.playerId === p.id)?.hole}
              isWinner={handEnd?.winners?.some(w => w.playerId === p.id)}
              actionPopup={actionPopups[p.id]}
            />
          ))}
        </div>

        {handEnd && (
          <div className="hand-end">
            <h3>本手结算</h3>
            {handEnd.winners.map((w, i) => (
              <div key={i} className="winner-line">
                🏆 <b>{w.nickname}</b> 赢得 <span className="win-amount">{w.amount}</span>
                <span className="hand-name">({w.handName})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bottom-bar">
        {inWaiting && me && (
          <div className="waiting-msg">
            {seatedCount < 2
              ? '⏳ 等待其他玩家加入房间...'
              : state.handNo === 0
              ? '⏳ 即将开始第一手...'
              : '🎬 下一手即将开始...'}
          </div>
        )}
        {!inWaiting && me && me.sittingOut && (
          <div className="waiting-msg">👁 观战中，下一手自动参与</div>
        )}
        {!inWaiting && me && !me.sittingOut && (
          <ActionBar
            me={me}
            currentBet={state.currentBet}
            minRaise={state.minRaise}
            myTurn={myTurn}
            turnDeadline={state.turnDeadline}
            onAct={act}
          />
        )}
      </div>

      <HandHistory history={history} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
