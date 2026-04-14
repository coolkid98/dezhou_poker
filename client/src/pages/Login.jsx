import React, { useState } from 'react';
import { api, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <div className="auth-page">
      {/* 背景装饰牌 */}
      <div className="auth-bg-cards" aria-hidden="true">
        <span>♠</span><span>♥</span><span>♦</span><span>♣</span>
      </div>

      <div className="auth-container">
        {/* Logo 区域 */}
        <div className="auth-logo">
          <div className="auth-logo-icon">🂡</div>
          <h1 className="auth-logo-title">德州扑克</h1>
          <p className="auth-logo-sub">Texas Hold'em</p>
        </div>

        {/* 表单卡片 */}
        <div className="auth-card">
          {/* Tab 切换 */}
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${isLogin ? 'active' : ''}`}
              onClick={() => { setMode('login'); setErr(''); }}
            >
              登录
            </button>
            <button
              type="button"
              className={`auth-tab ${!isLogin ? 'active' : ''}`}
              onClick={() => { setMode('register'); setErr(''); }}
            >
              注册
            </button>
          </div>

          <form onSubmit={submit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">用户名</label>
              <input
                className="auth-input"
                placeholder="请输入用户名"
                value={username}
                autoComplete="username"
                onChange={e => setUsername(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">密码</label>
              <input
                className="auth-input"
                placeholder="请输入密码"
                type="password"
                value={password}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {!isLogin && (
              <div className="auth-field">
                <label className="auth-label">昵称</label>
                <input
                  className="auth-input"
                  placeholder="桌上显示的名字"
                  value={nickname}
                  autoComplete="nickname"
                  onChange={e => setNickname(e.target.value)}
                />
              </div>
            )}

            {err && (
              <div className="auth-err">
                <span className="auth-err-icon">!</span>
                {err}
              </div>
            )}

            <button
              type="submit"
              className={`auth-submit ${loading ? 'loading' : ''}`}
              disabled={loading}
            >
              {loading
                ? '请稍候...'
                : isLogin ? '登录' : '创建账号'}
            </button>
          </form>
        </div>

        <p className="auth-footer">安全连接 · 数据本地存储</p>
      </div>
    </div>
  );
}
