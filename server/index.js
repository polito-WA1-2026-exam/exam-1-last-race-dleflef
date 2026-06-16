import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import crypto from 'crypto';
import db from './db.js';

const app = express();
const port = 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

app.use(session({
  secret: 'lastracing-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

app.use(passport.initialize());
app.use(passport.session());

// ── Passport ──────────────────────────────────────────────────────────────────

passport.use(new LocalStrategy((username, password, done) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return done(null, false, { message: 'Incorrect username.' });

  const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
  if (hash !== user.hash) return done(null, false, { message: 'Incorrect password.' });

  return done(null, { id: user.id, username: user.username });
}));

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
  done(null, user || false);
});

// ── Auth guard ────────────────────────────────────────────────────────────────

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ── Network graph helpers (computed once — the network never changes) ─────────

// Returns adjacency Map: station_id → [neighbor_id, ...]
// Both directions are stored so the graph is undirected.
function buildAdjacency() {
  const rows = db.prepare(`
    SELECT ls1.station_id AS s1, ls2.station_id AS s2
    FROM line_stations ls1
    JOIN line_stations ls2
      ON ls1.line_id = ls2.line_id AND ls2.position = ls1.position + 1
  `).all();

  const adj = new Map();
  for (const { s1, s2 } of rows) {
    if (!adj.has(s1)) adj.set(s1, []);
    if (!adj.has(s2)) adj.set(s2, []);
    adj.get(s1).push(s2);
    adj.get(s2).push(s1);
  }
  return adj;
}

const adjacency = buildAdjacency();
const allStationIds = db.prepare('SELECT id FROM stations').all().map(r => r.id);

// BFS — returns Map<stationId, distanceFromStart>
function bfsDistances(startId) {
  const dist = new Map([[startId, 0]]);
  const queue = [startId];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const nb of adjacency.get(cur) ?? []) {
      if (!dist.has(nb)) {
        dist.set(nb, dist.get(cur) + 1);
        queue.push(nb);
      }
    }
  }
  return dist;
}

// Reusable SQL for fetching all segments with full line metadata.
// A segment is any pair of stations adjacent on the same line.
const segmentsQuery = db.prepare(`
  SELECT
    s1.id   AS station1_id,   s1.name AS station1_name,
    s2.id   AS station2_id,   s2.name AS station2_name,
    l.id    AS line_id,       l.name  AS line_name,    l.color AS line_color
  FROM line_stations ls1
  JOIN line_stations ls2
    ON ls1.line_id = ls2.line_id AND ls2.position = ls1.position + 1
  JOIN stations s1 ON ls1.station_id = s1.id
  JOIN stations s2 ON ls2.station_id = s2.id
  JOIN lines l     ON ls1.line_id    = l.id
  ORDER BY l.id, ls1.position
`);

// ── Route-validation prepared statements ─────────────────────────────────────

// Lines on which stationA and stationB are directly adjacent (either direction).
const getSegmentLines = db.prepare(`
  SELECT DISTINCT ls1.line_id
  FROM line_stations ls1
  JOIN line_stations ls2
    ON ls1.line_id = ls2.line_id
    AND ABS(ls1.position - ls2.position) = 1
  WHERE ls1.station_id = ? AND ls2.station_id = ?
`);

// How many distinct lines serve a station (> 1 → interchange).
const getStationLineCount = db.prepare(`
  SELECT COUNT(DISTINCT line_id) AS cnt
  FROM line_stations
  WHERE station_id = ?
`);

// Cached station id→name map (network never changes).
const stationNameMap = db
  .prepare('SELECT id, name FROM stations')
  .all()
  .reduce((m, s) => { m[s.id] = s.name; return m; }, {});

// All events, fetched once.
const allEvents = db.prepare('SELECT description, effect FROM events').all();

// ── Route validation ──────────────────────────────────────────────────────────
//
// route  : number[]  ordered station IDs submitted by the client
// startId: number    server-assigned start station
// endId  : number    server-assigned destination station
//
// Returns true only when every rule below is satisfied:
//   1. At least two stations (one segment).
//   2. Starts at startId, ends at endId.
//   3. Every consecutive pair is adjacent on at least one line.
//   4. Line changes are allowed only at interchange stations
//      (stations that appear on two or more lines).

function validateRoute(route, startId, endId) {
  if (!Array.isArray(route) || route.length < 2) return false;
  if (route.some(id => !Number.isInteger(id) || id <= 0)) return false;
  if (route[0] !== startId || route[route.length - 1] !== endId) return false;

  // No segment may be traversed more than once (stations may repeat, segments must not)
  const usedSegments = new Set();
  for (let i = 0; i < route.length - 1; i++) {
    const key = [route[i], route[i + 1]].sort((a, b) => a - b).join('-');
    if (usedSegments.has(key)) return false;
    usedSegments.add(key);
  }

  let currentLineId = null;

  for (let i = 0; i < route.length - 1; i++) {
    const fromId = route[i];
    const toId   = route[i + 1];

    const validLineIds = getSegmentLines.all(fromId, toId).map(r => r.line_id);
    if (validLineIds.length === 0) return false; // fromId and toId are not adjacent on any line

    if (currentLineId === null) {
      currentLineId = validLineIds[0]; // first segment — board whichever line serves it
    } else if (validLineIds.includes(currentLineId)) {
      // continuing on the same line — no change needed
    } else {
      // line change required at fromId: fromId must be an interchange
      const { cnt } = getStationLineCount.get(fromId);
      if (cnt < 2) return false; // non-interchange, line change illegal
      currentLineId = validLineIds[0]; // switch to the line that serves this segment
    }
  }

  return true;
}

// ── Auth routes ───────────────────────────────────────────────────────────────

// POST /api/sessions — login
app.post('/api/sessions', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info?.message ?? 'Login failed' });
    req.login(user, (err) => {
      if (err) return next(err);
      res.json({ id: user.id, username: user.username });
    });
  })(req, res, next);
});

// DELETE /api/sessions/current — logout
app.delete('/api/sessions/current', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.status(204).end();
  });
});

// GET /api/sessions/current — check session
app.get('/api/sessions/current', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ id: req.user.id, username: req.user.username });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// ── Game APIs ─────────────────────────────────────────────────────────────────

// GET /api/network — full map for the Setup phase.
// Returns every line (with its ordered station list) and every segment.
// Only authenticated users may access game data.
app.get('/api/network', isLoggedIn, (req, res) => {
  const lines = db.prepare(`
    SELECT l.id, l.name, l.color
    FROM lines l
    ORDER BY l.id
  `).all();

  // Attach ordered station list to each line
  const stationsForLine = db.prepare(`
    SELECT ls.line_id, s.id, s.name, ls.position
    FROM line_stations ls
    JOIN stations s ON ls.station_id = s.id
    WHERE ls.line_id = ?
    ORDER BY ls.position
  `);
  for (const line of lines) {
    line.stations = stationsForLine.all(line.id);
  }

  const stations = db.prepare('SELECT id, name FROM stations ORDER BY id').all();
  const segments = segmentsQuery.all();

  res.json({ lines, stations, segments });
});

// GET /api/planning — start a new game.
// Picks a random (start, destination) pair with BFS distance ≥ 3,
// persists a game record (score NULL = in progress), and returns
// the assignment plus the full segment list for the planning phase.
app.get('/api/planning', isLoggedIn, (req, res) => {
  // Clean up any previously abandoned in-progress games for this user
  db.prepare('DELETE FROM games WHERE user_id = ? AND score IS NULL').run(req.user.id);

  // Find a valid (start, end) pair using BFS
  let startId, endId;
  let found = false;

  // Shuffle station list so retries try different starts
  const shuffled = [...allStationIds].sort(() => Math.random() - 0.5);

  for (const sid of shuffled) {
    const distances = bfsDistances(sid);
    const validEnds = [];
    for (const [id, dist] of distances) {
      if (id !== sid && dist >= 3) validEnds.push(id);
    }
    if (validEnds.length > 0) {
      startId = sid;
      endId = validEnds[Math.floor(Math.random() * validEnds.length)];
      found = true;
      break;
    }
  }

  if (!found) {
    return res.status(500).json({ error: 'Could not find a valid start/destination pair.' });
  }

  // Persist the game record
  const gameId = db.prepare(`
    INSERT INTO games (user_id, start_station_id, end_station_id)
    VALUES (?, ?, ?)
  `).run(req.user.id, startId, endId).lastInsertRowid;

  // Store game ID in session as a guard against route-tampering
  req.session.currentGameId = gameId;

  const startStation = db.prepare('SELECT id, name FROM stations WHERE id = ?').get(startId);
  const endStation   = db.prepare('SELECT id, name FROM stations WHERE id = ?').get(endId);
  const segments     = segmentsQuery.all();

  res.json({ gameId, startStation, endStation, segments });
});

// GET /api/ranking — best score per user, descending.
// Only users who have completed at least one game appear in the list.
app.get('/api/ranking', isLoggedIn, (req, res) => {
  const ranking = db.prepare(`
    SELECT u.username, MAX(g.score) AS best_score
    FROM users u
    JOIN games g ON u.id = g.user_id
    WHERE g.score IS NOT NULL
    GROUP BY u.id
    ORDER BY best_score DESC
  `).all();

  res.json(ranking);
});

// POST /api/execute-route — validate the submitted route and score the game.
//
// Body: { gameId: number, route: number[] }
//   gameId — the ID returned by GET /api/planning
//   route  — ordered array of station IDs representing the player's path
//
// Security checks (in order):
//   • The game must exist and belong to the current user.
//   • The game must still be in progress (score IS NULL).
//   • gameId must match the one stored in the session (prevents cross-game manipulation).
//
// Outcomes:
//   Invalid / incomplete route → score saved as 0, steps array is empty.
//   Valid route → 20 starting coins, one random event per segment, score = max(0, total).
app.post('/api/execute-route', isLoggedIn, (req, res) => {
  const { gameId, route } = req.body;

  if (!Number.isInteger(gameId) || !Array.isArray(route)) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  // Verify ownership and in-progress status
  const game = db.prepare(`
    SELECT id, start_station_id, end_station_id
    FROM games
    WHERE id = ? AND user_id = ? AND score IS NULL
  `).get(gameId, req.user.id);

  if (!game) {
    return res.status(404).json({ error: 'Game not found or already completed.' });
  }

  // Session guard — must be the game this user was just planning
  if (req.session.currentGameId !== gameId) {
    return res.status(403).json({ error: 'Session/game mismatch.' });
  }

  const isValid = validateRoute(route, game.start_station_id, game.end_station_id);

  if (!isValid) {
    db.prepare('UPDATE games SET score = 0 WHERE id = ?').run(gameId);
    req.session.currentGameId = null;
    return res.json({ valid: false, finalScore: 0, steps: [] });
  }

  // Execute: walk the valid route, apply one random event per segment
  const STARTING_COINS = 20;
  let coins = STARTING_COINS;
  const steps = [];

  for (let i = 0; i < route.length - 1; i++) {
    const fromId = route[i];
    const toId   = route[i + 1];
    const event  = allEvents[Math.floor(Math.random() * allEvents.length)];
    coins += event.effect;

    steps.push({
      from:        stationNameMap[fromId],
      to:          stationNameMap[toId],
      description: event.description,
      effect:      event.effect,
      coinsAfter:  coins,
    });
  }

  const finalScore = Math.max(0, coins);

  db.prepare('UPDATE games SET score = ? WHERE id = ?').run(finalScore, gameId);
  req.session.currentGameId = null;

  res.json({ valid: true, finalScore, steps });
});

// ── Server ────────────────────────────────────────────────────────────────────

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
