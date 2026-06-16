import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert, Card } from 'react-bootstrap';
import { useUser } from '../contexts/UserContext';
import API from '../api';

export default function LoginPage() {
  const { user, loading, setUser } = useUser();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already logged in — go straight to the game
  if (!loading && user) return <Navigate to="/game" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setError('');
    setSubmitting(true);
    try {
      const loggedUser = await API.login(username.trim(), password);
      setUser(loggedUser);
      navigate('/game');
    } catch (err) {
      setError(err?.error ?? 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container className="d-flex justify-content-center align-items-start py-5">
      <Card style={{ width: '100%', maxWidth: '420px' }}>
        <Card.Body className="p-4">
          <h2 className="mb-4">Login</h2>

          {error && <Alert variant="danger">{error}</Alert>}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="username">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </Form.Group>

            <Form.Group className="mb-4" controlId="password">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Form.Group>

            <Button type="submit" variant="primary" className="w-100" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Login'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}
