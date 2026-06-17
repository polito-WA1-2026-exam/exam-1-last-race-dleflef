import { Container, Button, Row, Col, Badge } from 'react-bootstrap';
import NetworkMap from '../NetworkMap';

export default function SetupPhase({ networkData, eventsData, onStartPlanning }) {
  return (
    <Container className="py-4">
      <h2 className="mb-1">Phase 1 — Setup</h2>
      <p className="text-muted mb-3">
        Study the metro network : Memorize the lines, interchange stations (marked with a ring),
        and the connections between them. When ready, start the 90-second planning phase.
      </p>
      <NetworkMap
        lines={networkData.lines}
        stations={networkData.stations}
        segments={networkData.segments}
        showLines
      />

      {eventsData.length > 0 && (
        <div className="mt-4">
          <h5>Possible Events</h5>
          <p className="text-muted small mb-2">
            One random event occurs at each segment you travel. Here are all possible events:
          </p>
          <Row xs={1} sm={2} md={3} className="g-2">
            {eventsData.map(ev => {
              const positive = ev.effect > 0;
              const neutral  = ev.effect === 0;
              return (
                <Col key={ev.description}>
                  <div className={`d-flex justify-content-between align-items-center border rounded px-3 py-2 border-${positive ? 'success' : neutral ? 'secondary' : 'danger'}`}>
                    <span className="small">{ev.description}</span>
                    <Badge bg={positive ? 'success' : neutral ? 'secondary' : 'danger'} className="ms-2">
                      {positive ? '+' : ''}{ev.effect}
                    </Badge>
                  </div>
                </Col>
              );
            })}
          </Row>
        </div>
      )}

      <div className="text-center mt-4">
        <Button variant="success" size="lg" onClick={onStartPlanning}>
          I'm Ready — Start Planning (90 s)
        </Button>
      </div>
    </Container>
  );
}
