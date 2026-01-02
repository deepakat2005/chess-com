const request = require('supertest');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const authRoutes = require('../routes/auth');
const gamesRoutes = require('../routes/games');
const Game = require('../models/Game');
const User = require('../models/User');

describe('End-to-End Game Flow', () => {
    let app, httpServer, io;
    let clientSocket1, clientSocket2;
    let token1, token2;
    let user1Id, user2Id;

    beforeAll(() => {
        // Set up Express app with Socket.IO
        app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);
        app.use('/api/games', gamesRoutes);

        httpServer = http.createServer(app);
        io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Simplified Socket.IO handlers for testing
        const activeGames = {};
        const queue = [];

        io.on('connection', (socket) => {
            socket.on('join_queue', ({ userId }) => {
                if (queue.find(q => q.userId === userId)) return;
                queue.push({ socketId: socket.id, userId });

                if (queue.length >= 2) {
                    const player1 = queue.shift();
                    const player2 = queue.shift();
                    const roomId = Math.random().toString(36).substring(2, 9);

                    io.to(player1.socketId).emit('game_found', { roomId, color: 'w' });
                    io.to(player2.socketId).emit('game_found', { roomId, color: 'b' });
                }
            });

            socket.on('join_game', ({ roomId, userId }) => {
                socket.join(roomId);

                if (!activeGames[roomId]) {
                    const { Chess } = require('chess.js');
                    activeGames[roomId] = {
                        chess: new Chess(),
                        white: null,
                        black: null
                    };
                }

                const room = activeGames[roomId];
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

                socket.emit('game_state', {
                    fen: room.chess.fen(),
                    turn: room.chess.turn(),
                    color: myColor
                });
            });

            socket.on('make_move', ({ roomId, move, userId }) => {
                const room = activeGames[roomId];
                if (!room) return;

                const game = room.chess;
                const turnColor = game.turn();
                const isWhite = room.white === userId;
                const isBlack = room.black === userId;

                if (turnColor === 'w' && !isWhite) return;
                if (turnColor === 'b' && !isBlack) return;

                try {
                    const result = game.move(move);
                    if (result) {
                        const isOver = game.isGameOver();
                        const fen = game.fen();

                        io.to(roomId).emit('receive_move', {
                            move: result,
                            fen,
                            turn: game.turn(),
                            check: game.inCheck(),
                            result: isOver ? (game.isCheckmate() ? (game.turn() === 'w' ? 'Black Wins' : 'White Wins') : 'Draw') : null
                        });
                    }
                } catch (e) {
                    socket.emit('invalid_move', { error: 'Invalid move' });
                }
            });
        });

        return new Promise((resolve) => {
            httpServer.listen(() => {
                resolve();
            });
        });
    });

    afterAll(() => {
        if (clientSocket1) clientSocket1.close();
        if (clientSocket2) clientSocket2.close();
        io.close();
        httpServer.close();
    });

    beforeEach(async () => {
        // Register two users
        const user1Response = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'e2e_player1',
                email: 'e2e_player1@example.com',
                password: 'password123'
            });

        const user2Response = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'e2e_player2',
                email: 'e2e_player2@example.com',
                password: 'password123'
            });

        token1 = user1Response.body.token;
        token2 = user2Response.body.token;
        user1Id = user1Response.body.user.id;
        user2Id = user2Response.body.user.id;
    });

    afterEach(() => {
        if (clientSocket1) {
            clientSocket1.close();
            clientSocket1 = null;
        }
        if (clientSocket2) {
            clientSocket2.close();
            clientSocket2 = null;
        }
    });

    test('Complete game flow: Register -> Create Game -> Matchmaking -> Play -> Finish', async (done) => {
        const port = httpServer.address().port;

        // Step 1: Create a game via API
        const createGameResponse = await request(app)
            .post('/api/games')
            .set('x-auth-token', token1)
            .send({
                mode: 'online',
                timeControl: 'rapid'
            });

        expect(createGameResponse.status).toBe(200);
        const gameId = createGameResponse.body._id;
        const roomId = createGameResponse.body.roomId;

        // Step 2: Connect both players via Socket.IO
        clientSocket1 = new Client(`http://localhost:${port}`);
        clientSocket2 = new Client(`http://localhost:${port}`);

        let player1Ready = false;
        let player2Ready = false;
        let movesMade = 0;

        clientSocket1.on('connect', () => {
            clientSocket1.emit('join_game', { roomId, userId: user1Id });
        });

        clientSocket1.on('game_state', (data) => {
            expect(data.color).toBe('w');
            player1Ready = true;

            if (player2Ready) {
                // Step 3: Player 1 makes first move
                setTimeout(() => {
                    clientSocket1.emit('make_move', {
                        roomId,
                        move: { from: 'e2', to: 'e4' },
                        userId: user1Id
                    });
                }, 100);
            }
        });

        clientSocket1.on('receive_move', async (data) => {
            movesMade++;

            if (movesMade === 1) {
                // First move (e4) received
                expect(data.move.from).toBe('e2');
                expect(data.move.to).toBe('e4');
            } else if (movesMade === 2) {
                // Second move (e5) received
                expect(data.move.from).toBe('e7');
                expect(data.move.to).toBe('e5');

                // Step 4: Verify game was saved to database
                const savedGame = await Game.findById(gameId);
                expect(savedGame).toBeDefined();
                expect(savedGame.moves.length).toBeGreaterThan(0);

                // Step 5: Get game via API
                const getGameResponse = await request(app)
                    .get(`/api/games/${gameId}`)
                    .set('x-auth-token', token1);

                expect(getGameResponse.status).toBe(200);
                expect(getGameResponse.body._id).toBe(gameId);

                // Step 6: Get user's games
                const userGamesResponse = await request(app)
                    .get('/api/games/user')
                    .set('x-auth-token', token1);

                expect(userGamesResponse.status).toBe(200);
                expect(Array.isArray(userGamesResponse.body)).toBe(true);

                done();
            }
        });

        clientSocket2.on('connect', () => {
            clientSocket2.emit('join_game', { roomId, userId: user2Id });
        });

        clientSocket2.on('game_state', (data) => {
            expect(data.color).toBe('b');
            player2Ready = true;
        });

        clientSocket2.on('receive_move', (data) => {
            if (data.move.from === 'e2') {
                // Step 3: Player 2 responds with e5
                setTimeout(() => {
                    clientSocket2.emit('make_move', {
                        roomId,
                        move: { from: 'e7', to: 'e5' },
                        userId: user2Id
                    });
                }, 100);
            }
        });
    }, 30000);

    test('Complete matchmaking flow', (done) => {
        const port = httpServer.address().port;

        clientSocket1 = new Client(`http://localhost:${port}`);
        clientSocket2 = new Client(`http://localhost:${port}`);

        let player1Matched = false;
        let player2Matched = false;
        let matchedRoomId;

        clientSocket1.on('connect', () => {
            clientSocket1.emit('join_queue', { userId: user1Id });
        });

        clientSocket1.on('game_found', (data) => {
            expect(data).toHaveProperty('roomId');
            expect(data.color).toBe('w');
            player1Matched = true;
            matchedRoomId = data.roomId;

            if (player2Matched) {
                expect(matchedRoomId).toBeDefined();
                done();
            }
        });

        clientSocket2.on('connect', () => {
            clientSocket2.emit('join_queue', { userId: user2Id });
        });

        clientSocket2.on('game_found', (data) => {
            expect(data).toHaveProperty('roomId');
            expect(data.color).toBe('b');
            expect(data.roomId).toBe(matchedRoomId);
            player2Matched = true;

            if (player1Matched) {
                done();
            }
        });
    }, 30000);

    test('User authentication flow with game access', async () => {
        // Step 1: Login
        const loginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'e2e_player1@example.com',
                password: 'password123'
            });

        expect(loginResponse.status).toBe(200);
        expect(loginResponse.body).toHaveProperty('token');
        const loginToken = loginResponse.body.token;

        // Step 2: Get user profile
        const profileResponse = await request(app)
            .get('/api/auth')
            .set('x-auth-token', loginToken);

        expect(profileResponse.status).toBe(200);
        expect(profileResponse.body.username).toBe('e2e_player1');

        // Step 3: Create game with login token
        const gameResponse = await request(app)
            .post('/api/games')
            .set('x-auth-token', loginToken)
            .send({
                mode: 'online',
                timeControl: 'blitz'
            });

        expect(gameResponse.status).toBe(200);
        expect(gameResponse.body.timeControl).toBe('blitz');

        // Step 4: Verify unauthorized access is blocked
        const unauthorizedResponse = await request(app)
            .get('/api/games/user');

        expect(unauthorizedResponse.status).toBe(401);
    });

    test('Complete game with checkmate', (done) => {
        const port = httpServer.address().port;
        const roomId = 'checkmate-test-room';

        clientSocket1 = new Client(`http://localhost:${port}`);

        const foolsMate = [
            { from: 'f2', to: 'f3' },
            { from: 'e7', to: 'e5' },
            { from: 'g2', to: 'g4' },
            { from: 'd8', to: 'h4' } // Checkmate!
        ];

        let moveIndex = 0;

        clientSocket1.on('connect', () => {
            clientSocket1.emit('join_game', { roomId, userId: user1Id });
        });

        clientSocket1.on('game_state', () => {
            // Start the game
            setTimeout(() => {
                clientSocket1.emit('make_move', {
                    roomId,
                    move: foolsMate[moveIndex++],
                    userId: user1Id
                });
            }, 100);
        });

        clientSocket1.on('receive_move', (data) => {
            if (data.result) {
                expect(data.result).toBe('Black Wins');
                expect(data.check).toBe(true);
                done();
            } else if (moveIndex < foolsMate.length) {
                setTimeout(() => {
                    clientSocket1.emit('make_move', {
                        roomId,
                        move: foolsMate[moveIndex++],
                        userId: user1Id
                    });
                }, 50);
            }
        });
    }, 30000);
});
