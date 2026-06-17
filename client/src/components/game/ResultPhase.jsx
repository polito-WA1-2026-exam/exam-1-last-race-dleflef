import { useState, useEffect } from 'react';
import { Container, Button, Alert } from 'react-bootstrap';

export default function ResultPhase({ executionResult, onPlayAgain }) {
  const { valid, finalScore, steps } = executionResult;
  const [displayScore, setDisplayScore] = useState(0);

  // Count up to the final score on mount.
  useEffect(() => {
    if (finalScore === 0) { setDisplayScore(0); return; }
    const totalSteps = 30;
    const interval   = 700 / totalSteps;
    let count = 0;
    const id = setInterval(() => {
      count++;
      setDisplayScore(Math.round((count / totalSteps) * finalScore));
      if (count >= totalSteps) clearInterval(id);
    }, interval);
    return () => clearInterval(id);
  }, [finalScore]);

  return (
    <Container className="py-5">
      <div className="text-center">
        <h2 className="mb-2">{valid ? '🏁 Journey Complete' : '❌ Invalid Route'}</h2>
        <p className="text-muted mb-4">
          {valid
            ? `You completed ${steps.length} segment${steps.length !== 1 ? 's' : ''} and survived the unexpected events.`
            : 'Your route was invalid or incomplete — you lose all 20 starting coins.'}
        </p>

        <div className="score-reveal">
          <div className="display-1 fw-bold mb-1">{displayScore}</div>
          <div className="fs-4 text-muted mb-5">coins</div>
        </div>

        {!valid && (
          <Alert variant="warning" className="text-start mb-4" style={{ maxWidth: '520px', margin: '0 auto 1.5rem' }}>
            <Alert.Heading className="fs-6">Why was my route invalid?</Alert.Heading>
            A valid route must:
            <ul className="mb-0 mt-1">
              <li>start at the assigned starting station</li>
              <li>end at the assigned destination</li>
              <li>use only real tunnel segments between adjacent stations</li>
              <li>change lines <strong>only</strong> at interchange stations</li>
            </ul>
          </Alert>
        )}

        <Button variant="primary" size="lg" onClick={onPlayAgain}>
          Play Again
        </Button>
      </div>
    </Container>
  );
}
