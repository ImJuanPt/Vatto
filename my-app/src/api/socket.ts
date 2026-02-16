import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket() {
  if (socket) return socket;
  const base = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000';
  socket = io(base, { autoConnect: true });
  socket.on('connect', () => console.log('Socket connected', socket?.id));
  socket.on('disconnect', () => console.log('Socket disconnected'));
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}

export function subscribeToDevice(deviceId: string | number, handlers: { onAlert?: (data:any)=>void; onReading?: (data:any)=>void }) {
  const s = connectSocket();
  s.emit('subscribe_device', deviceId);
  if (handlers.onAlert) s.on('alert', handlers.onAlert);
  if (handlers.onReading) s.on('realtime_reading', handlers.onReading);
  return () => {
    if (handlers.onAlert) s.off('alert', handlers.onAlert);
    if (handlers.onReading) s.off('realtime_reading', handlers.onReading);
  };
}

export default { connectSocket, disconnectSocket, subscribeToDevice };
