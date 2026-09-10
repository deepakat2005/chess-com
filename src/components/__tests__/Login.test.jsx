import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import Login from '../Login';

const mockLogin = jest.fn();
const mockClearError = jest.fn();

const renderLogin = (contextValue = {}) => {
  const defaultContext = {
    login: mockLogin,
    clearError: mockClearError,
    isAuthenticated: false,
    error: null,
    ...contextValue,
  };

  return render(
    <AuthContext.Provider value={defaultContext}>
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    </AuthContext.Provider>
  );
};

describe('Login Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders login form', () => {
    renderLogin();
    expect(screen.getByText('Login to Chess.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  test('displays error message', () => {
    renderLogin({ error: 'Invalid credentials' });
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });
});