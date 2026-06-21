import { useMemo } from 'react';
import {
  Container, Row, Col, Button, Badge, Alert, ProgressBar,
} from 'react-bootstrap';
import NetworkMap from '../NetworkMap';
import { segKey } from '../../utils';

export default function PlanningPhase({
  planningData,
  networkData,
  selectedSegments,
  route,
  timeLeft,
  totalSeconds,
  selectionCounts,
  onSegmentClick,
  onUndo,
  onSubmit,
}) {
  const stationById = useMemo(
    () => Object.fromEntries(networkData.stations.map(s => [s.id, s])),
    [networkData.stations]
  );

  // Available segments are sorted before used ones; within each group the order is alphabetical.
  const sortedSegments = useMemo(() => {
    return [...planningData.segments].sort((a, b) => {
      const aUsed = selectionCounts.has(segKey(a.station1_id, a.station2_id)) ? 1 : 0;
      const bUsed = selectionCounts.has(segKey(b.station1_id, b.station2_id)) ? 1 : 0;
      if (aUsed !== bUsed) return aUsed - bUsed;
      const aName = a.station1_name + a.station2_name;
      const bName = b.station1_name + b.station2_name;
      return aName.localeCompare(bName);
    });
  }, [planningData.segments, selectionCounts]);

  const timerVariant = timeLeft <= 10 ? 'danger' : timeLeft <= 30 ? 'warning' : 'success';

  return (
    <Container fluid className="py-3 px-4">
      {/* Timer */}
      <Row className="mb-2 align-items-center">
        <Col><h5 className="mb-0">Phase 2 — Planning</h5></Col>
        <Col xs="auto">
          <Badge bg={timerVariant} className="fs-5 px-3 py-2">⏱ {timeLeft}s</Badge>
        </Col>
      </Row>
      <ProgressBar
        now={timeLeft} max={totalSeconds} variant={timerVariant}
        className="mb-4" style={{ height: '8px' }}
      />

      <Row className="g-4">
        {/* Map showing stations only; line connections are hidden during planning */}
        <Col lg={7}>
          <Alert variant="info" className="py-2 small mb-2">
            🕵️ <strong>Lines are hidden.</strong> Build your route from memory by clicking
            segments on the right that continue it, one at a time. Your route must start at{' '}
            <strong>{planningData.startStation.name}</strong> and end at{' '}
            <strong>{planningData.endStation.name}</strong>. An invalid or incomplete route scores zero.
          </Alert>
          <div className="d-flex gap-3 mb-2 flex-wrap">
            <span><Badge bg="success" className="me-1">Start</Badge>{planningData.startStation.name}</span>
            <span><Badge bg="danger"  className="me-1">Destination</Badge>{planningData.endStation.name}</span>
          </div>
          <NetworkMap
            lines={networkData.lines}
            stations={networkData.stations}
            segments={planningData.segments}
            showLines={false}
            startStationId={planningData.startStation.id}
            endStationId={planningData.endStation.id}
            tailStationId={route.length > 0 ? route[route.length - 1] : planningData.startStation.id}
            routeStationIds={route}
          />
        </Col>

        {/* Route builder */}
        <Col lg={5}>
          {/* Current route */}
          <div className="rounded p-3 mb-3" style={{ background: '#1e2d3d', minHeight: '72px' }}>
            <div className="text-white-50 small mb-2">Your Route</div>
            {route.length === 0 ? (
              <span className="text-white-50 fst-italic small">
                Select segments from the list below to build your route from{' '}
                <strong className="text-white">{planningData.startStation.name}</strong> to{' '}
                <strong className="text-white">{planningData.endStation.name}</strong>.
              </span>
            ) : (
              <div className="d-flex flex-wrap gap-1 align-items-center">
                {route.map((id, i) => (
                  <span key={`${id}-${i}`} className="d-flex align-items-center gap-1">
                    {i > 0 && <span className="text-muted">→</span>}
                    <Badge
                      bg={
                        id === planningData.startStation.id ? 'success'
                        : id === planningData.endStation.id  ? 'danger'
                        : 'secondary'
                      }
                    >
                      {stationById[id]?.name ?? id}
                    </Badge>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Undo */}
          <div className="d-flex mb-3">
            <Button
              variant="outline-secondary" size="sm"
              disabled={selectedSegments.length === 0}
              onClick={onUndo}
            >
              ↩ Undo last step
            </Button>
          </div>

          {/* Submit */}
          <div className="mb-3">
            <Button variant="primary" size="lg" className="w-100 fw-bold" onClick={onSubmit}>
              🚀 Submit Route
            </Button>
          </div>

          {/* Segment list */}
          <div className="fw-semibold mb-2 small text-uppercase text-muted">
            Segments. Click one that continues your route to add it
          </div>
          <div className="border rounded">
            {sortedSegments.map(seg => {
              const key  = segKey(seg.station1_id, seg.station2_id);
              const used = selectionCounts.has(key);
              return (
                <div
                  key={`${seg.station1_id}-${seg.station2_id}`}
                  onClick={() => onSegmentClick(seg)}
                  className="d-flex align-items-center gap-2 px-3 py-2 border-bottom segment-item"
                  style={{
                    cursor:  used ? 'default' : 'pointer',
                    opacity: used ? 0.4 : 1,
                  }}
                >
                  <span className="small flex-grow-1">
                    {seg.station1_name} — {seg.station2_name}
                  </span>
                  {used && <span className="small text-success fw-semibold">✓ used</span>}
                </div>
              );
            })}
          </div>
        </Col>
      </Row>
    </Container>
  );
}
