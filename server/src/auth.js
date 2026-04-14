import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { qUserByName, qUserByNickname, qInsertUser, qUserById } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'dezhou-poker-dev-secret';

export const authRouter = express.Router();

authRouter.post('/register', async (req, res) => {
  const { username, password, nickname } = req.body || {};
  if (!username || !password || !nickname) {
    return res.status(400).json({ error: '用户名、密码、昵称必填' });
  }
  const uname = String(username).trim();
  const nick = String(nickname).trim();
  if (uname.length < 2 || nick.length < 1) {
    return res.status(400).json({ error: '用户名/昵称格式非法' });
  }
  if (qUserByName.get(uname)) {
    return res.status(409).json({ error: '用户名已存在' });
  }
  if (qUserByNickname.get(nick)) {
    return res.status(409).json({ error: '昵称已被占用，请换一个' });
  }
  const hash = await bcrypt.hash(password, 8);
  const info = qInsertUser.run(uname, hash, nick, 10000, Date.now());
  const user = { id: info.lastInsertRowid, username: uname, nickname: nick, chips: 10000 };
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const row = qUserByName.get(username);
  if (!row) return res.status(401).json({ error: '用户不存在' });
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: '密码错误' });
  const user = { id: row.id, username: row.username, nickname: row.nickname, chips: row.chips };
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

authRouter.get('/me', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const user = qUserById.get(id);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'token 无效' });
  }
});

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
