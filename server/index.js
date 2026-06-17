import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import crypto from 'crypto';
import db from './db.js';

const app = express();
const port = 3001;

// Middleware

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

// Passport

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

// Auth guard

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// Network graph helpers, computed once at startup since the network does not change during runtime

// An adjacency map is returned, keyed by station ID with arrays of neighbouring station IDs as values.
// Both directions are stored so that the graph is treated as undirected.
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

// A breadth-first search is performed from the given start station; a map of station ID to distance is returned.
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

// The full segment list, including line metadata, is prepared for the Setup phase where line colours are displayed.
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

// A reduced segment list, without line metadata, is prepared for the Planning phase.
// Line colours and names are omitted because they would reveal information the player
// is not supposed to have at that stage.
const planningSegmentsQuery = db.prepare(`
  SELECT DISTINCT
    s1.id   AS station1_id,   s1.name AS station1_name,
    s2.id   AS station2_id,   s2.name AS station2_name
  FROM line_stations ls1
  JOIN line_stations ls2
    ON ls1.line_id = ls2.line_id AND ls2.position = ls1.position + 1
  JOIN stations s1 ON ls1.station_id = s1.id
  JOIN stations s2 ON ls2.station_id = s2.id
  ORDER BY s1.id, s2.id
`);

// Prepared statements for route validation

// The lines on which two stations are directly adjacent are retrieved, regardless of traversal direction.
const getSegmentLines = db.prepare(`
  SELECT DISTINCT ls1.line_id
  FROM line_stations ls1
  JOIN line_stations ls2
    ON ls1.line_id = ls2.line_id
    AND ABS(ls1.position - ls2.position) = 1
  WHERE ls1.station_id = ? AND ls2.station_id = ?
`);

// The number of distinct lines serving a station is counted; a count greater than one identifies an interchange.
const getStationLineCount = db.prepare(`
  SELECT COUNT(DISTINCT line_id) AS cnt
  FROM line_stations
  WHERE station_id = ?
`);

// A station ID to name lookup is cached at startup, since the network does not change.
const stationNameMap = Object.fromEntries(
  db.prepare('SELECT id, name FROM stations').all().map(r => [r.id, r.name])
);

// All available events are fetched once at startup.
const allEvents = db.prepare('SELECT description, effect FROM events').all();

// Route validation
//
// route   : number[]  ordered station IDs as submitted by the client
// startId : number    start station assigned by the server
// endId   : number    destination station assigned by the server
//
// True is returned only when all of the following conditions are satisfied:
//   1. At least two stations are present, forming one segment.
//   2. The route begins at startId and ends at endId.
//   3. Every consecutive pair of stations is adjacent on at least one line.
//   4. Line changes are permitted only at interchange stations, that is,
//      stations served by two or more lines.

function validateRoute(route, startId, endId) {
  if (!Array.isArray(route) || route.length < 2) return false;
  if (route.some(id => !Number.isInteger(id) || id <= 0)) return false;
  if (route[0] !== startId || route[route.length - 1] !== endId) return false;

  // No segment may be traversed more than once; stations may repeat but each segment is unique.
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
    if (validLineIds.length === 0) return false; // the two stations are not adjacent on any line

    if (currentLineId === null) {
      currentLineId = validLineIds[0]; // first segment: the line that serves it is boarded
    } else if (validLineIds.includes(currentLineId)) {
      // the same line is continued; no change is required
    } else {
      // a line change is required at fromId, so it must be an interchange
      const { cnt } = getStationLineCount.get(fromId);
      if (cnt < 2) return false; // the station is not an interchange; the change is illegal
      currentLineId = validLineIds[0]; // the line serving this segment is switched to
    }
  }

  return true;
}

// Auth routes

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

// Game APIs

const stationsForLine = db.prepare(`
  SELECT ls.line_id, s.id, s.name, ls.position
  FROM line_stations ls
  JOIN stations s ON ls.station_id = s.id
  WHERE ls.line_id = ?
  ORDER BY ls.position
`);

// GET /api/network — the full network map for the Setup phase.
// Every line with its ordered station list, a flat station array, and every segment are returned.
// Access is restricted to authenticated users.
app.get('/api/network', isLoggedIn, (req, res) => {
  const lines = db.prepare(`
    SELECT l.id, l.name, l.color
    FROM lines l
    ORDER BY l.id
  `).all();

  for (const line of lines) {
    line.stations = stationsForLine.all(line.id);
  }

  const stations = db.prepare('SELECT id, name FROM stations ORDER BY id').all();
  const segments = segmentsQuery.all();

  res.json({ lines, stations, segments });
});

// POST /api/planning — a new game is started.
// A random start and destination pair with a BFS distance of at least 3 is selected,
// a game record is persisted with a null score to indicate it is in progress, and
// the assignment together with the segment list for the planning phase is returned.
app.post('/api/planning', isLoggedIn, (req, res) => {
  // Any previously abandoned in-progress games for this user are removed.
  db.prepare('DELETE FROM games WHERE user_id = ? AND score IS NULL').run(req.user.id);

  // A valid start and destination pair is found using BFS.
  let startId, endId;
  let found = false;

  // The station list is shuffled so that different starting points are tried on each call.
  const shuffled = [...allStationIds].sort(() => Math.random() - 0.5);

  for (const sid of shuffled) {
    const distances = bfsDistances(sid);

    // The maximum BFS distance reachable from this start station is determined.
    let maxDist = 0;
    for (const [id, dist] of distances) {
      if (id !== sid && dist > maxDist) maxDist = dist;
    }

    // At least three segments are required between start and destination.
    if (maxDist < 3) continue;

    // All destinations reachable in three or more segments are collected as valid candidates.
    const validEnds = [];
    for (const [id, dist] of distances) {
      if (id !== sid && dist >= 3) validEnds.push(id);
    }

    startId = sid;
    endId = validEnds[Math.floor(Math.random() * validEnds.length)];
    found = true;
    break;
  }

  if (!found) {
    return res.status(500).json({ error: 'Could not find a valid start/destination pair.' });
  }

  // The game record is persisted to the database.
  const gameId = db.prepare(`
    INSERT INTO games (user_id, start_station_id, end_station_id)
    VALUES (?, ?, ?)
  `).run(req.user.id, startId, endId).lastInsertRowid;

  // The game ID is stored in the session to guard against cross-game route tampering.
  req.session.currentGameId = gameId;

  const startStation = db.prepare('SELECT id, name FROM stations WHERE id = ?').get(startId);
  const endStation   = db.prepare('SELECT id, name FROM stations WHERE id = ?').get(endId);
  const segments     = planningSegmentsQuery.all();

  res.json({ gameId, startStation, endStation, segments });
});

// GET /api/events — all possible events with their description and effect.
// These are retrieved by the client during the Setup phase so the player
// is informed of what may occur before planning begins.
app.get('/api/events', isLoggedIn, (req, res) => {
  const events = db.prepare('SELECT description, effect FROM events ORDER BY effect DESC').all();
  res.json(events);
});

// GET /api/ranking — the best score per user, ordered from highest to lowest.
// Only users who have completed at least one game are included.
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

// POST /api/execute-route — the submitted route is validated and the game is scored.
//
// Body: { gameId: number, route: number[] }
//   gameId  the ID returned by POST /api/planning
//   route   an ordered array of station IDs representing the player's path
//
// The following security checks are performed in order:
//   The game must exist and belong to the authenticated user.
//   The game must still be in progress, indicated by a null score.
//   The gameId must match the one stored in the session to prevent cross-game manipulation.
//
// Outcomes:
//   If the route is invalid or incomplete, a score of 0 is saved and an empty steps array is returned.
//   If the route is valid, 20 starting coins are awarded and one random event is applied per segment.
app.post('/api/execute-route', isLoggedIn, (req, res) => {
  const { gameId, route } = req.body;

  if (!Number.isInteger(gameId) || !Array.isArray(route)) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  // Ownership and in-progress status are verified.
  const game = db.prepare(`
    SELECT id, start_station_id, end_station_id
    FROM games
    WHERE id = ? AND user_id = ? AND score IS NULL
  `).get(gameId, req.user.id);

  if (!game) {
    return res.status(404).json({ error: 'Game not found or already completed.' });
  }

  // The session guard confirms that the submitted game matches the one currently being planned.
  if (req.session.currentGameId !== gameId) {
    return res.status(403).json({ error: 'Session/game mismatch.' });
  }

  const isValid = validateRoute(route, game.start_station_id, game.end_station_id);

  if (!isValid) {
    db.prepare('UPDATE games SET score = 0 WHERE id = ?').run(gameId);
    req.session.currentGameId = null;
    return res.json({ valid: false, finalScore: 0, steps: [] });
  }

  // The valid route is walked and one random event is applied per segment.
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

// Server

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
