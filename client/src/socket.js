import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket = null;

export function getSocket() {
  if (socket && socket.connected) return socket;
  if (socket) { socket.disconnect(); socket = null; }
  socket = io('/', {
    auth: { token: getToken() },
    transports: ['websocket'],
  });
  return socket;
}

export function resetSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
