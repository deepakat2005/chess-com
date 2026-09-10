import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const Login = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });

    const { login, isAuthenticated, error, clearError } = useContext(AuthContext);
    const navigate = useNavigate();
    const [localError, setLocalError] = useState('');

    const { email, password } = formData;

    const onChange = (e) =>
        setFormData({ ...formData, [e.target.name]: e.target.value });

    const onSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');
        clearError && clearError();
        login({ email, password });
    };

    if (isAuthenticated) {
        navigate('/dashboard');
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md">
                <h2 className="text-3xl font-bold text-white mb-6 text-center">Login to Chess.com</h2>
                {(localError || error) && (
                    <div className="mb-4 p-3 bg-red-600 text-white rounded">
                        {localError || error}
                    </div>
                )}
                <form onSubmit={onSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-300 text-sm font-bold mb-2">Email or Username</label>
                        <input
                            type="text"
                            name="email"
                            value={email}
                            onChange={onChange}
                            placeholder="e.g. user@example.com or user123"
                            className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-green-500"
                            required
                        />
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-300 text-sm font-bold mb-2">Password</label>
                        <input
                            type="password"
                            name="password"
                            value={password}
                            onChange={onChange}
                            className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-green-500"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition duration-300"
                    >
                        Login
                    </button>
                </form>
                <p className="mt-4 text-gray-400 text-center">
                    Don't have an account? <Link to="/register" className="text-green-400 hover:text-green-300">Sign Up</Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
