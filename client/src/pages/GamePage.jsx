import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Container, Spinner, Alert, Button } from 'react-bootstrap';
import SetupPhase    from '../components/game/SetupPhase';
import PlanningPhase from '../components/game/PlanningPhase';
import ExecutionPhase from '../components/game/ExecutionPhase';
import ResultPhase   from '../components/game/ResultPhase';
import API from '../api';
import { segKey } from '../utils';

const PLANNING_SECONDS = 90;
const STEP_DELAY_MS    = 1500;

// Selected segments are chained into an ordered station ID path beginning at startStationId.
// Segments that do not connect to the current tail are skipped; the resulting route
// may be incomplete and will receive a score of zero on the server.
function buildRoute(selectedSegments, startStationId) {
  if (!startStationId) return [];
  const route = [];
  for (const seg of selectedSegments) {
    const { station1_id, station2_id } = seg;
    if (route.length === 0) {
      if (station1_id === startStationId)      route.push(station1_id, station2_id);
      else if (station2_id === startStationId) route.push(station2_id, station1_id);
      continue;
    }
    const last = route[route.length - 1];
    if (station1_id === last)      route.push(station2_id);
    else if (station2_id === last) route.push(station1_id);
  }
  return route;
}

// The game progresses through the phases: setup, planning, submitting, executing, and result.
export default function GamePage() {
  const [phase, setPhase] = useState('setup');

  // Setup
  const [networkData, setNetworkData]   = useState(null);
  const [networkError, setNetworkError] = useState('');
  const [eventsData, setEventsData]     = useState([]);

  // Planning
  const [planningData, setPlanningData]         = useState(null);
  const [selectedSegments, setSelectedSegments] = useState([]);
  const [timeLeft, setTimeLeft]                 = useState(PLANNING_SECONDS);

  // Execution
  const [executionResult, setExecutionResult] = useState(null);
  const [revealedSteps, setRevealedSteps]     = useState(0);

  // A ref is used to prevent double-submission caused by the timer and the submit button firing simultaneously.
  const submittedRef = useRef(false);

  // Derived values

  const route = useMemo(
    () => buildRoute(selectedSegments, planningData?.startStation?.id ?? null),
    [selectedSegments, planningData]
  );

  const selectionCounts = useMemo(
    () => new Set(selectedSegments.map(s => segKey(s.station1_id, s.station2_id))),
    [selectedSegments]
  );


  // Effects

  const loadNetwork = useCallback(() => {
    setNetworkError('');
    API.getNetwork()
      .then(data => setNetworkData(data))
      .catch(() => setNetworkError('Failed to load the network. Please try again.'));
  }, []);

  useEffect(() => { loadNetwork(); }, [loadNetwork]);

  useEffect(() => {
    API.getEvents().then(data => setEventsData(data)).catch(() => {});
  }, []);

  // A single interval is created per planning session; it is not recreated on every tick.
  useEffect(() => {
    if (phase !== 'planning' || !planningData) return;
    const id = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [phase, planningData]);

  const handleSubmitRoute = useCallback(async () => {
    if (submittedRef.current || !planningData) return;
    submittedRef.current = true;
    setPhase('submitting');

    try {
      const result = await API.executeRoute(planningData.gameId, route);
      setExecutionResult(result);
      if (result.valid && result.steps.length > 0) {
        setRevealedSteps(0);
        setPhase('executing');
      } else {
        setPhase('result');
      }
    } catch {
      setExecutionResult({ valid: false, finalScore: 0, steps: [] });
      setPhase('result');
    }
  }, [planningData, route]);

  // The route is submitted automatically when the countdown reaches zero.
  useEffect(() => {
    if (phase === 'planning' && timeLeft === 0) handleSubmitRoute();
  }, [timeLeft, phase, handleSubmitRoute]);

  // One execution step is revealed every STEP_DELAY_MS; when all steps are shown the result phase begins.
  useEffect(() => {
    if (phase !== 'executing' || !executionResult) return;
    if (revealedSteps >= executionResult.steps.length) {
      const id = setTimeout(() => setPhase('result'), STEP_DELAY_MS);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setRevealedSteps(r => r + 1), STEP_DELAY_MS);
    return () => clearTimeout(id);
  }, [phase, executionResult, revealedSteps]);

  // Handlers

  async function handleStartPlanning() {
    setPhase('planning');
    try {
      const data = await API.startGame();
      setPlanningData(data);
      setSelectedSegments([]);
      setTimeLeft(PLANNING_SECONDS);
      submittedRef.current = false;
    } catch {
      setNetworkError('Failed to start a new game. Please try again.');
      setPhase('setup');
    }
  }

  function handleSegmentClick(seg) {
    if (phase !== 'planning') return;
    const key = segKey(seg.station1_id, seg.station2_id);
    if (selectionCounts.has(key)) return; // the segment is already part of the route

    // Only segments that connect to the current route tail are accepted.
    // Without this guard, a non-connecting segment would be added to selectedSegments,
    // marking it as used and graying it out, while buildRoute silently drops it
    // and undo can no longer reach it.
    if (route.length === 0) {
      if (
        seg.station1_id !== planningData.startStation.id &&
        seg.station2_id !== planningData.startStation.id
      ) return;
    } else {
      const tail = route[route.length - 1];
      if (seg.station1_id !== tail && seg.station2_id !== tail) return;
    }

    setSelectedSegments(prev => [...prev, seg]);
  }

  function handleUndoStep() {
    setSelectedSegments(prev => prev.slice(0, -1));
  }

  function handlePlayAgain() {
    setPlanningData(null);
    setExecutionResult(null);
    setSelectedSegments([]);
    setRevealedSteps(0);
    submittedRef.current = false;
    setPhase('setup');
  }

  // Render

  if (networkError) {
    return (
      <Container className="py-5">
        <Alert variant="danger">{networkError}</Alert>
        <Button variant="secondary" onClick={loadNetwork}>Try again</Button>
      </Container>
    );
  }

  if (!networkData) {
    return (
      <Container className="d-flex justify-content-center mt-5">
        <Spinner animation="border" />
      </Container>
    );
  }

  if (phase === 'setup') {
    return (
      <SetupPhase
        networkData={networkData}
        eventsData={eventsData}
        onStartPlanning={handleStartPlanning}
      />
    );
  }

  if (phase === 'planning' && !planningData) {
    return (
      <Container className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" className="mb-3" />
        <p className="text-muted">Generating your assignment…</p>
      </Container>
    );
  }

  if (phase === 'planning' && planningData) {
    return (
      <PlanningPhase
        planningData={planningData}
        networkData={networkData}
        selectedSegments={selectedSegments}
        route={route}
        timeLeft={timeLeft}
        totalSeconds={PLANNING_SECONDS}
        selectionCounts={selectionCounts}
        onSegmentClick={handleSegmentClick}
        onUndo={handleUndoStep}
        onSubmit={handleSubmitRoute}
      />
    );
  }

  if (phase === 'submitting') {
    return (
      <Container className="d-flex flex-column align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" className="mb-3" />
        <p className="text-muted">Validating your route…</p>
      </Container>
    );
  }

  if (phase === 'executing' && executionResult) {
    return (
      <ExecutionPhase
        executionResult={executionResult}
        revealedSteps={revealedSteps}
        planningData={planningData}
      />
    );
  }

  if (phase === 'result' && executionResult) {
    return (
      <ResultPhase
        executionResult={executionResult}
        onPlayAgain={handlePlayAgain}
      />
    );
  }

  return null;
}
