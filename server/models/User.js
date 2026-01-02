const mongoose = require('mongoose');

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

module.exports = mongoose.model('User', UserSchema);
