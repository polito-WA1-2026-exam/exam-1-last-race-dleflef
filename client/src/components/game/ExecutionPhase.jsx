import { Container, Row, Col, Badge, Card, Spinner } from 'react-bootstrap';

export default function ExecutionPhase({ executionResult, revealedSteps, planningData }) {
  const stepsToShow  = executionResult.steps.slice(0, revealedSteps);
  const allDone      = revealedSteps >= executionResult.steps.length;
  const currentCoins = revealedSteps === 0
    ? 20
    : executionResult.steps[revealedSteps - 1].coinsAfter;
  const coinVariant  = currentCoins >= 20 ? 'success' : currentCoins > 5 ? 'warning' : 'danger';

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-0">Phase 3 — Execution</h2>
          <small className="text-muted">
            {planningData.startStation.name} → {planningData.endStation.name}
          </small>
        </div>
        <div className="text-center">
          <div className="text-muted small mb-1">Coins</div>
          <Badge bg={coinVariant} className="fs-4 px-4 py-2">
            🪙 {currentCoins}
          </Badge>
        </div>
      </div>

      <div className="d-flex flex-column gap-3">
        {stepsToShow.map((step, i) => {
          const positive = step.effect > 0;
          const neutral  = step.effect === 0;
          return (
            <Card
              key={`step-${i}`}
              className={`step-card border-${positive ? 'success' : neutral ? 'secondary' : 'danger'}`}
            >
              <Card.Body className="py-2 px-3">
                <Row className="align-items-center">
                  <Col>
                    <div className="fw-semibold small">
                      {step.from} <span className="text-muted">→</span> {step.to}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.85em' }}>
                      {step.description}
                    </div>
                  </Col>
                  <Col xs="auto" className="text-end">
                    <Badge
                      bg={positive ? 'success' : neutral ? 'secondary' : 'danger'}
                      className="fs-6 px-3 mb-1"
                    >
                      {positive ? '+' : ''}{step.effect}
                    </Badge>
                    <div className="text-muted" style={{ fontSize: '0.75em' }}>
                      {step.coinsAfter} coins
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          );
        })}

        {!allDone && (
          <div className="text-center text-muted py-3">
            <Spinner animation="grow" size="sm" className="me-2" />
            Travelling to next station…
          </div>
        )}

        {allDone && (
          <div className="text-center text-muted py-2 small">
            Journey complete — calculating final score…
          </div>
        )}
      </div>
    </Container>
  );
}
