import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Lobby() {
  const [rooms, setRooms] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '欢乐桌', smallBlind: 10, bigBlind: 20, maxSeats: 6 });
  const [joinCode, setJoinCode] = useState('');
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    try {
      const { rooms } = await api('/api/rooms');
      setRooms(rooms);
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const { room } = await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setCreating(false);
      navigate(`/table/${room.id}`);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h2>大厅</h2>
        <div className="lobby-actions">
          <button onClick={() => setCreating(true)}>创建房间</button>
          <input
            placeholder="房间码"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
          />
          <button disabled={!joinCode} onClick={() => navigate(`/table/${joinCode}`)}>
            加入
          </button>
        </div>
      </div>
      {err && <div className="err">{err}</div>}
      <table className="rooms">
        <thead>
          <tr><th>房间码</th><th>名称</th><th>盲注</th><th>人数</th><th></th></tr>
        </thead>
        <tbody>
          {rooms.map(r => (
            <tr key={r.id}>
              <td><code>{r.id}</code></td>
              <td>{r.name}</td>
              <td>{r.smallBlind}/{r.bigBlind}</td>
              <td>{r.players}/{r.maxSeats}</td>
              <td><button onClick={() => navigate(`/table/${r.id}`)}>加入</button></td>
            </tr>
          ))}
          {rooms.length === 0 && (
            <tr><td colSpan="5" className="empty">暂无房间，点上方"创建房间"开始</td></tr>
          )}
        </tbody>
      </table>

      {creating && (
        <div className="modal">
          <form className="card" onSubmit={create}>
            <h3>创建房间</h3>
            <input placeholder="房间名" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
            <label>小盲 <input type="number" value={form.smallBlind}
              onChange={e => setForm({ ...form, smallBlind: +e.target.value })} /></label>
            <label>大盲 <input type="number" value={form.bigBlind}
              onChange={e => setForm({ ...form, bigBlind: +e.target.value })} /></label>
            <label>最大座位 <input type="number" min="2" max="6" value={form.maxSeats}
              onChange={e => setForm({ ...form, maxSeats: +e.target.value })} /></label>
            <div className="row">
              <button type="button" onClick={() => setCreating(false)}>取消</button>
              <button type="submit">创建</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
