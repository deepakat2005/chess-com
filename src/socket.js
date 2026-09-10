import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:5002' : undefined);
const socket = io(SOCKET_URL);

socket.on('connect', () => {
    console.log('Connected to chess server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from chess server');
});

export default socket;
