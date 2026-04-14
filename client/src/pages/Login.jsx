import React, { useState } from 'react';
import { api, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const body = mode === 'register'
        ? { username, password, nickname }
        : { username, password };
      const { token, user } = await api(`/api/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setToken(token);
      onLogin(user);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h2>{mode === 'login' ? '登录' : '注册'}</h2>
        <input placeholder="用户名" value={username} onChange={e => setUsername(e.target.value)} />
        <input placeholder="密码" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        {mode === 'register' && (
          <input placeholder="昵称" value={nickname} onChange={e => setNickname(e.target.value)} />
        )}
        {err && <div className="err">{err}</div>}
        <button type="submit">{mode === 'login' ? '登录' : '注册'}</button>
        <a onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
        </a>
      </form>
    </div>
  );
}
