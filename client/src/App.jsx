import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import GameBoard from './components/GameBoard';

import PrivateRoute from './components/routing/PrivateRoute';

// function Home removed

import Dashboard from './components/Dashboard';
import Leaderboard from './components/Leaderboard';

const Home = () => (
  <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
    <h1 className="text-5xl font-bold mb-8 text-green-500">Chess.com Clone</h1>
    <div className="space-x-4">
      <Link to="/login" className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded font-bold transition">Login</Link>
      <Link to="/register" className="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded font-bold transition">Sign Up</Link>
      <Link to="/play" className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded font-bold transition">Play Now</Link>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/play" element={<PrivateRoute><GameBoard /></PrivateRoute>} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
