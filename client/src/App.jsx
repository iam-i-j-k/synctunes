import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { connectSocket } from './socket/socket';
import useAuthStore from './stores/authStore';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';
import LibraryPage from './pages/LibraryPage';
import SearchPage from './pages/SearchPage';
import ProfilePage from './pages/ProfilePage';
import Layout from './components/Layout';
import ConnectionBanner from './components/ConnectionBanner';

export default function App() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) {
      connectSocket(token);
    }
  }, [token]);

  return (
    <BrowserRouter>
      <ConnectionBanner />
      <Toaster 
        position="bottom-right" 
        toastOptions={{ 
          style: { 
            background: '#18181b', 
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '1rem',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
        }} 
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<LobbyPage />} />
          <Route path="/room/:id" element={<RoomPage />} />
          <Route path="/library/:tab" element={<LibraryPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
