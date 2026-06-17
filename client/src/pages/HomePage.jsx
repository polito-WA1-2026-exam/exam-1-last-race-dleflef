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
                Study the full network map — all lines, stations, and colours are
                visible. Memorise the interchange stations (marked with a ring) where
                you can switch between lines.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="h-100 border-warning">
            <Card.Body>
              <Card.Title>2. Planning <small className="text-muted fs-6">(90 s)</small></Card.Title>
              <Card.Text>
                The map hides the lines — only station names remain. You are given a
                start and a destination (at least 3 stops apart). Scroll through the
                segment list and click them in any order to build your route. Submit before
                time runs out, even if incomplete.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="h-100 border-danger">
            <Card.Body>
              <Card.Title>3. Execution</Card.Title>
              <Card.Text>
                Each segment triggers a random event that adds or removes coins from
                your 20-coin starting balance. If your submitted route is invalid or
                incomplete, you lose all coins and score zero.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="h-100 border-success">
            <Card.Body>
              <Card.Title>4. Result</Card.Title>
              <Card.Text>
                Your final score is the coins remaining (minimum 0). Your best result
                across all games is recorded on the global ranking. Can you reach your
                destination with the most coins?
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <h2 className="mb-3">Route Rules</h2>
      <ul className="mb-5">
        <li>Your route must start at the assigned station and end at the destination.</li>
        <li>Every step must follow a real tunnel segment on one of the four lines.</li>
        <li>
          You may only switch lines at <strong>interchange stations</strong> — stations
          served by more than one line (marked on the map).
        </li>
        <li>An invalid or incomplete route scores zero coins automatically.</li>
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
