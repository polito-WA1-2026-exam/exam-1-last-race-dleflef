import { Navigate } from 'react-router-dom';
import { Spinner, Container } from 'react-bootstrap';
import { useUser } from '../contexts/UserContext';

// Renders children only for authenticated users.
// While the initial session check is in flight (loading=true) shows a spinner
// so we never flash a redirect on first paint.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" variant="secondary" />
      </Container>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return children;
}
