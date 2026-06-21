import { Link } from 'react-router-dom';
import { Container, Button, Row, Col, Card } from 'react-bootstrap';
import { useUser } from '../contexts/UserContext';

export default function HomePage() {
  const { user } = useUser();

  return (
    <Container className="py-5">
      <h1 className="text-center mb-2">Last Race</h1>
      <p className="text-center text-muted mb-5">
        Navigate a fictional underground metro network and reach your destination before time runs out.
      </p>

      {user && (
        <div className="text-center mb-5">
          <Button as={Link} to="/game" variant="primary" size="lg" className="me-3">
            Play Now
          </Button>
          <Button as={Link} to="/ranking" variant="outline-secondary" size="lg">
            View Ranking
          </Button>
        </div>
      )}

      <h2 className="mb-4">How to Play</h2>

      <Row className="g-4 mb-5">
        <Col md={3}>
          <Card className="h-100 border-primary">
            <Card.Body>
              <Card.Title>1. Setup</Card.Title>
              <Card.Text>
                The full network map is shown here, with every line, station and
                colour visible. Interchange stations are marked with a ring, and
                these are worth memorising since that's where lines can be switched.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="h-100 border-warning">
            <Card.Body>
              <Card.Title>2. Planning <small className="text-muted fs-6">(90 s)</small></Card.Title>
              <Card.Text>
                The lines are hidden now, so only the station names are left on the
                map. A start and a destination are assigned, at least 3 stops apart,
                and the route is pieced together from the segment list by clicking
                the pairs in order. It has to be submitted before time runs out, even
                if it isn't finished.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="h-100 border-danger">
            <Card.Body>
              <Card.Title>3. Execution</Card.Title>
              <Card.Text>
                A random event is triggered on each segment, adding or taking away
                coins from the 20 coins starting balance. All coins are lost, and the
                score is zero, if the submitted route turns out invalid or
                incomplete.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="h-100 border-success">
            <Card.Body>
              <Card.Title>4. Result</Card.Title>
              <Card.Text>
                The final score is whatever coins are left, with zero as the floor.
                The best result across all games gets recorded on the global ranking,
                so there's always a reason to try beating it.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <h2 className="mb-3">Route Rules</h2>
      <ul className="mb-5">
        <li>The route has to start at the assigned station and end at the destination.</li>
        <li>Every step has to follow a real tunnel segment on one of the four lines.</li>
        <li>Each segment can be used once per route, though a station can be revisited.</li>
        <li>
          Lines can only be switched at <strong>interchange stations</strong>, the
          ones served by more than one line and marked on the map.
        </li>
        <li>A route that's invalid or incomplete is automatically scored at zero coins.</li>
      </ul>

      {!user && (
        <div className="text-center">
          <p className="text-muted">
            <Link to="/login">Log in</Link> to start playing and appear on the ranking.
          </p>
        </div>
      )}
    </Container>
  );
}
