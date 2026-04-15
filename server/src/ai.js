const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/chat/completions';
const MINIMAX_API_KEY = 'sk-cp-ieTjSoF1mnCHGgLBZrxd5cKV_p1R_ovG3POcd1C8VZFlyxeQrwtPTe3ukwwUUlI_NeerSGx7j2o62zOlUfI3MUCAi6nM8sDZQebCC1LTni_AQyR6FKLGngM';

// 按优先级排列
const MODELS = ['MiniMax-M2.5-highspeed', 'MiniMax-M2.7', 'MiniMax-M2.5'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callModel(model, messages) {
  const body = JSON.stringify({ model, messages, max_tokens: 400, temperature: 0.2 });
  const headers = {
    'Authorization': `Bearer ${MINIMAX_API_KEY}`,
    'Content-Type': 'application/json',
  };
  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch(MINIMAX_API_URL, { method: 'POST', headers, body });
    if ((res.status === 429 || res.status === 529) && attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
    if (res.status === 500 && attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
    if (!res.ok) { const txt = await res.text().catch(() => ''); throw new Error(`${res.status} ${txt}`); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

function stripThink(raw) {
  const after = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (after.length > 3) return after;
  const inner = (raw.match(/<think>([\s\S]*?)<\/think>/) || [])[1] || raw;
  return inner.replace(/<\/?think>/g, '').trim();
}

const ACTION_KEYWORDS = ['弃牌', '过牌', '跟注', '加注', 'All-in', 'all-in', 'allin', 'ALL-IN'];

/**
 * 解析模型输出为结构化对象
 * 期望格式：
 *   胜率：XX%
 *   行动：过牌
 *   原因：XXX
 */
function parseResponse(text) {
  // 先尝试去掉 think 块后的正式回复，fallback 到 think 块内容
  const clean = stripThink(text);

  // 胜率：支持多种写法
  const winMatch = clean.match(/胜率[：:]\s*(\d+)\s*%/)
                || clean.match(/(\d+)\s*%/);
  const winRate = winMatch ? parseInt(winMatch[1], 10) : null;

  // 行动：先找标签，再全文关键词匹配
  const actMatch = clean.match(/行动[：:]\s*(\S+)/)
                || clean.match(/建议[：:]\s*(\S+)/);
  let action = actMatch ? actMatch[1].trim() : null;
  if (!action || !ACTION_KEYWORDS.some(k => action.includes(k))) {
    const found = ACTION_KEYWORDS.find(k => clean.includes(k));
    if (found) action = found;
  }
  if (action && /all.?in/i.test(action)) action = 'All-in';

  // 原因：支持多种标签
  const rsnMatch = clean.match(/原因[：:]\s*(.+)/)
                || clean.match(/理由[：:]\s*(.+)/)
                || clean.match(/分析[：:]\s*(.+)/);
  const reason = rsnMatch ? rsnMatch[1].trim() : null;

  return { winRate, action: action || null, reason };
}

/**
 * @param {object} ctx
 * @param {string[]} ctx.hole
 * @param {string[]} ctx.board
 * @param {string}   ctx.phase
 * @param {number}   ctx.pot
 * @param {number}   ctx.myStack
 * @param {number}   ctx.myTotalBet
 * @param {number}   ctx.toCall
 * @param {number}   ctx.numOpponents
 * @param {string}   ctx.handName
 * @returns {Promise<{winRate: number|null, action: string, reason: string}>}
 */
export async function getAISuggestion(ctx) {
  const boardStr = ctx.board.length > 0 ? ctx.board.join(' ') : '无';
  const handInfo = ctx.handName ? ` 牌型:${ctx.handName}` : '';

  const messages = [
    {
      role: 'system',
      content:
        '你是德州扑克AI。直接输出答案，禁止任何开场白或解释。\n' +
        '必须严格输出以下三行，不多不少：\n' +
        '胜率：[0-100整数]%\n' +
        '行动：[弃牌/过牌/跟注/加注/All-in 中选一]\n' +
        '原因：[15字以内]\n\n' +
        '示例输出：\n' +
        '胜率：62%\n' +
        '行动：加注\n' +
        '原因：顶对强踢脚，主动建池',
    },
    {
      role: 'user',
      content:
        `手牌:${ctx.hole.join(' ')} 公共牌:${boardStr}${handInfo} 阶段:${ctx.phase} ` +
        `底池:${ctx.pot} 筹码:${ctx.myStack} 需跟注:${ctx.toCall} 对手:${ctx.numOpponents}人`,
    },
  ];

  let lastErr;
  for (const model of MODELS) {
    try {
      const raw = await callModel(model, messages);
      return parseResponse(raw);
    } catch (err) {
      console.warn(`[AI] ${model} 失败: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr;
}
