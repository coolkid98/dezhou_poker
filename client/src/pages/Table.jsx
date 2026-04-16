import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSocket } from '../socket.js';
import Card from '../components/Card.jsx';
import Seat from '../components/Seat.jsx';
import ActionBar from '../components/ActionBar.jsx';
import HandHistory from '../components/HandHistory.jsx';
import ChipFlight from '../components/ChipFlight.jsx';
import { seatPosFor } from '../layout.js';
import { sfx } from '../sfx.js';
import { tts } from '../tts.js';
import { music } from '../music.js';

// 行动气泡的中文文案和样式 class
const ACTION_LABELS = {
  fold: { text: '弃牌', cls: 'fold' },
  check: { text: '过牌', cls: 'check' },
  call: { text: '跟注', cls: 'call' },
  raise: { text: '加注', cls: 'raise' },
  allin: { text: 'All-In', cls: 'allin' },
  blind: { text: '盲注', cls: 'blind' },
};

function winRateColor(rate) {
  if (rate >= 65) return '#3fb950';
  if (rate >= 45) return '#ffd33d';
  return '#f85149';
}

function actionCls(action = '') {
  if (!action) return '';
  if (action.includes('弃牌')) return 'fold';
  if (action.includes('All-in') || action.includes('all-in') || action.includes('allin')) return 'allin';
  if (action.includes('加注')) return 'raise';
  if (action.includes('跟注')) return 'call';
  return 'check'; // 过牌 / 其他
}


export default function Table({ user, musicOn, setMusicOn }) {
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

  // AI 分析状态：{ status: 'idle'|'loading'|'done'|'error', winRate, equity, suggestion, error }
  const [aiData, setAiData] = useState({ status: 'idle' });

  const socketRef = useRef(null);
  const stateRef = useRef(null);
  stateRef.current = state;

  // 记录上一次手牌 key（如 'As-Kh'），用于检测新一手的手牌
  const prevHoleKeyRef = useRef(null);
  // 记录当前手牌原始值，供 state 事件里检测公共牌变化时使用
  const holeRef = useRef(null);
  // 记录当前 AI 状态，供 state 事件里读取（避免闭包旧值问题）
  const aiDataRef = useRef({ status: 'idle' });
  const updateAiData = useCallback((data) => {
    aiDataRef.current = data;
    setAiData(data);
  }, []);

  // 进入牌桌自动开启背景音乐，离开时停止
  useEffect(() => {
    let started = false;
    const tryStart = async () => {
      if (music.isPlaying()) return;
      try {
        await music.start();
        started = true;
        setMusicOn?.(true);
      } catch {}
    };
    tryStart();
    // 若自动播放被浏览器拦截，等第一次用户交互后再试
    const onInteract = () => {
      if (!music.isPlaying()) tryStart();
      document.removeEventListener('pointerdown', onInteract);
    };
    document.addEventListener('pointerdown', onInteract);
    return () => {
      document.removeEventListener('pointerdown', onInteract);
      music.stop();
      setMusicOn?.(false);
    };
  }, []);

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
      // 新公共牌发出时响一声，等行动音效结束后再播，避免互相覆盖
      if (st.board.length > prevBoardLen) {
        setTimeout(() => sfx.cardFlip(), sfx.safeCardFlipDelay());
      }
      // 翻/转/河牌来了，且玩家手上有牌 → 重新请求 AI 分析
      if (st.board.length > prevBoardLen && holeRef.current?.length === 2) {
        updateAiData({ status: 'loading' });
        s.emit('ai:suggest');
      }
      // 新轮到自己行动（安全兜底）：AI 未分析则立即触发
      const wasMyTurn = stateRef.current?.turnPlayerId === user.id;
      if (st.turnPlayerId === user.id && !wasMyTurn && holeRef.current?.length === 2) {
        const cur = aiDataRef.current;
        if (cur.status === 'idle' || cur.status === 'error') {
          updateAiData({ status: 'loading' });
          s.emit('ai:suggest');
        }
      }
    });

    s.on('private:cards', ({ hole: newHole }) => {
      setHole(newHole);
      holeRef.current = newHole;

      if (newHole && newHole.length === 2) {
        const key = newHole.join('-');
        // 只有手牌变化（新的一手）才触发 AI 分析
        if (key !== prevHoleKeyRef.current) {
          prevHoleKeyRef.current = key;
          updateAiData({ status: 'loading' });
          s.emit('ai:suggest');
        }
      } else {
        // 手局结束，手牌清空 → 重置 key 和 AI 面板
        prevHoleKeyRef.current = null;
        updateAiData({ status: 'idle' });
      }
    });

    s.on('ai:suggestion', (data) => {
      if (data.error) {
        updateAiData({ status: 'error', error: data.error });
        return;
      }
      updateAiData({ status: 'done', winRate: data.winRate, action: data.action, reason: data.reason });
    });

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
        // 语音播报动作
        tts.play(ev.kind);
      } else if (ev.type === 'hand:start') {
        setHandEnd(null);
        setActionPopups({});
        setChipFlights([]);
        setRevealIdx(-1);
        // 新手开始：清空上轮 AI 结果，等待手牌下发后重新分析
        updateAiData({ status: 'idle' });
      }
    });

    s.on('hand:end', (summary) => {
      setHandEnd(summary);
      setHistory(h => [{ ...summary, endedAt: Date.now() }, ...h].slice(0, 20));

      // 获胜播报：提前请求音频，等摊牌动画完成后播放
      if (summary.winners?.length > 0) {
        let text;
        if (summary.winners.length === 1) {
          const w = summary.winners[0];
          text = `${w.nickname}获胜，赢得${w.amount}筹码`;
        } else {
          const names = summary.winners.map(w => w.nickname).join('和');
          text = `${names}平分底池，各得${summary.winners[0].amount}筹码`;
        }
        const n = summary.showdownHoles?.length || 0;
        const ttsDelay = n > 1 ? n * 900 + 800 : 600;
        tts.speakAfter(text, ttsDelay);
      }

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
        // 全部揭示完后播赢家音，结算浮层保留（等房主开下一手）
        const revealDone = n * 900 + 200;
        setTimeout(() => sfx.win(), revealDone);
      } else {
        // 弃牌直接赢：快速显示，保留浮层
        setRevealIdx(-1);
        sfx.win();
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
      s.off('game:event'); s.off('ai:suggestion');
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

  // 是否显示 AI 面板：非等待阶段 + 玩家有手牌 + AI 已触发
  const showAiPanel = !inWaiting && hole && hole.length === 2 &&
    (aiData.status === 'loading' || aiData.status === 'done' || aiData.status === 'error');

  return (
    <div className="table-page">
      <div className="table-top-bar">
        <button onClick={() => navigate('/lobby')}>← 返回</button>
        <div className="table-info">
          <span className="table-info-full">
            房间 <code>{roomId}</code> · 盲注 {state.sb}/{state.bb} ·
            <span className="phase-tag">{state.phase}</span> · 手#{state.handNo}
          </span>
          <span className="table-info-compact">
            <code>{roomId}</code> · <span className="phase-tag">{state.phase}</span> · 手#{state.handNo}
          </span>
        </div>
        <button
          className="icon-btn"
          onClick={async () => {
            if (music.isPlaying()) { music.stop(); setMusicOn?.(false); }
            else { await music.start(); setMusicOn?.(true); }
          }}
          title={musicOn ? '关闭音乐' : '开启音乐'}
        >
          {musicOn ? '🔊' : '🔇'}
        </button>
      </div>

      <div className={`felt ${ordered.length >= 7 ? 'big-table' : ''}`}>
        <div className="board-area">
          {state.sidePots ? (
            <div className="pot-breakdown">
              {state.sidePots.map((p, i) => (
                <span key={i} className="pot-chip">
                  <span className="pot-chip-label">{p.label}</span>
                  <span className="pot-chip-amount">{p.amount}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="pot-area">
              <img src="/pot-chips.png" className="pot-chips-img" alt="" />
              <div className="pot">底池 <span className="pot-num">{state.pot}</span></div>
            </div>
          )}
          <div className="board">
            {[0, 1, 2, 3, 4].map(i => {
              const code = state.board[i];
              const revealed = i < boardRevealCount;
              if (!code) return <Card key={i} empty />;
              return (
                <Card key={i + code} code={code} revealing={revealed} delay={0} />
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
        {/* AI 分析面板：拿到手牌后自动显示，贯穿整手牌 */}
        {showAiPanel && (
          <div className="ai-bar">
            {aiData.status === 'error' ? (
              <div className="ai-card ai-card-error">⚠ {aiData.error}</div>
            ) : (
              <div className="ai-cards">
                {/* 胜率卡 */}
                <div className="ai-card ai-card-winrate">
                  <div className="ai-card-label">胜率</div>
                  {aiData.status !== 'done' ? (
                    <div className="ai-card-thinking"><span className="ai-spinner" /></div>
                  ) : (
                    <div className="ai-card-big" style={{ color: winRateColor(aiData.winRate) }}>
                      {aiData.winRate != null ? `${aiData.winRate}%` : '—'}
                    </div>
                  )}
                </div>

                {/* 建议行动卡 */}
                <div className={`ai-card ai-card-action ${aiData.status === 'done' && aiData.action ? `ai-action-${actionCls(aiData.action)}` : 'ai-card-loading'}`}>
                  <div className="ai-card-label">建议行动</div>
                  {aiData.status !== 'done' ? (
                    <div className="ai-card-thinking"><span className="ai-spinner" /> 分析中</div>
                  ) : (
                    <div className="ai-card-action-text">{aiData.action || '—'}</div>
                  )}
                </div>

                {/* 原因卡 */}
                <div className="ai-card ai-card-reason">
                  <div className="ai-card-label">原因</div>
                  {aiData.status !== 'done' ? (
                    <div className="ai-card-thinking"><span className="ai-spinner" /> 分析中</div>
                  ) : (
                    <div className="ai-card-reason-text">{aiData.reason || '—'}</div>
                  )}
                  <span
                    className="ai-refresh-btn"
                    onClick={() => { updateAiData({ status: 'loading' }); socketRef.current.emit('ai:suggest'); }}
                    title="重新分析"
                  >↻</span>
                </div>
              </div>
            )}
          </div>
        )}

        {inWaiting && me && (
          <div className="lobby-controls">
            {seatedCount < 2 && (
              <div className="waiting-msg">⏳ 等待其他玩家加入房间...</div>
            )}
            {seatedCount >= 2 && (
              <>
                {/* 首局需要手动准备；续局 ready 状态保留，不需要重复点；重新入桌后 ready=false，也需要重新准备 */}
                {(state.handNo === 0 || !me.ready) && (
                  <button
                    className={`ready-btn ${me.ready ? 'ready-on' : ''}`}
                    onClick={toggleReady}
                  >
                    {me.ready ? '✅ 已准备（点击取消）' : '点击准备'}
                  </button>
                )}
                {isHost && (
                  <button
                    className={`start-btn${state.handNo > 0 && canStart ? ' next-hand' : ''}`}
                    disabled={!canStart}
                    onClick={startGame}
                    title={canStart ? (state.handNo > 0 ? '开始下一手' : '开始游戏') : '等待所有玩家准备'}
                  >
                    {state.handNo > 0 ? '▶ 开始下一手' : `🎬 开始游戏 (${readyCount}/${seatedCount})`}
                  </button>
                )}
                {!isHost && (
                  <div className="waiting-msg small">
                    {state.handNo > 0
                      ? '⌛ 等待房主开始下一手...'
                      : othersReady
                        ? '⌛ 等待房主开始游戏'
                        : `⌛ 等待其他玩家准备 (${readyCount}/${seatedCount})`}
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
