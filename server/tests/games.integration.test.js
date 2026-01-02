const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const gamesRoutes = require('../routes/games');
const authRoutes = require('../routes/auth');
const Game = require('../models/Game');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);

describe('Games Integration Tests', () => {
    let token1, token2;
    let user1Id, user2Id;

    beforeEach(async () => {
        // Create two users for testing
        const user1Response = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'player1',
                email: 'player1@example.com',
                password: 'password123'
            });

        const user2Response = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'player2',
                email: 'player2@example.com',
                password: 'password123'
            });

        token1 = user1Response.body.token;
        token2 = user2Response.body.token;
        user1Id = user1Response.body.user.id;
        user2Id = user2Response.body.user.id;
    });

    describe('Game Creation and Retrieval', () => {
        test('should create a new game', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('x-auth-token', token1)
                .send({
                    mode: 'online',
                    timeControl: 'rapid'
                })
                .expect(200);

            expect(response.body).toHaveProperty('_id');
            expect(response.body).toHaveProperty('roomId');
            expect(response.body.mode).toBe('online');
            expect(response.body.status).toBe('waiting');
        });

        test('should get user games', async () => {
            // Create a game first
            await request(app)
                .post('/api/games')
                .set('x-auth-token', token1)
                .send({
                    mode: 'online',
                    timeControl: 'rapid'
                });

            const response = await request(app)
                .get('/api/games/user')
                .set('x-auth-token', token1)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
        });

        test('should get game by ID', async () => {
            // Create a game
            const createResponse = await request(app)
                .post('/api/games')
                .set('x-auth-token', token1)
                .send({
                    mode: 'online',
                    timeControl: 'rapid'
                });

            const gameId = createResponse.body._id;

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('x-auth-token', token1)
                .expect(200);

            expect(response.body._id).toBe(gameId);
        });

        test('should not get game without authentication', async () => {
            const response = await request(app)
                .get('/api/games/user')
                .expect(401);

            expect(response.body.msg).toBe('No token, authorization denied');
        });
    });

    describe('Complete Game Flow', () => {
        test('should complete a full game flow from creation to finish', async () => {
            // Step 1: Create a game
            const createResponse = await request(app)
                .post('/api/games')
                .set('x-auth-token', token1)
                .send({
                    mode: 'online',
                    timeControl: 'rapid'
                });

            expect(createResponse.status).toBe(200);
            const gameId = createResponse.body._id;
            const roomId = createResponse.body.roomId;

            // Step 2: Second player joins (simulated by updating the game)
            const game = await Game.findById(gameId);
            game.white = user1Id;
            game.black = user2Id;
            game.status = 'active';
            await game.save();

            // Step 3: Verify game is active
            const activeGame = await Game.findById(gameId);
            expect(activeGame.status).toBe('active');
            expect(activeGame.white.toString()).toBe(user1Id);
            expect(activeGame.black.toString()).toBe(user2Id);

            // Step 4: Make some moves (simulated)
            activeGame.moves.push({ from: 'e2', to: 'e4', san: 'e4' });
            activeGame.moves.push({ from: 'e7', to: 'e5', san: 'e5' });
            activeGame.fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
            await activeGame.save();

            // Step 5: Verify moves were recorded
            const gameWithMoves = await Game.findById(gameId);
            expect(gameWithMoves.moves.length).toBe(2);
            expect(gameWithMoves.moves[0].san).toBe('e4');
            expect(gameWithMoves.moves[1].san).toBe('e5');

            // Step 6: End the game
            gameWithMoves.status = 'finished';
            gameWithMoves.winner = 'white';
            gameWithMoves.finishedAt = new Date();
            await gameWithMoves.save();

            // Step 7: Verify game is finished
            const finishedGame = await Game.findById(gameId);
            expect(finishedGame.status).toBe('finished');
            expect(finishedGame.winner).toBe('white');
            expect(finishedGame.finishedAt).toBeDefined();
        });

        test('should track game statistics correctly', async () => {
            // Create and finish a game where player1 wins
            const game = new Game({
                roomId: 'test-room-123',
                white: user1Id,
                black: user2Id,
                mode: 'online',
                timeControl: 'rapid',
                status: 'finished',
                winner: 'white',
                finishedAt: new Date()
            });
            await game.save();

            // Verify the game was saved correctly
            const savedGame = await Game.findOne({ roomId: 'test-room-123' });
            expect(savedGame).toBeDefined();
            expect(savedGame.winner).toBe('white');
        });
    });

    describe('Game Modes', () => {
        test('should create game with computer mode', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('x-auth-token', token1)
                .send({
                    mode: 'computer',
                    timeControl: 'rapid',
                    difficulty: 'medium'
                })
                .expect(200);

            expect(response.body.mode).toBe('computer');
        });

        test('should create game with different time controls', async () => {
            const timeControls = ['bullet', 'blitz', 'rapid', 'classical'];

            for (const timeControl of timeControls) {
                const response = await request(app)
                    .post('/api/games')
                    .set('x-auth-token', token1)
                    .send({
                        mode: 'online',
                        timeControl
                    })
                    .expect(200);

                expect(response.body.timeControl).toBe(timeControl);
            }
        });
    });

    describe('Game Validation', () => {
        test('should not create game without authentication', async () => {
            const response = await request(app)
                .post('/api/games')
                .send({
                    mode: 'online',
                    timeControl: 'rapid'
                })
                .expect(401);

            expect(response.body.msg).toBe('No token, authorization denied');
        });

        test('should handle invalid game ID gracefully', async () => {
            const response = await request(app)
                .get('/api/games/invalid-id-123')
                .set('x-auth-token', token1)
                .expect(500);
        });
    });
});
