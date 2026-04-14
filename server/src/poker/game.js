import { newDeck, shuffle, cardToStr } from './deck.js';
import { evaluate7, compareRanks } from './evaluator.js';
import { calculatePots } from './sidePot.js';

export const PHASES = ['WAITING', 'PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];

export class Game {
  constructor({
    roomId, smallBlind, bigBlind, onUpdate, onEnd, onEvent,
    turnTimeoutMs = 30_000,
    autoStartMs = 5500,
  }) {
    this.roomId = roomId;
    this.sb = smallBlind;
    this.bb = bigBlind;
    this.onUpdate = onUpdate || (() => {});
    this.onEnd = onEnd || (() => {});
    this.onEvent = onEvent || (() => {});
    this.turnTimeoutMs = turnTimeoutMs;
    this.autoStartMs = autoStartMs;
    this.players = [];
    this.buttonIdx = -1;
    this.sbIdx = -1;
    this.bbIdx = -1;
    this.phase = 'WAITING';
    this.board = [];
    this.deck = [];
    this.currentBet = 0;
    this.minRaise = 0;
    this.turnIdx = -1;
    this.turnDeadline = 0;
    this.turnTimer = null;
    this.autoStartTimer = null;
    this.lastAggressorIdx = -1;
    this.handNo = 0;
    this.actions = [];
  }

  destroy() {
    this.clearTurnTimer();
    if (this.autoStartTimer) { clearTimeout(this.autoStartTimer); this.autoStartTimer = null; }
  }

  addPlayer(p) {
    if (this.players.find(x => x.id === p.id)) return;
    const midHand = this.phase !== 'WAITING';
    this.players.push({
      ...p,
      hole: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      acted: false,
      hasCards: false,
      ready: false,
      // 手局进行中加入 → 当前手坐在场外观战，下一手自动参与
      sittingOut: midHand,
    });
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1) return;
    if (this.phase !== 'WAITING') {
      const p = this.players[idx];
      p.folded = true;
      p.sittingOut = true;
      if (this.turnIdx === idx) {
        this.clearTurnTimer();
        this.advanceTurn();
      } else {
        this.checkRoundEnd();
      }
    } else {
      this.players.splice(idx, 1);
    }
  }

  markReady(playerId) {
    // 仅设置 ready 标记，不自动开始 —— 由 rooms/host 显式触发 tryStart
    const p = this.players.find(x => x.id === playerId);
    if (p) p.ready = true;
  }

  setReady(playerId, ready = true) {
    const p = this.players.find(x => x.id === playerId);
    if (p) p.ready = !!ready;
  }

  tryStart() {
    if (this.phase !== 'WAITING') return;
    // 清理自动计时器（如果是被自动调用的）
    if (this.autoStartTimer) { clearTimeout(this.autoStartTimer); this.autoStartTimer = null; }
    const eligible = this.players.filter(p => p.ready && p.stack > 0);
    if (eligible.length < 2) return;
    this.startHand();
  }

  scheduleAutoStart() {
    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
    if (this.autoStartMs <= 0) return;
    this.autoStartTimer = setTimeout(() => {
      this.autoStartTimer = null;
      this.tryStart();
    }, this.autoStartMs);
    if (this.autoStartTimer.unref) this.autoStartTimer.unref();
  }

  startHand() {
    this.handNo++;
    this.deck = shuffle(newDeck());
    this.board = [];
    this.actions = [];

    for (const p of this.players) {
      p.hole = [];
      p.bet = 0;
      p.totalBet = 0;
      p.allIn = false;
      p.acted = false;
      p.hasCards = false;
      // 每手重新评估参与资格：必须已 ready + 有筹码
      const eligible = p.ready && p.stack > 0;
      p.folded = !eligible;
      p.sittingOut = !eligible;
    }
    const active = this.players.filter(p => !p.folded);
    if (active.length < 2) {
      this.phase = 'WAITING';
      this.onUpdate();
      return;
    }

    // 轮转 button 到下一个未弃牌玩家
    this.buttonIdx = this.nextActiveIdx(this.buttonIdx);

    // Heads-up 特殊：button 即 SB，且 preflop 先行动
    // 3+ 人：button → SB → BB → UTG(首行动)
    if (active.length === 2) {
      this.sbIdx = this.buttonIdx;
      this.bbIdx = this.nextActiveIdx(this.buttonIdx);
    } else {
      this.sbIdx = this.nextActiveIdx(this.buttonIdx);
      this.bbIdx = this.nextActiveIdx(this.sbIdx);
    }

    this.postBlind(this.sbIdx, this.sb);
    this.postBlind(this.bbIdx, this.bb);
    this.currentBet = this.bb;
    this.minRaise = this.bb;

    for (const p of active) {
      p.hole = [this.deck.pop(), this.deck.pop()];
      p.hasCards = true;
    }

    this.phase = 'PREFLOP';
    // Preflop 首行动：2 人=button(SB)，3+ 人=BB 之后
    this.turnIdx = active.length === 2 ? this.sbIdx : this.nextActiveIdx(this.bbIdx);
    this.lastAggressorIdx = this.bbIdx;

    this.logAction({ type: 'blind', playerId: this.players[this.sbIdx].id, amount: this.sb });
    this.logAction({ type: 'blind', playerId: this.players[this.bbIdx].id, amount: this.bb });

    this.onEvent({
      type: 'hand:start',
      handNo: this.handNo,
      sbPlayerId: this.players[this.sbIdx].id,
      bbPlayerId: this.players[this.bbIdx].id,
      buttonPlayerId: this.players[this.buttonIdx].id,
    });
    this.onEvent({ type: 'action', playerId: this.players[this.sbIdx].id, kind: 'blind', amount: this.sb });
    this.onEvent({ type: 'action', playerId: this.players[this.bbIdx].id, kind: 'blind', amount: this.bb });

    this.startTurn();
    this.onUpdate();
  }

  postBlind(idx, amount) {
    const p = this.players[idx];
    const pay = Math.min(p.stack, amount);
    p.stack -= pay;
    p.bet += pay;
    p.totalBet += pay;
    if (p.stack === 0) p.allIn = true;
  }

  nextActiveIdx(startIdx) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (startIdx + i) % n;
      const p = this.players[idx];
      if (p && !p.folded && !p.sittingOut) return idx;
    }
    return -1;
  }

  nextToAct(startIdx) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (startIdx + i) % n;
      const p = this.players[idx];
      if (p && !p.folded && !p.allIn && !p.sittingOut) return idx;
    }
    return -1;
  }

  startTurn() {
    this.clearTurnTimer();
    if (this.turnIdx < 0) return;
    if (this.turnTimeoutMs <= 0) { this.turnDeadline = 0; return; }
    this.turnDeadline = Date.now() + this.turnTimeoutMs;
    const turnPlayerId = this.players[this.turnIdx]?.id;
    this.turnTimer = setTimeout(() => {
      if (this.turnIdx < 0) return;
      const p = this.players[this.turnIdx];
      if (!p || p.id !== turnPlayerId) return;
      const auto = p.bet >= this.currentBet ? { type: 'check' } : { type: 'fold' };
      this.act(p.id, auto, true);
    }, this.turnTimeoutMs);
    if (this.turnTimer.unref) this.turnTimer.unref();
  }

  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.turnDeadline = 0;
  }

  act(playerId, action, isAuto = false) {
    if (this.phase === 'WAITING' || this.phase === 'SHOWDOWN') {
      return { error: '当前阶段不可行动' };
    }
    if (this.turnIdx < 0) return { error: '无当前行动人' };
    const p = this.players[this.turnIdx];
    if (p.id !== playerId) return { error: '不是你的回合' };

    const { type } = action;
    let eventKind = type;
    let eventAmount = 0;

    if (type === 'fold') {
      p.folded = true;
      p.acted = true;
      this.logAction({ type: 'fold', playerId });
    } else if (type === 'check') {
      if (p.bet < this.currentBet) return { error: '当前不能 check，需跟注或弃牌' };
      p.acted = true;
      this.logAction({ type: 'check', playerId });
    } else if (type === 'call') {
      const need = this.currentBet - p.bet;
      const pay = Math.min(need, p.stack);
      p.stack -= pay;
      p.bet += pay;
      p.totalBet += pay;
      if (p.stack === 0) p.allIn = true;
      p.acted = true;
      eventAmount = pay;
      this.logAction({ type: 'call', playerId, amount: pay });
    } else if (type === 'raise') {
      const to = Math.floor(action.amount || 0);
      const need = to - p.bet;
      if (need <= 0 || need > p.stack) return { error: '加注金额非法' };
      if (to < this.currentBet + this.minRaise && need < p.stack) {
        return { error: `加注至少到 ${this.currentBet + this.minRaise}` };
      }
      p.stack -= need;
      p.bet += need;
      p.totalBet += need;
      if (p.stack === 0) p.allIn = true;
      const raiseSize = to - this.currentBet;
      if (raiseSize >= this.minRaise) this.minRaise = raiseSize;
      this.currentBet = p.bet;
      for (const other of this.players) {
        if (other.id !== p.id && !other.folded && !other.allIn) other.acted = false;
      }
      p.acted = true;
      this.lastAggressorIdx = this.turnIdx;
      eventAmount = to;
      this.logAction({ type: 'raise', playerId, amount: to });
    } else if (type === 'allin') {
      const pay = p.stack;
      p.stack = 0;
      p.bet += pay;
      p.totalBet += pay;
      p.allIn = true;
      p.acted = true;
      if (p.bet > this.currentBet) {
        const raiseSize = p.bet - this.currentBet;
        if (raiseSize >= this.minRaise) {
          this.minRaise = raiseSize;
          for (const other of this.players) {
            if (other.id !== p.id && !other.folded && !other.allIn) other.acted = false;
          }
        }
        this.currentBet = p.bet;
        this.lastAggressorIdx = this.turnIdx;
      }
      eventAmount = pay;
      this.logAction({ type: 'allin', playerId, amount: pay });
    } else {
      return { error: '未知动作' };
    }

    this.clearTurnTimer();
    this.onEvent({
      type: 'action', playerId, kind: eventKind, amount: eventAmount, auto: isAuto,
    });

    this.advanceTurn();
    this.onUpdate();
    return { ok: true };
  }

  advanceTurn() {
    const alive = this.players.filter(p => !p.folded && !p.sittingOut);
    if (alive.length === 1) {
      this.goShowdown();
      return;
    }
    if (this.isRoundComplete()) {
      this.nextPhase();
    } else {
      const next = this.nextToAct(this.turnIdx);
      if (next === -1) {
        this.nextPhase();
      } else {
        this.turnIdx = next;
        this.startTurn();
      }
    }
  }

  isRoundComplete() {
    const inHand = this.players.filter(p => !p.folded && !p.sittingOut);
    if (inHand.length === 0) return true;
    if (inHand.every(p => p.allIn)) return true;
    const actionable = inHand.filter(p => !p.allIn);
    if (actionable.length === 0) return true;
    return actionable.every(p => p.acted && p.bet === this.currentBet);
  }

  checkRoundEnd() {
    if (this.phase === 'WAITING' || this.phase === 'SHOWDOWN') return;
    if (this.isRoundComplete()) this.nextPhase();
  }

  nextPhase() {
    for (const p of this.players) {
      p.bet = 0;
      p.acted = false;
    }
    this.currentBet = 0;
    this.minRaise = this.bb;

    if (this.phase === 'PREFLOP') {
      this.dealBoard(3);
      this.phase = 'FLOP';
    } else if (this.phase === 'FLOP') {
      this.dealBoard(1);
      this.phase = 'TURN';
    } else if (this.phase === 'TURN') {
      this.dealBoard(1);
      this.phase = 'RIVER';
    } else if (this.phase === 'RIVER') {
      this.goShowdown();
      return;
    }

    this.onEvent({ type: 'board', phase: this.phase, board: this.board.map(cardToStr) });

    const inHand = this.players.filter(p => !p.folded && !p.allIn);
    if (inHand.length <= 1) {
      // 全 all-in：自动发完剩余公共牌并摊牌
      while (this.phase !== 'RIVER') {
        if (this.phase === 'FLOP') { this.dealBoard(1); this.phase = 'TURN'; }
        else if (this.phase === 'TURN') { this.dealBoard(1); this.phase = 'RIVER'; }
        this.onEvent({ type: 'board', phase: this.phase, board: this.board.map(cardToStr) });
      }
      this.goShowdown();
      return;
    }

    const first = this.nextToAct(this.buttonIdx);
    this.turnIdx = first;
    this.startTurn();
    this.logAction({ type: 'phase', phase: this.phase, board: this.board.map(cardToStr) });
  }

  dealBoard(n) {
    this.deck.pop(); // 烧一张
    for (let i = 0; i < n; i++) this.board.push(this.deck.pop());
  }

  goShowdown() {
    this.clearTurnTimer();
    this.phase = 'SHOWDOWN';
    const contributions = this.players.map(p => ({
      playerId: p.id,
      amount: p.totalBet,
      folded: p.folded || p.sittingOut,
    }));
    const pots = calculatePots(contributions);
    const winners = [];

    const alive = this.players.filter(p => !p.folded && !p.sittingOut);
    let rankMap = null;
    if (alive.length === 1) {
      const total = pots.reduce((s, p) => s + p.amount, 0);
      alive[0].stack += total;
      winners.push({
        playerId: alive[0].id,
        nickname: alive[0].nickname,
        amount: total,
        handName: '对手弃牌',
        hole: alive[0].hole.map(cardToStr),
      });
    } else {
      rankMap = new Map();
      for (const p of alive) rankMap.set(p.id, evaluate7([...p.hole, ...this.board]));
      for (const pot of pots) {
        const contenders = pot.eligible.filter(id => rankMap.has(id));
        if (contenders.length === 0) continue;
        let best = null;
        let bestIds = [];
        for (const id of contenders) {
          const r = rankMap.get(id);
          if (!best || compareRanks(r, best) > 0) { best = r; bestIds = [id]; }
          else if (compareRanks(r, best) === 0) bestIds.push(id);
        }
        const share = Math.floor(pot.amount / bestIds.length);
        const remainder = pot.amount - share * bestIds.length;
        bestIds.forEach((id, i) => {
          const p = this.players.find(x => x.id === id);
          const got = share + (i === 0 ? remainder : 0);
          p.stack += got;
          const existing = winners.find(w => w.playerId === id);
          if (existing) existing.amount += got;
          else winners.push({
            playerId: id, nickname: p.nickname, amount: got,
            handName: best.name, hole: p.hole.map(cardToStr),
          });
        });
      }
    }

    const pot = pots.reduce((s, p) => s + p.amount, 0);
    const summary = {
      handNo: this.handNo,
      board: this.board.map(cardToStr),
      pot,
      winners,
      showdownHoles: alive.length >= 2 ? alive.map(p => {
        const r = rankMap?.get(p.id);
        return {
          playerId: p.id,
          nickname: p.nickname,
          hole: p.hole.map(cardToStr),
          handName: r?.name,
          category: r?.category,
        };
      }) : [],
      actions: this.actions,
    };
    this.onEnd(summary);

    for (const p of this.players) {
      p.hole = [];
      p.hasCards = false;
      p.folded = false;
      p.allIn = false;
      p.bet = 0;
      p.totalBet = 0;
      p.acted = false;
      if (p.stack <= 0) { p.sittingOut = true; p.ready = false; }
    }
    this.phase = 'WAITING';
    this.currentBet = 0;
    this.turnIdx = -1;
    this.onUpdate();
    // 3.5 秒后自动开始下一手，给玩家看结算的时间
    this.scheduleAutoStart();
  }

  logAction(a) {
    this.actions.push({ ...a, t: Date.now() });
  }

  publicState() {
    // 昵称冲突时自动追加 #id 后缀，兼容历史数据中同桌重名
    const nickCount = new Map();
    for (const p of this.players) {
      nickCount.set(p.nickname, (nickCount.get(p.nickname) || 0) + 1);
    }
    const displayName = (p) =>
      nickCount.get(p.nickname) > 1 ? `${p.nickname}#${p.id}` : p.nickname;

    return {
      roomId: this.roomId,
      phase: this.phase,
      handNo: this.handNo,
      board: this.board.map(cardToStr),
      pot: this.players.reduce((s, p) => s + p.totalBet, 0),
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      sb: this.sb,
      bb: this.bb,
      buttonPlayerId: this.buttonIdx >= 0 ? this.players[this.buttonIdx]?.id : null,
      sbPlayerId: this.sbIdx >= 0 ? this.players[this.sbIdx]?.id : null,
      bbPlayerId: this.bbIdx >= 0 ? this.players[this.bbIdx]?.id : null,
      turnPlayerId: this.turnIdx >= 0 ? this.players[this.turnIdx]?.id : null,
      turnDeadline: this.turnDeadline,
      players: this.players.map(p => ({
        id: p.id,
        nickname: displayName(p),
        stack: p.stack,
        bet: p.bet,
        totalBet: p.totalBet,
        folded: p.folded,
        allIn: p.allIn,
        hasCards: p.hasCards,
        ready: p.ready,
        sittingOut: p.sittingOut,
      })),
    };
  }

  getHole(playerId) {
    const p = this.players.find(x => x.id === playerId);
    if (!p || !p.hasCards) return null;
    return p.hole.map(cardToStr);
  }
}
