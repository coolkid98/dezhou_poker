import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSocket } from '../socket.js';
import Card from '../components/Card.jsx';
import Seat from '../components/Seat.jsx';
import ActionBar from '../components/ActionBar.jsx';
import HandHistory from '../components/HandHistory.jsx';
import ChipFlight from '../components/ChipFlight.jsx';
import { seatPosFor } from '../layout.js';
import { sfx } from '../sfx.js';

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
  // 飞行中的筹码 [{ id, playerId, amount }]
  const [chipFlights, setChipFlights] = useState([]);
  // 每张公共牌是否已入场（用于翻牌/转牌/河牌依次亮起）
  const [boardRevealCount, setBoardRevealCount] = useState(0);
  // 摊牌逐个揭示的进度：-1 未开始，>=0 已揭示到此索引
  const [revealIdx, setRevealIdx] = useState(-1);
  const socketRef = useRef(null);
  const stateRef = useRef(null);
  stateRef.current = state;

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;

    const join = () => s.emit('room:join', { roomId });
    s.on('connect', join);
    if (s.connected) join();

    s.on('state', (st) => {
      const prevBoardLen = stateRef.current?.board?.length || 0;
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
      // 新公共牌发出时播音效
      if (st.board.length > prevBoardLen) {
        sfx.deal();
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

        // 下注类动作：生成一枚筹码动画 + 音效
        if (ev.amount > 0 && ['call', 'raise', 'allin', 'blind'].includes(ev.kind)) {
          const flightId = `${Date.now()}_${Math.random()}`;
          setChipFlights(arr => [
            ...arr,
            { id: flightId, playerId: ev.playerId, amount: ev.amount },
          ]);
        }
        // 音效分发
        if (ev.kind === 'fold') sfx.fold();
        else if (ev.kind === 'check') sfx.check();
        else if (ev.kind === 'call' || ev.kind === 'blind') sfx.chip();
        else if (ev.kind === 'raise') sfx.raise();
        else if (ev.kind === 'allin') sfx.allin();
      } else if (ev.type === 'hand:start') {
        setHandEnd(null);
        setActionPopups({});
        setChipFlights([]);
        setRevealIdx(-1);
      }
    });

    s.on('hand:end', (summary) => {
      setHandEnd(summary);
      setHistory(h => [{ ...summary, endedAt: Date.now() }, ...h].slice(0, 20));

      const n = summary.showdownHoles?.length || 0;
      if (n > 1) {
        // 逐个揭示：每张牌翻开间隔 900ms，配音效
        setRevealIdx(0);
        sfx.deal();
        for (let i = 1; i < n; i++) {
          setTimeout(() => {
            setRevealIdx(i);
            sfx.deal();
          }, i * 900);
        }
        // 全部揭示完后再播赢家音 + 保留显示
        const revealDone = n * 900 + 200;
        setTimeout(() => sfx.win(), revealDone);
        setTimeout(() => {
          setHandEnd(null);
          setRevealIdx(-1);
        }, revealDone + 2500);
      } else {
        // 弃牌直接赢：快速显示
        setRevealIdx(-1);
        sfx.win();
        setTimeout(() => setHandEnd(null), 3200);
      }
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
  const toggleReady = () => {
    socketRef.current.emit('game:ready', { ready: !me?.ready });
  };
  const startGame = () => {
    socketRef.current.emit('game:start');
  };

  const seatedCount = state.players.length;
  const isHost = state.hostId === user.id;
  const othersReady = state.players
    .filter(p => p.id !== state.hostId && p.stack > 0)
    .every(p => p.ready);
  const readyCount = state.players.filter(p => p.ready && p.stack > 0).length;
  const canStart = isHost && seatedCount >= 2 && othersReady && readyCount >= 1;

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

      <div className={`felt ${ordered.length >= 7 ? 'big-table' : ''}`}>
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
          {ordered.map((p, i) => {
            const shIdx = handEnd?.showdownHoles?.findIndex(h => h.playerId === p.id) ?? -1;
            const shRevealed = shIdx >= 0 && shIdx <= revealIdx;
            const shInfo = shRevealed ? handEnd.showdownHoles[shIdx] : null;
            return (
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
                isHost={state.hostId === p.id}
                hole={p.id === user.id ? hole : null}
                showdownHole={shInfo?.hole}
                showdownHandName={shInfo?.handName}
                isWinner={handEnd?.winners?.some(w => w.playerId === p.id)}
                actionPopup={actionPopups[p.id]}
              />
            );
          })}
        </div>

        {chipFlights.map(f => {
          const idx = ordered.findIndex(p => p.id === f.playerId);
          if (idx < 0) return null;
          const [x, y] = seatPosFor(ordered.length, idx);
          return (
            <ChipFlight
              key={f.id}
              fromX={x}
              fromY={y}
              amount={f.amount}
              onDone={() => setChipFlights(arr => arr.filter(c => c.id !== f.id))}
            />
          );
        })}

        {handEnd && (() => {
          const n = handEnd.showdownHoles?.length || 0;
          // 多人摊牌时，等全部揭示完再显示赢家浮层；否则立刻显示
          const allRevealed = n <= 1 || revealIdx >= n - 1;
          if (!allRevealed) return null;
          return (
            <div className="hand-end">
              <h3>本手结算</h3>
              {handEnd.winners.map((w, i) => (
                <div key={i} className="winner-line">
                  🏆 <b>{w.nickname}</b> 赢得 <span className="win-amount">{w.amount}</span>
                  <span className="hand-name">({w.handName})</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <div className="bottom-bar">
        {inWaiting && me && (
          <div className="lobby-controls">
            {seatedCount < 2 && (
              <div className="waiting-msg">⏳ 等待其他玩家加入房间...</div>
            )}
            {seatedCount >= 2 && (
              <>
                <button
                  className={`ready-btn ${me.ready ? 'ready-on' : ''}`}
                  onClick={toggleReady}
                >
                  {me.ready ? '✅ 已准备（点击取消）' : '点击准备'}
                </button>
                {isHost && (
                  <button
                    className="start-btn"
                    disabled={!canStart}
                    onClick={startGame}
                    title={canStart ? '开始游戏' : '等待所有玩家准备'}
                  >
                    🎬 开始游戏 ({readyCount}/{seatedCount})
                  </button>
                )}
                {!isHost && (
                  <div className="waiting-msg small">
                    {othersReady ? '⌛ 等待房主开始游戏' : `⌛ 等待其他玩家准备 (${readyCount}/${seatedCount})`}
                  </div>
                )}
              </>
            )}
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
