const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { Chess } = require('chess.js');

describe('Socket.IO Events', () => {
    let io, serverSocket, clientSocket1, clientSocket2;
    let httpServer;
    const activeGames = {};
    const queue = [];

    beforeAll((done) => {
        httpServer = createServer();
        io = new Server(httpServer);

        httpServer.listen(() => {
            const port = httpServer.address().port;

            // Set up Socket.IO event handlers (simplified version of main server)
            io.on('connection', (socket) => {
                serverSocket = socket;

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
                        const chess = new Chess();
                        activeGames[roomId] = {
                            chess,
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

            done();
        });
    });

    afterAll(() => {
        io.close();
        httpServer.close();
    });

    beforeEach((done) => {
        const port = httpServer.address().port;
        clientSocket1 = new Client(`http://localhost:${port}`);
        clientSocket1.on('connect', done);
    });

    afterEach(() => {
        if (clientSocket1) clientSocket1.close();
        if (clientSocket2) clientSocket2.close();
        // Clear game state
        Object.keys(activeGames).forEach(key => delete activeGames[key]);
        queue.length = 0;
    });

    describe('Matchmaking', () => {
        test('should add player to queue', (done) => {
            clientSocket1.emit('join_queue', { userId: 'user1' });

            setTimeout(() => {
                expect(queue.length).toBe(1);
                expect(queue[0].userId).toBe('user1');
                done();
            }, 100);
        });

        test('should match two players', (done) => {
            const port = httpServer.address().port;
            clientSocket2 = new Client(`http://localhost:${port}`);

            let player1Matched = false;
            let player2Matched = false;

            clientSocket1.on('game_found', (data) => {
                expect(data).toHaveProperty('roomId');
                expect(data.color).toBe('w');
                player1Matched = true;
                if (player2Matched) done();
            });

            clientSocket2.on('connect', () => {
                clientSocket2.on('game_found', (data) => {
                    expect(data).toHaveProperty('roomId');
                    expect(data.color).toBe('b');
                    player2Matched = true;
                    if (player1Matched) done();
                });

                clientSocket1.emit('join_queue', { userId: 'user1' });
                clientSocket2.emit('join_queue', { userId: 'user2' });
            });
        });

        test('should not add same user to queue twice', (done) => {
            clientSocket1.emit('join_queue', { userId: 'user1' });
            clientSocket1.emit('join_queue', { userId: 'user1' });

            setTimeout(() => {
                expect(queue.length).toBe(1);
                done();
            }, 100);
        });
    });

    describe('Game Play', () => {
        test('should join game and receive initial state', (done) => {
            clientSocket1.on('game_state', (data) => {
                expect(data).toHaveProperty('fen');
                expect(data).toHaveProperty('turn');
                expect(data).toHaveProperty('color');
                expect(data.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
                expect(data.color).toBe('w');
                done();
            });

            clientSocket1.emit('join_game', { roomId: 'test-room', userId: 'user1' });
        });

        test('should make a valid move', (done) => {
            const roomId = 'test-room-move';

            clientSocket1.on('game_state', () => {
                clientSocket1.on('receive_move', (data) => {
                    expect(data.move).toHaveProperty('from', 'e2');
                    expect(data.move).toHaveProperty('to', 'e4');
                    expect(data.fen).toContain('4P3');
                    expect(data.turn).toBe('b');
                    done();
                });

                clientSocket1.emit('make_move', {
                    roomId,
                    move: { from: 'e2', to: 'e4' },
                    userId: 'user1'
                });
            });

            clientSocket1.emit('join_game', { roomId, userId: 'user1' });
        });

        test('should reject invalid move', (done) => {
            const roomId = 'test-room-invalid';

            clientSocket1.on('game_state', () => {
                clientSocket1.on('invalid_move', (data) => {
                    expect(data.error).toBe('Invalid move');
                    done();
                });

                // Try to move opponent's piece
                clientSocket1.emit('make_move', {
                    roomId,
                    move: { from: 'e7', to: 'e5' },
                    userId: 'user1'
                });
            });

            clientSocket1.emit('join_game', { roomId, userId: 'user1' });
        });

        test('should handle two players making moves', (done) => {
            const port = httpServer.address().port;
            const roomId = 'test-room-two-players';
            clientSocket2 = new Client(`http://localhost:${port}`);

            let movesReceived = 0;

            const checkDone = () => {
                movesReceived++;
                if (movesReceived >= 4) done(); // Both players receive both moves
            };

            clientSocket1.on('game_state', () => {
                clientSocket1.on('receive_move', (data) => {
                    checkDone();
                });

                // White makes first move
                setTimeout(() => {
                    clientSocket1.emit('make_move', {
                        roomId,
                        move: { from: 'e2', to: 'e4' },
                        userId: 'user1'
                    });
                }, 100);
            });

            clientSocket2.on('connect', () => {
                clientSocket2.on('game_state', () => {
                    clientSocket2.on('receive_move', (data) => {
                        checkDone();

                        // Black makes second move after receiving white's move
                        if (data.move.from === 'e2') {
                            setTimeout(() => {
                                clientSocket2.emit('make_move', {
                                    roomId,
                                    move: { from: 'e7', to: 'e5' },
                                    userId: 'user2'
                                });
                            }, 100);
                        }
                    });
                });

                clientSocket2.emit('join_game', { roomId, userId: 'user2' });
            });

            clientSocket1.emit('join_game', { roomId, userId: 'user1' });
        });

        test('should detect checkmate', (done) => {
            const roomId = 'test-room-checkmate';

            clientSocket1.on('game_state', () => {
                let moveCount = 0;
                const moves = [
                    { from: 'f2', to: 'f3' },
                    { from: 'e7', to: 'e5' },
                    { from: 'g2', to: 'g4' },
                    { from: 'd8', to: 'h4' } // Checkmate
                ];

                clientSocket1.on('receive_move', (data) => {
                    if (data.result) {
                        expect(data.result).toBe('Black Wins');
                        done();
                    } else if (moveCount < moves.length) {
                        setTimeout(() => {
                            clientSocket1.emit('make_move', {
                                roomId,
                                move: moves[moveCount],
                                userId: 'user1'
                            });
                            moveCount++;
                        }, 50);
                    }
                });

                // Start first move
                clientSocket1.emit('make_move', {
                    roomId,
                    move: moves[0],
                    userId: 'user1'
                });
                moveCount++;
            });

            clientSocket1.emit('join_game', { roomId, userId: 'user1' });
        });
    });

    describe('Game State Synchronization', () => {
        test('should synchronize game state between multiple clients', (done) => {
            const port = httpServer.address().port;
            const roomId = 'test-room-sync';
            clientSocket2 = new Client(`http://localhost:${port}`);

            let client1Ready = false;
            let client2Ready = false;

            clientSocket1.on('game_state', (data) => {
                client1Ready = true;
                if (client2Ready) {
                    // Both clients should see the same initial state
                    expect(data.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
                    done();
                }
            });

            clientSocket2.on('connect', () => {
                clientSocket2.on('game_state', (data) => {
                    client2Ready = true;
                    if (client1Ready) {
                        expect(data.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
                        done();
                    }
                });

                clientSocket2.emit('join_game', { roomId, userId: 'user2' });
            });

            clientSocket1.emit('join_game', { roomId, userId: 'user1' });
        });
    });
});
