import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import NavBar from './components/NavBar';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import GamePage from './pages/GamePage';
import RankingPage from './pages/RankingPage';

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/"        element={<HomePage />} />
          <Route path="/login"   element={<LoginPage />} />
          <Route path="/game"    element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
          <Route path="/ranking" element={<ProtectedRoute><RankingPage /></ProtectedRoute>} />
          <Route path="*"        element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </UserProvider>
  );
}
