import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Lobby from './pages/Lobby.jsx';
import Table from './pages/Table.jsx';
import { api, clearToken, getToken } from './api.js';
import { resetSocket } from './socket.js';
import { music } from './music.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [musicOn, setMusicOn] = useState(false);
  const navigate = useNavigate();

  const toggleMusic = async () => {
    if (musicOn) {
      music.stop();
      setMusicOn(false);
    } else {
      await music.start();
      setMusicOn(true);
    }
  };

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api('/api/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    clearToken();
    resetSocket();
    setUser(null);
    navigate('/login');
  };

  if (loading) return <div className="center">加载中...</div>;

  return (
    <div className="app">
      {user && (
        <header className="top-bar">
          <div>🂡 德州扑克</div>
          <div className="user-info">
            <span>{user.nickname}</span>
            <span className="chips">💰 {user.chips}</span>
            <button
              className="icon-btn"
              onClick={toggleMusic}
              title={musicOn ? '关闭背景音乐' : '开启背景音乐'}
            >
              {musicOn ? '🔊' : '🔇'}
            </button>
            <button onClick={logout}>登出</button>
          </div>
        </header>
      )}
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/lobby" /> : <Login onLogin={setUser} />} />
        <Route path="/lobby" element={user ? <Lobby user={user} /> : <Navigate to="/login" />} />
        <Route path="/table/:roomId" element={user ? <Table user={user} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={user ? '/lobby' : '/login'} />} />
      </Routes>
    </div>
  );
}
