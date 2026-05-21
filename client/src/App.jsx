import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Register from './pages/Register';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('webauthn_token');
    if (token) {
      verifyToken(token);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (token) => {
    try {
      const response = await fetch('/api/auth/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        localStorage.removeItem('webauthn_token');
      }
    } catch (error) {
      console.error('Error verifying token:', error);
      localStorage.removeItem('webauthn_token');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (user, token) => {
    localStorage.setItem('webauthn_token', token);
    setUser(user);
    navigate('/dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('webauthn_token');
    setUser(null);
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar user={user} onLogout={handleLogout} />
      <Routes>
        <Route
          path="/register"
          element={user ? <Navigate to="/dashboard" /> : <Register onRegisterSuccess={handleLogin} />}
        />
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" /> : <Login onLoginSuccess={handleLogin} />}
        />
        <Route
          path="/dashboard"
          element={user ? <Dashboard user={user} /> : <Navigate to="/login" />}
        />
        <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </div>
  );
}

export default App;
