import { useState, useEffect } from 'react';
import { Container, Table, Alert, Spinner, Badge } from 'react-bootstrap';
import API from '../api';

export default function RankingPage() {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    API.getRanking()
      .then(data => setRanking(data))
      .catch(() => setError('Could not load ranking. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Container
        className="d-flex justify-content-center align-items-center"
        style={{ minHeight: '50vh' }}
      >
        <Spinner animation="border" variant="secondary" />
      </Container>
    );
  }

  return (
    <Container className="py-5">
      <h1 className="mb-2">Global Ranking</h1>
      <p className="text-muted mb-4">Best single-game score per registered player.</p>

      {error && <Alert variant="danger">{error}</Alert>}

      {!error && ranking.length === 0 && (
        <Alert variant="info">No completed games yet — be the first to play!</Alert>
      )}

      {ranking.length > 0 && (
        <Table striped bordered hover responsive>
          <thead className="table-dark">
            <tr>
              <th style={{ width: '60px' }}>#</th>
              <th>Player</th>
              <th>Best Score</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Ranking is already sorted by best_score DESC. Tied scores share the
              // same rank, and the next distinct score keeps its actual position
              // (e.g. 1, 1, 3 rather than 1, 1, 2).
              let rank = 0;
              let prevScore = null;
              return ranking.map((row, i) => {
                if (row.best_score !== prevScore) {
                  rank = i + 1;
                  prevScore = row.best_score;
                }
                return (
                  <tr key={row.username}>
                    <td className="fw-bold">
                      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                    </td>
                    <td>{row.username}</td>
                    <td>
                      <Badge
                        bg={rank === 1 ? 'warning' : rank === 2 ? 'secondary' : 'primary'}
                        text={rank === 1 ? 'dark' : undefined}
                      >
                        {row.best_score} coins
                      </Badge>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </Table>
      )}
    </Container>
  );
}
