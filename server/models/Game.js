const mongoose = require('mongoose');

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

module.exports = mongoose.model('Game', GameSchema);
