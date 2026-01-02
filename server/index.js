const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const { Chess } = require('chess.js');
const Game = require('./models/Game');
const User = require('./models/User');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const io = new Server(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware
app.use(cors({
    origin: [CLIENT_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true
}));
app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chess')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));

app.get('/', (req, res) => {
    res.send('Chess API is running...');
});

// In-memory game state: { [roomId]: { chess: ChessInstance, white: userId, black: userId } }
const activeGames = {};

// Matchmaking queue: [{ socketId, userId }]
const queue = [];

// Socket.IO Logic
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join_queue', ({ userId }) => {
        // Check if user already in queue
        if (queue.find(q => q.userId === userId)) return;

        queue.push({ socketId: socket.id, userId });
        console.log(`User ${userId} joined queue. Queue length: ${queue.length}`);

        if (queue.length >= 2) {
            const player1 = queue.shift();
            const player2 = queue.shift();
            const roomId = Math.random().toString(36).substring(2, 9);

            console.log(`Matching ${player1.userId} vs ${player2.userId} in room ${roomId}`);
            io.to(player1.socketId).emit('game_found', { roomId, color: 'w' });
            io.to(player2.socketId).emit('game_found', { roomId, color: 'b' });
        }
    });

    socket.on('join_game', async ({ roomId, userId }) => {
        socket.join(roomId);
        console.log(`User ${userId || 'anon'} joined room: ${roomId}`);

        if (!activeGames[roomId]) {
            // Check DB for existing game or creating new
            const existingGame = await Game.findOne({ roomId });

            const chess = new Chess();
            if (existingGame) {
                chess.load(existingGame.fen);
                activeGames[roomId] = {
                    chess,
                    white: existingGame.white?.toString(),
                    black: existingGame.black?.toString()
                };
            } else {
                activeGames[roomId] = {
                    chess,
                    white: null,
                    black: null
                };
            }
        }

        const room = activeGames[roomId];

        // Assign roles if needed
        let myColor = null;
        if (userId) {
            if (room.white === userId) myColor = 'w';
            else if (room.black === userId) myColor = 'b';
            else if (!room.white) {
                room.white = userId;
                myColor = 'w';
            } else if (!room.black) {
                room.black = userId;
                myColor = 'b';
            }
        }

        // Notify user
        socket.emit('game_state', {
            fen: room.chess.fen(),
            turn: room.chess.turn(),
            color: myColor,
            history: room.chess.history()
        });
    });

    socket.on('make_move', async ({ roomId, move, userId }) => {
        const room = activeGames[roomId];

        if (!room) return;

        const game = room.chess;

        // Validation: Is it this user's turn?
        const turnColor = game.turn(); // 'w' or 'b'
        const isWhite = room.white === userId;
        const isBlack = room.black === userId;

        if (turnColor === 'w' && !isWhite) {
            console.log(`Move rejected: Not White's turn or user ${userId} is not White`);
            // Optional: emit error
            return;
        }
        if (turnColor === 'b' && !isBlack) {
            console.log(`Move rejected: Not Black's turn or user ${userId} is not Black`);
            return;
        }

        try {
            // Attempt move
            const result = game.move(move);

            if (result) {
                const isOver = game.isGameOver();
                const fen = game.fen();

                io.to(roomId).emit('receive_move', {
                    move: result,
                    fen,
                    history: game.history(),
                    turn: game.turn(),
                    check: game.inCheck(),
                    result: isOver ? (game.isCheckmate() ? (game.turn() === 'w' ? 'Black Wins' : 'White Wins') : 'Draw') : null
                });

                // Persist to DB
                const update = {
                    $push: {
                        moves: {
                            from: result.from,
                            to: result.to,
                            promotion: result.promotion,
                            san: result.san
                        }
                    },
                    fen: fen,
                    status: isOver ? 'finished' : 'active',
                    winner: isOver ? (game.isCheckmate() ? (game.turn() === 'w' ? 'black' : 'white') : 'draw') : null,
                    white: room.white,
                    black: room.black,
                    finishedAt: isOver ? new Date() : undefined
                };

                await Game.findOneAndUpdate(
                    { roomId },
                    update,
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                // Update ratings if game finished
                if (isOver) {
                    const winner = game.isCheckmate() ? (game.turn() === 'w' ? 'black' : 'white') : 'draw';
                    let whiteChange = 0;
                    let blackChange = 0;

                    if (winner === 'white') {
                        whiteChange = 15;
                        blackChange = -15;
                    } else if (winner === 'black') {
                        whiteChange = -15;
                        blackChange = 15;
                    }

                    if (room.white && room.black) {
                        try {
                            await User.findByIdAndUpdate(room.white, { $inc: { 'rating.rapid': whiteChange } });
                            await User.findByIdAndUpdate(room.black, { $inc: { 'rating.rapid': blackChange } });

                            io.to(roomId).emit('rating_update', {
                                white: whiteChange,
                                black: blackChange
                            });
                        } catch (err) {
                            console.error('Error updating ratings:', err);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Invalid move attempt:', e);
            socket.emit('error', { message: 'Invalid move: ' + e.message });
        }
    });

    socket.on('reset_game', async ({ roomId, userId }) => {
        const room = activeGames[roomId];
        if (!room) return;

        // Reset the chess game
        room.chess = new Chess();

        // Update DB: reset fen, moves, status
        await Game.findOneAndUpdate(
            { roomId },
            {
                fen: room.chess.fen(),
                moves: [],
                status: 'active',
                winner: null,
                finishedAt: undefined
            },
            { upsert: true, new: true }
        );

        // Notify all players in room
        io.to(roomId).emit('game_reset', { fen: room.chess.fen() });
    });

    socket.on('disconnect', () => {
        const index = queue.findIndex(q => q.socketId === socket.id);
        if (index !== -1) {
            queue.splice(index, 1);
            console.log(`User removed from queue. Queue length: ${queue.length}`);
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
