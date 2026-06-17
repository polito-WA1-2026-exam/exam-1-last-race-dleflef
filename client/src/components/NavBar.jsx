import { Link, useNavigate } from 'react-router-dom';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { useUser } from '../contexts/UserContext';
import API from '../api';

export default function NavBar() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();

  async function handleLogout() {
    await API.logout();
    setUser(null);
    navigate('/');
  }

  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="mb-0">
      <Container>
        <Navbar.Brand as={Link} to="/" className="fw-bold">
          🌊 Last Race
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="main-nav" />
        <Navbar.Collapse id="main-nav">
          <Nav className="ms-auto align-items-center gap-2">
            {user ? (
              <>
                <Nav.Link as={Link} to="/game">Play</Nav.Link>
                <Nav.Link as={Link} to="/ranking">Ranking</Nav.Link>
                <Navbar.Text className="text-light">
                  {user.username}
                </Navbar.Text>
                <Button variant="outline-light" size="sm" onClick={handleLogout}>
                  Logout
                </Button>
              </>
            ) : (
              <Nav.Link as={Link} to="/login">Login</Nav.Link>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
