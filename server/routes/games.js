const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Game = require('../models/Game');
const User = require('../models/User');

// @route   POST api/games
// @desc    Create a new game
// @access  Private
router.post('/', auth, async (req, res) => {
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
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   GET api/games/user
// @desc    Get current user's game history
// @access  Private
router.get('/user', auth, async (req, res) => {
    try {
        const games = await Game.find({
            $or: [{ white: req.user.id }, { black: req.user.id }]
        })
            .sort({ finishedAt: -1, createdAt: -1 })
            .limit(10);

        res.json(games);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   GET api/games/history
// @desc    Get current user's game history
// @access  Private
router.get('/history', auth, async (req, res) => {
    try {
        const games = await Game.find({
            $or: [{ white: req.user.id }, { black: req.user.id }]
        })
            .sort({ finishedAt: -1, createdAt: -1 })
            .limit(10); // Fetch last 10 games

        res.json(games);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   GET api/games/:id
// @desc    Get game by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);
        if (!game) {
            return res.status(404).json({ msg: 'Game not found' });
        }
        res.json(game);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Game not found' });
        }
        res.status(500).send('Server error');
    }
});

// @route   GET api/games/leaderboard
// @desc    Get top rated players
// @access  Public
router.get('/leaderboard', async (req, res) => {
    try {
        const users = await User.find()
            .sort({ 'rating.rapid': -1 })
            .limit(10)
            .select('username rating');
        res.json(users);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;
