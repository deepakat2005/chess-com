import { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import socket from '../socket';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5002/api' : '/api');

const Dashboard = () => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [games, setGames] = useState([]);
    const [roomIdInput, setRoomIdInput] = useState('');
    const [joinError, setJoinError] = useState('');
    const [findingMatch, setFindingMatch] = useState(false);

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
        const handleGameFound = ({ roomId, color }) => {
            console.log('Received game_found:', roomId, color);
            setFindingMatch(false);
            navigate(`/play?mode=online&room=${roomId}`);
        };

        socket.on('game_found', handleGameFound);

        return () => {
            socket.off('game_found', handleGameFound);
        };
    }, [navigate]);

    // Cancel queue on unmount if still searching
    useEffect(() => {
        return () => {
            if (findingMatch && user) {
                socket.emit('leave_queue', { userId: user.id || user._id });
            }
        };
    }, [findingMatch, user]);

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
                                if (!findingMatch && user) {
                                    const userId = user.id || user._id;
                                    console.log('Emitting join_queue for user', userId);
                                    setFindingMatch(true);
                                    socket.emit('join_queue', { userId });
                                }
                            }}
                            className={`${findingMatch ? 'bg-blue-800 opacity-75 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'} p-8 rounded-xl shadow-lg transform transition hover:scale-105 flex flex-col items-center justify-center`}
                        >
                            {findingMatch ? (
                                <>
                                    <div className="w-8 h-8 border-4 border-blue-300 border-t-white rounded-full animate-spin mb-2"></div>
                                    <h3 className="text-2xl font-bold mb-2">Finding Match...</h3>
                                    <p className="text-center text-blue-100">Searching for opponent</p>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFindingMatch(false);
                                            socket.emit('leave_queue', { userId: user.id || user._id });
                                        }}
                                        className="mt-4 bg-red-600 hover:bg-red-700 text-white py-1 px-3 rounded text-sm font-bold"
                                    >
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-2xl font-bold mb-2">Find Match</h3>
                                    <p className="text-center text-blue-100">Play with Random Opponent</p>
                                </>
                            )}
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

                    {/* Join by Room ID */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h3 className="text-xl font-bold mb-4 text-purple-400">Join by Room ID</h3>
                        {joinError && (
                            <div className="mb-4 p-3 bg-red-600 text-white rounded text-sm">
                                {joinError}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Enter room ID..."
                                value={roomIdInput}
                                onChange={(e) => {
                                    setRoomIdInput(e.target.value);
                                    setJoinError('');
                                }}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && roomIdInput.trim()) {
                                        navigate(`/play?mode=online&room=${roomIdInput}`);
                                    }
                                }}
                                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-purple-500 focus:outline-none"
                            />
                            <button
                                onClick={() => {
                                    if (roomIdInput.trim()) {
                                        navigate(`/play?mode=online&room=${roomIdInput}`);
                                    } else {
                                        setJoinError('Please enter a room ID');
                                    }
                                }}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded transition"
                            >
                                Join
                            </button>
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
