import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';

const Leaderboard = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState(new Date());

    const fetchLeaderboard = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/games/leaderboard`);
            const data = await res.json();
            setUsers(data);
            setLastRefresh(new Date());
        } catch (err) {
            console.error("Failed to fetch leaderboard", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaderboard();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchLeaderboard, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center">
            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 mb-10 drop-shadow-lg">
                Grandmasters Leaderboard
            </h1>

            <div className="w-full max-w-3xl bg-gray-800/50 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-700">
                <div className="bg-gray-700/80 p-5 flex justify-between items-center border-b border-gray-600">
                    <div className="grid grid-cols-4 font-bold text-gray-400 uppercase tracking-wider text-sm flex-1">
                        <div className="col-span-1 text-center">Rank</div>
                        <div className="col-span-2">Player</div>
                        <div className="col-span-1 text-right px-4">Rating</div>
                    </div>
                    <button
                        onClick={fetchLeaderboard}
                        disabled={loading}
                        className="ml-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm font-bold transition"
                    >
                        {loading ? '⟳ Loading...' : '⟳ Refresh'}
                    </button>
                </div>

                {loading ? (
                    <div className="p-20 text-center flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <div className="text-gray-400 animate-pulse font-medium">Recalculating standings...</div>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-700/50">
                        {users.length > 0 ? users.map((user, index) => (
                            <div
                                key={user._id}
                                className={`p-5 grid grid-cols-4 items-center hover:bg-white/5 transition-all group ${index < 3 ? 'bg-yellow-500/5' : ''
                                    }`}
                            >
                                <div className="col-span-1 flex items-center justify-center">
                                    <span className={`
                                        flex items-center justify-center w-10 h-10 rounded-xl font-black text-lg shadow-inner transform group-hover:scale-110 transition-transform
                                        ${index === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-gray-900 ring-2 ring-yellow-400/50' :
                                            index === 1 ? 'bg-gradient-to-br from-gray-200 to-gray-500 text-gray-900 ring-2 ring-gray-300/50' :
                                                index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-700 text-gray-900 ring-2 ring-orange-500/50' :
                                                    'bg-gray-700/50 text-gray-400'}
                                    `}>
                                        {index + 1}
                                    </span>
                                </div>
                                <div className="col-span-2 flex items-center space-x-3 px-2">
                                    {index < 3 && <span className="text-2xl">👑</span>}
                                    <span className={`text-xl font-bold tracking-tight ${index < 3 ? 'text-white' : 'text-gray-300'
                                        }`}>
                                        {user.username}
                                    </span>
                                </div>
                                <div className="col-span-1 text-right font-mono px-4">
                                    <div className="text-2xl font-black text-green-400 flex flex-col items-end">
                                        <span>{user.rating?.rapid || 1200}</span>
                                        <span className="text-[10px] uppercase text-gray-500 tracking-tighter -mt-1">Rapid</span>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="p-10 text-center text-gray-500 italic">No legends found yet. Start playing to climb!</div>
                        )}
                    </div>
                )}
            </div>

            <Link to="/dashboard" className="mt-12 group flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
                <span className="transform group-hover:-translate-x-1 transition-transform">←</span>
                <span className="font-medium">Return to Arena</span>
            </Link>
            <p className="mt-4 text-xs text-gray-500">Last updated: {lastRefresh.toLocaleTimeString()}</p>
        </div>
    );
};

export default Leaderboard;
