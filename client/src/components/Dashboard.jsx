import { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import socket from '../socket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';

const Dashboard = () => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [games, setGames] = useState([]);

    useEffect(() => {
        const fetchGames = async () => {
            const token = sessionStorage.getItem('token');
            if (token) {
                try {
                    const res = await fetch(`${API_URL}/games/history`, {
                        headers: { 'x-auth-token': token }
                    });
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setGames(data);
                    }
                } catch (err) {
                    console.error("Failed to fetch games", err);
                }
            }
        };

        if (user) {
            fetchGames();
        }
    }, [user]);

    useEffect(() => {
        socket.on('game_found', ({ roomId, color }) => {
            console.log('Received game_found:', roomId, color);
            navigate(`/play?mode=online&room=${roomId}`);
        });

        return () => {
            socket.off('game_found');
        };
    }, [navigate]);

    if (!user) {
        return <div className="text-white text-center mt-20">Loading profile...</div>;
    }

    const { username, rating } = user;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
            <nav className="flex justify-between items-center mb-10 border-b border-gray-700 pb-4">
                <h1 className="text-3xl font-bold text-green-500">Chess.com Clone</h1>
                <div className="flex items-center space-x-4">
                    <span className="font-semibold text-lg">{username}</span>
                    <button
                        onClick={() => navigate('/leaderboard')}
                        className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded text-sm font-bold transition"
                    >
                        Leaderboard
                    </button>
                    <button
                        onClick={logout}
                        className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-bold transition"
                    >
                        Logout
                    </button>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Profile Card */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg col-span-1">
                    <h2 className="text-2xl font-bold mb-4 border-b border-gray-600 pb-2">Stats</h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Bullet</span>
                            <span className="text-xl font-mono">{rating?.bullet || 1200}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Blitz</span>
                            <span className="text-xl font-mono">{rating?.blitz || 1200}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400">Rapid</span>
                            <span className="text-xl font-mono">{rating?.rapid || 1200}</span>
                        </div>
                    </div>
                </div>

                {/* Play Options */}
                <div className="col-span-1 md:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div
                            onClick={() => {
                                console.log('Emitting join_queue for user', user.id);
                                socket.emit('join_queue', { userId: user.id });
                            }}
                            className="bg-blue-600 hover:bg-blue-700 cursor-pointer p-8 rounded-xl shadow-lg transform transition hover:scale-105 flex flex-col items-center justify-center"
                        >
                            <h3 className="text-2xl font-bold mb-2">Find Match</h3>
                            <p className="text-center text-blue-100">Play with Random Opponent</p>
                        </div>

                        <div
                            onClick={() => {
                                const randomRoom = Math.random().toString(36).substring(2, 9);
                                navigate(`/play?mode=online&room=${randomRoom}`);
                            }}
                            className="bg-green-600 hover:bg-green-700 cursor-pointer p-8 rounded-xl shadow-lg transform transition hover:scale-105 flex flex-col items-center justify-center"
                        >
                            <h3 className="text-2xl font-bold mb-2">Play Online</h3>
                            <p className="text-center text-green-100">Create Private Game</p>
                        </div>

                        <div
                            onClick={() => navigate('/play?mode=computer')}
                            className="bg-gray-700 hover:bg-gray-600 cursor-pointer p-8 rounded-xl shadow-lg transform transition hover:scale-105 flex flex-col items-center justify-center"
                        >
                            <h3 className="text-2xl font-bold mb-2">Vs Computer</h3>
                            <p className="text-center text-gray-300">Practice with Stockfish</p>
                        </div>
                    </div>

                    {/* Recent Games */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h2 className="text-2xl font-bold mb-4">Recent Games</h2>
                        {games.length === 0 ? (
                            <p className="text-gray-400 italic">No recent games found.</p>
                        ) : (
                            <div className="space-y-2">
                                {games.map((game) => (
                                    <div key={game._id} className="bg-gray-700 p-3 rounded flex justify-between items-center">
                                        <div>
                                            <span className={`font-bold ${game.winner === 'white' ? 'text-green-400' : (game.winner === 'black' ? 'text-green-400' : 'text-gray-400')}`}>
                                                {game.winner ? (game.winner === 'draw' ? 'Draw' : `${game.winner} won`) : 'In Progress'}
                                            </span>
                                            <span className="text-gray-400 text-sm ml-2">
                                                vs {game.white === user.id ? 'Opponent' : 'Opponent'}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {new Date(game.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
