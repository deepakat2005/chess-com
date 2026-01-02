const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Game = require('../models/Game');

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

// @route   GET api/games/leaderboard
// @desc    Get top rated players
// @access  Public
router.get('/leaderboard', async (req, res) => {
    try {
        // Sort by rapid rating by default
        const users = await require('../models/User').find()
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
