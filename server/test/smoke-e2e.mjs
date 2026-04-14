// 端到端 smoke：启动一个已在运行的 server（localhost:3001），
// 注册 3 个账号 → 创建房间 → 三人加入 → 非房主 ready → 房主 start → 验证牌局状态
// 用法：先 `node server/src/index.js`，再 `node server/test/smoke-e2e.mjs`

// 从 client/node_modules 借用 socket.io-client，避免 server 重复安装
import { io } from '../../client/node_modules/socket.io-client/build/esm/index.js';

const BASE = 'http://localhost:3001';

async function http(path, body, token) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 每个账号用唯一用户名
const suffix = Date.now().toString(36);

async function registerOrLogin(name) {
  const username = `${name}_${suffix}`;
  try {
    return await http('/api/auth/register', { username, password: 'p', nickname: name });
  } catch {
    return await http('/api/auth/login', { username, password: 'p' });
  }
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (err) => reject(err));
    setTimeout(() => reject(new Error('socket connect timeout')), 5000);
  });
}

function waitForState(s, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => {
      s.off('state', onState);
      reject(new Error('waitForState timeout'));
    }, timeoutMs);
    const onState = (st) => {
      if (predicate(st)) {
        clearTimeout(timer);
        s.off('state', onState);
        resolve(st);
      }
    };
    s.on('state', onState);
  });
}

function waitForEvent(s, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off(event, onEvent);
      reject(new Error(`waitForEvent(${event}) timeout`));
    }, timeoutMs);
    const onEvent = (data) => {
      clearTimeout(timer);
      s.off(event, onEvent);
      resolve(data);
    };
    s.on(event, onEvent);
  });
}

const failures = [];
function expect(cond, msg) {
  if (!cond) { failures.push(msg); console.log('  ❌ ' + msg); }
  else console.log('  ✅ ' + msg);
}

async function main() {
  console.log('== E2E smoke: 房主控制开局 + 3 人局顺序 ==\n');

  console.log('1) 注册 3 个账号');
  const alice = await registerOrLogin('alice');
  const bob   = await registerOrLogin('bob');
  const carol = await registerOrLogin('carol');
  console.log(`   alice=${alice.user.id} bob=${bob.user.id} carol=${carol.user.id}`);

  console.log('2) alice 创建房间');
  const { room } = await http('/api/rooms',
    { name: '测试房', smallBlind: 10, bigBlind: 20, maxSeats: 6 }, alice.token);
  console.log(`   roomId=${room.id}`);

  console.log('3) 三人接入 socket 并加入房间');
  const sA = await connectSocket(alice.token);
  const sB = await connectSocket(bob.token);
  const sC = await connectSocket(carol.token);

  // 先监听，再发 join，避免错过 state
  const aStateP = waitForState(sA, st => st.players.length >= 1);
  sA.emit('room:join', { roomId: room.id });
  await aStateP;

  sB.emit('room:join', { roomId: room.id });
  await waitForState(sA, st => st.players.length >= 2);

  sC.emit('room:join', { roomId: room.id });
  const after3 = await waitForState(sA, st => st.players.length >= 3);

  expect(after3.players.length === 3, '桌上有 3 个玩家');
  expect(after3.phase === 'WAITING', '仅加入没有自动开始，停留在 WAITING');
  expect(after3.players.every(p => !p.ready), '加入不自动 ready');
  expect(after3.hostId === alice.user.id, '房主 ID = alice');

  console.log('4) 房主未准备好时点 start 应被拒（至少需要 2 名 ready 玩家）');
  let rejected = false;
  const errP = new Promise(resolve => {
    sA.once('error', (e) => { rejected = true; resolve(e); });
    setTimeout(resolve, 800);
  });
  sA.emit('game:start');
  await errP;
  expect(rejected, '房主单人 start 被后端拒绝');

  console.log('5) bob 和 carol ready');
  sB.emit('game:ready', { ready: true });
  sC.emit('game:ready', { ready: true });
  await waitForState(sA, st =>
    st.players.filter(p => p.id !== alice.user.id).every(p => p.ready)
  );
  console.log('   bob+carol ready 确认');

  console.log('6) alice 点 Start → 检查 3 人局盲注顺序');
  sA.emit('game:start');
  const playing = await waitForState(sA, st => st.phase === 'PREFLOP');

  console.log(`   button=${playing.buttonPlayerId} sb=${playing.sbPlayerId} bb=${playing.bbPlayerId} turn=${playing.turnPlayerId}`);
  expect(playing.phase === 'PREFLOP', '手局进入 PREFLOP');
  expect(playing.players.length === 3, '3 人都参与');
  expect(playing.handNo === 1, '第一手牌');
  expect(playing.buttonPlayerId !== playing.sbPlayerId, 'button ≠ SB（3 人局）');
  expect(playing.buttonPlayerId !== playing.bbPlayerId, 'button ≠ BB');
  expect(playing.sbPlayerId !== playing.bbPlayerId, 'SB ≠ BB');
  // 核心断言：首行动玩家既不是 SB 也不是 BB
  expect(playing.turnPlayerId !== playing.sbPlayerId, '✨ 首行动 ≠ 小盲');
  expect(playing.turnPlayerId !== playing.bbPlayerId, '✨ 首行动 ≠ 大盲');
  // 3 人局中，button 就是首行动
  expect(playing.turnPlayerId === playing.buttonPlayerId, '3 人局：button 先行动');

  // 盲注已投入
  const sbP = playing.players.find(p => p.id === playing.sbPlayerId);
  const bbP = playing.players.find(p => p.id === playing.bbPlayerId);
  const btnP = playing.players.find(p => p.id === playing.buttonPlayerId);
  expect(sbP.bet === 10, 'SB 投入 10');
  expect(bbP.bet === 20, 'BB 投入 20');
  expect(btnP.bet === 0, 'button 未投注');

  // 清理
  sA.close(); sB.close(); sC.close();
  await sleep(200);

  console.log('\n== 结果 ==');
  if (failures.length === 0) {
    console.log('✅ 全部通过');
    process.exit(0);
  } else {
    console.log(`❌ ${failures.length} 项失败:`);
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('脚本异常:', e);
  process.exit(2);
});
