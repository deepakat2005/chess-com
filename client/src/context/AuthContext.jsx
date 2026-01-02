import { createContext, useReducer, useEffect } from 'react';
import axios from 'axios';
import setAuthToken from '../utils/setAuthToken';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';

const initialState = {
    token: sessionStorage.getItem('token'),
    isAuthenticated: null,
    loading: true,
    user: null,
    error: null
};

export const AuthContext = createContext(initialState);

const authReducer = (state, action) => {
    switch (action.type) {
        case 'USER_LOADED':
            return {
                ...state,
                isAuthenticated: true,
                loading: false,
                user: action.payload,
                error: null
            };
        case 'LOGIN_SUCCESS':
        case 'REGISTER_SUCCESS':
            sessionStorage.setItem('token', action.payload.token);
            return {
                ...state,
                ...action.payload,
                isAuthenticated: true,
                loading: false,
                error: null
            };
        case 'AUTH_ERROR':
        case 'LOGIN_FAIL':
        case 'LOGOUT':
            sessionStorage.removeItem('token');
            return {
                ...state,
                token: null,
                isAuthenticated: false,
                loading: false,
                user: null,
                error: action.payload
            };
        case 'CLEAR_ERROR':
            return {
                ...state,
                error: null
            };
        default:
            return state;
    }
};

export const AuthProvider = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, initialState);

    useEffect(() => {
        // Check for token in session storage
        if (sessionStorage.token) {
            setAuthToken(sessionStorage.token);
        }
        loadUser();
    }, []);

    // Load User
    const loadUser = async () => {
        if (sessionStorage.token) {
            setAuthToken(sessionStorage.token);
        }

        try {
            const res = await axios.get(`${API_URL}/auth`);

            dispatch({
                type: 'USER_LOADED',
                payload: res.data
            });
        } catch (err) {
            dispatch({
                type: 'AUTH_ERROR'
            });
        }
    };

    // Login Action
    const login = async (formData) => {
        const config = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        try {
            const res = await axios.post(`${API_URL}/auth/login`, formData, config);

            dispatch({
                type: 'LOGIN_SUCCESS',
                payload: res.data
            });
        } catch (err) {
            dispatch({
                type: 'LOGIN_FAIL',
                payload: err.response.data.msg
            });
        }
    };

    // Register Action
    const register = async (formData) => {
        const config = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        try {
            const res = await axios.post(`${API_URL}/auth/register`, formData, config);

            dispatch({
                type: 'REGISTER_SUCCESS',
                payload: res.data
            });
        } catch (err) {
            dispatch({
                type: 'AUTH_ERROR',
                payload: err.response.data.msg
            });
        }
    };

    const logout = () => dispatch({ type: 'LOGOUT' });

    const clearError = () => dispatch({ type: 'CLEAR_ERROR' });

    return (
        <AuthContext.Provider
            value={{
                token: state.token,
                isAuthenticated: state.isAuthenticated,
                loading: state.loading,
                user: state.user,
                error: state.error,
                loadUser,
                login,
                register,
                logout,
                clearError
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
