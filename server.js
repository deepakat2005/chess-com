const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");
const { Chess } = require('chess.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// ==========================================
// 1. APP & SERVER INITIALIZATION
// ==========================================
const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGINS = [
    process.env.CLIENT_URL || "http://localhost:5173",
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
    "http://localhost:5175", "http://127.0.0.1:5175",
    "http://localhost:5002", "http://127.0.0.1:5002",
    "http://localhost:3000", "http://127.0.0.1:3000"
];

const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware
app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// ==========================================
// 2. DATABASE SCHEMAS & MODELS
// ==========================================
const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    email: {
        type: String,
        required: true,
        unique: true,
        match: [/.+\@.+\..+/, 'Please fill a valid email address']
    },
    password: {
        type: String,
        required: true
    },
    rating: {
        bullet: { type: Number, default: 1200 },
        blitz: { type: Number, default: 1200 },
        rapid: { type: Number, default: 1200 }
    },
    gamesHistory: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game'
    }],
    createdAt: { type: Date, default: Date.now }
});

UserSchema.index({ 'rating.rapid': -1 });
UserSchema.index({ 'rating.blitz': -1 });
UserSchema.index({ 'rating.bullet': -1 });

const User = mongoose.model('User', UserSchema);

const GameSchema = new mongoose.Schema({
    white: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    black: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    roomId: {
        type: String,
        required: true,
        unique: true
    },
    fen: {
        type: String,
        default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    },
    pgn: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'finished'],
        default: 'pending'
    },
    winner: {
        type: String,
        enum: ['white', 'black', 'draw', null],
        default: null
    },
    moves: [{
        from: String,
        to: String,
        promotion: String,
        san: String,
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    finishedAt: Date
});

const Game = mongoose.model('Game', GameSchema);

// Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chess';
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// ==========================================
// 3. AUTHENTICATION MIDDLEWARE
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_key_change_in_production';

function auth(req, res, next) {
    const token = req.header('x-auth-token');
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
}

// ==========================================
// 4. REST API ROUTES
// ==========================================
// --- Auth Routes ---
app.get('/api/auth', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        console.error('Auth error:', err.message);
        res.status(500).send('Server error');
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        user = await User.findOne({ username });
        if (user) {
            return res.status(400).json({ msg: 'Username already taken' });
        }

        user = new User({ username, email, password });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        const payload = { user: { id: user.id } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: { id: user.id, username: user.username, rating: user.rating } });
        });
    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).send('Server error');
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body; // 'email' can be email or username
    console.log('Login attempt received for:', email);

    try {
        let user = await User.findOne({
            $or: [
                { email: (email || '').toLowerCase() },
                { username: email }
            ]
        });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const payload = { user: { id: user.id } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: 360000 }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: { id: user.id, username: user.username, rating: user.rating } });
        });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).send('Server error');
    }
});

// --- Games Routes ---
app.post('/api/games', auth, async (req, res) => {
    try {
        const { mode, timeControl } = req.body;
        const roomId = Math.random().toString(36).substring(2, 9);

        const newGame = new Game({
            white: req.user.id,
            roomId,
            mode,
            timeControl
        });

        const game = await newGame.save();
        res.json(game);
    } catch (err) {
        console.error('Create game error:', err.message);
        res.status(500).send('Server error');
    }
});

app.get('/api/games/user', auth, async (req, res) => {
    try {
        const games = await Game.find({
            $or: [{ white: req.user.id }, { black: req.user.id }]
        })
            .sort({ finishedAt: -1, createdAt: -1 })
            .limit(10);

        res.json(games);
    } catch (err) {
        console.error('Get user games error:', err.message);
        res.status(500).send('Server error');
    }
});

app.get('/api/games/history', auth, async (req, res) => {
    try {
        const games = await Game.find({
            $or: [{ white: req.user.id }, { black: req.user.id }]
        })
            .sort({ finishedAt: -1, createdAt: -1 })
            .limit(10);

        res.json(games);
    } catch (err) {
        console.error('Get history games error:', err.message);
        res.status(500).send('Server error');
    }
});

app.get('/api/games/leaderboard', async (req, res) => {
    try {
        const type = req.query.type === 'blitz' || req.query.type === 'bullet' ? req.query.type : 'rapid';
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage || '50', 10)));

        const sortField = `rating.${type}`;
        const users = await User.find()
            .sort({ [sortField]: -1 })
            .skip((page - 1) * perPage)
            .limit(perPage)
            .select('username rating');

        const total = await User.countDocuments();
        res.json({ page, perPage, total, type, data: users });
    } catch (err) {
        console.error('Leaderboard error:', err.message);
        res.status(500).send('Server error');
    }
});

app.get('/api/games/:id', auth, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);
        if (!game) {
            return res.status(404).json({ msg: 'Game not found' });
        }
        res.json(game);
    } catch (err) {
        console.error('Get game by ID error:', err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Game not found' });
        }
        res.status(500).send('Server error');
    }
});

// ==========================================
// 5. IN-MEMORY STATE & ELO HELPER
// ==========================================
const activeGames = {}; // { [roomId]: { chess: ChessInstance, white: userId, black: userId } }
const queue = [];       // [{ socketId, userId }]
const socketUserMap = {}; // { socketId -> userId }

async function applyEloUpdate(roomId, room, winner) {
    if (!room || !room.white || !room.black) return;

    try {
        const whiteUser = await User.findById(room.white);
        const blackUser = await User.findById(room.black);
        if (!whiteUser || !blackUser) return;

        const whiteRating = whiteUser.rating?.rapid || 1200;
        const blackRating = blackUser.rating?.rapid || 1200;

        const K = process.env.ELO_K ? Number(process.env.ELO_K) : 32;

        const expectedWhite = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
        const expectedBlack = 1 / (1 + Math.pow(10, (whiteRating - blackRating) / 400));

        let scoreWhite, scoreBlack;
        if (winner === 'white') {
            scoreWhite = 1; scoreBlack = 0;
        } else if (winner === 'black') {
            scoreWhite = 0; scoreBlack = 1;
        } else {
            scoreWhite = 0.5; scoreBlack = 0.5;
        }

        const whiteChange = Math.round(K * (scoreWhite - expectedWhite));
        const blackChange = Math.round(K * (scoreBlack - expectedBlack));

        await User.findByIdAndUpdate(room.white, { $inc: { 'rating.rapid': whiteChange } });
        await User.findByIdAndUpdate(room.black, { $inc: { 'rating.rapid': blackChange } });

        io.to(roomId).emit('rating_update', { white: whiteChange, black: blackChange });
        console.log(`Rating updated (ELO): White ${whiteChange >= 0 ? '+' : ''}${whiteChange}, Black ${blackChange >= 0 ? '+' : ''}${blackChange}`);
    } catch (err) {
        console.error('Error applying ELO update:', err);
    }
}

// ==========================================
// 6. SOCKET.IO REAL-TIME LOGIC
// ==========================================
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Matchmaking Queue
    socket.on('join_queue', ({ userId }) => {
        if (!userId) {
            console.log('join_queue received with no userId, ignoring');
            return;
        }

        socketUserMap[socket.id] = userId;

        const alreadyInQueue = queue.find(q => q.userId === String(userId));
        if (alreadyInQueue) {
            console.log(`User ${userId} already in queue, updating socketId`);
            alreadyInQueue.socketId = socket.id;
            return;
        }

        queue.push({ socketId: socket.id, userId: String(userId) });
        console.log(`User ${userId} joined queue. Queue length: ${queue.length}`);

        if (queue.length >= 2) {
            const player1 = queue.shift();
            const player2 = queue.shift();
            const roomId = Math.random().toString(36).substring(2, 9);

            console.log(`Matching ${player1.userId} vs ${player2.userId} in room ${roomId}`);

            activeGames[roomId] = {
                chess: new Chess(),
                white: player1.userId,
                black: player2.userId
            };

            io.to(player1.socketId).emit('game_found', { roomId, color: 'w' });
            io.to(player2.socketId).emit('game_found', { roomId, color: 'b' });
        }
    });

    socket.on('leave_queue', ({ userId }) => {
        const index = queue.findIndex(q => q.userId === String(userId));
        if (index !== -1) {
            queue.splice(index, 1);
            console.log(`User ${userId} left queue. Queue length: ${queue.length}`);
        }
    });

    // Room & Game join
    socket.on('join_game', async ({ roomId, userId }) => {
        userId = userId ? String(userId) : null;
        socket.join(roomId);
        console.log(`User ${userId || 'anon'} joined room: ${roomId}`);

        socket.join(`chat_${roomId}`);

        if (userId) {
            socketUserMap[socket.id] = userId;
        }

        if (!activeGames[roomId]) {
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
        let myColor = null;

        if (userId) {
            if (room.white === userId) {
                myColor = 'w';
            } else if (room.black === userId) {
                myColor = 'b';
            } else if (!room.white) {
                room.white = userId;
                myColor = 'w';
            } else if (!room.black) {
                room.black = userId;
                myColor = 'b';
            } else {
                console.log(`Room ${roomId} is full. User ${userId} joins as spectator.`);
                myColor = null;
            }
        }

        let opponentId = null;
        let opponentInfo = null;

        if (myColor === 'w' && room.black) {
            opponentId = room.black;
        } else if (myColor === 'b' && room.white) {
            opponentId = room.white;
        }

        if (opponentId) {
            const opponent = await User.findById(opponentId).select('username rating');
            if (opponent) {
                opponentInfo = {
                    name: opponent.username,
                    rating: opponent.rating?.rapid || 1200
                };
            }
        }

        socket.emit('game_state', {
            fen: room.chess.fen(),
            turn: room.chess.turn(),
            color: myColor,
            history: room.chess.history(),
            isSpectator: myColor === null && room.white && room.black,
            opponentInfo: opponentInfo || { name: 'Waiting for opponent...', rating: '---' }
        });
    });

    // Make Move
    socket.on('make_move', async ({ roomId, move, userId }) => {
        userId = userId ? String(userId) : null;
        const room = activeGames[roomId];
        if (!room) return;

        const game = room.chess;
        const turnColor = game.turn();
        const isWhite = room.white === userId;
        const isBlack = room.black === userId;

        if (turnColor === 'w' && !isWhite) {
            console.log(`Move rejected: Not White's turn or user ${userId} is not White`);
            return;
        }
        if (turnColor === 'b' && !isBlack) {
            console.log(`Move rejected: Not Black's turn or user ${userId} is not Black`);
            return;
        }

        try {
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

                if (isOver) {
                    const winner = game.isCheckmate() ? (game.turn() === 'w' ? 'black' : 'white') : 'draw';
                    await applyEloUpdate(roomId, room, winner);
                }
            }
        } catch (e) {
            console.error('Invalid move attempt:', e);
            socket.emit('error', { message: 'Invalid move: ' + e.message });
        }
    });

    // Resign
    socket.on('resign', async ({ roomId, userId }) => {
        userId = userId ? String(userId) : null;
        const room = activeGames[roomId];
        if (!room || !userId) return;

        if (room.resigned) return;
        room.resigned = true;

        let resignerColor = null;
        let winnerColor = null;

        if (room.white === userId) {
            resignerColor = 'white';
            winnerColor = 'black';
        } else if (room.black === userId) {
            resignerColor = 'black';
            winnerColor = 'white';
        } else {
            return;
        }

        const resultText = winnerColor === 'white' ? 'White Wins (Resignation)' : 'Black Wins (Resignation)';
        console.log(`User ${userId} (${resignerColor}) resigned in room ${roomId}`);

        io.to(roomId).emit('game_resigned', {
            resignedBy: resignerColor,
            result: resultText,
            winner: winnerColor
        });

        try {
            await Game.findOneAndUpdate(
                { roomId },
                {
                    status: 'finished',
                    winner: winnerColor,
                    fen: room.chess.fen(),
                    finishedAt: new Date()
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error('Error saving resigned game:', err);
        }

        if (room.white && room.black) {
            await applyEloUpdate(roomId, room, winnerColor);
        }

        delete activeGames[roomId];
    });

    // Reset Game
    socket.on('reset_game', async ({ roomId }) => {
        const room = activeGames[roomId];
        if (!room) return;

        room.chess = new Chess();
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

        io.to(roomId).emit('game_reset', { fen: room.chess.fen() });
    });

    // In-game Chat
    socket.on('join_chat', ({ roomId }) => {
        socket.join(`chat_${roomId}`);
    });

    socket.on('send_message', (data) => {
        if (!data || !data.roomId) return;
        socket.to(`chat_${data.roomId}`).emit('receive_message', data);
    });

    // Disconnect
    socket.on('disconnect', () => {
        const index = queue.findIndex(q => q.socketId === socket.id);
        if (index !== -1) {
            queue.splice(index, 1);
            console.log(`User removed from queue. Queue length: ${queue.length}`);
        }
        delete socketUserMap[socket.id];
        console.log('User disconnected:', socket.id);
    });
});

// ==========================================
// 7. FRONTEND STATIC FILE SERVING & SPA FALLBACK
// ==========================================
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
}

app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ msg: 'Endpoint not found' });
    }
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send(`
            <!DOCTYPE html>
            <html>
                <head><title>Chess.com Fullstack</title></head>
                <body style="font-family: sans-serif; background: #111827; color: #f3f4f6; padding: 40px; text-align: center;">
                    <h1>♞ Chess Server is Running</h1>
                    <p>API & WebSocket are ready on port ${PORT || 5002}.</p>
                    <p>To view the React UI, run <code>npm run build</code> or launch dev mode with <code>npm run dev</code>.</p>
                </body>
            </html>
        `);
    }
});

// ==========================================
// 8. START SERVER
// ==========================================
const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
    console.log(`Unified Chess server running on http://localhost:${PORT}`);
});

module.exports = { app, server, User, Game, auth, activeGames, queue, socketUserMap, applyEloUpdate };
