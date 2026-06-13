import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import crypto from 'crypto';
import db from './db.js';

const app = express();
const port = 3001;

// Middleware Setup
// configures the foundational security and session handlers for the application.

app.use(express.json());

// Cross-Origin Resource Sharing is enabled specifically for the React development server.
// The credentials flag is strictly required to allow session cookies to pass between ports.
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

// Express-session manages the user state across requests.
// Setting httpOnly adds a layer of security against cross-site scripting (XSS) attacks.
app.use(session({
  secret: 'lastracing-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport Configuration
// Passport is used here to securely handle local authentication without rolling a custom solution.

passport.use(new LocalStrategy((username, password, done) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return done(null, false, { message: 'Incorrect username.' });

  // The submitted password is encrypted using the user's unique salt and compared against the stored hash.
  const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
  if (hash !== user.hash) return done(null, false, { message: 'Incorrect password.' });

  return done(null, { id: user.id, username: user.username });
}));

// These two functions tell Passport how to pack and unpack the user ID into the session cookie.
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
  done(null, user || false);
});

// Authentication Guard
// This custom middleware is attached to protected API routes. 
// It intercepts requests from unauthenticated users and immediately returns a 401 error.

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// Network Graph Helpers
// Because the metro network never changes during the game, this data is computed 
// exactly once when the server starts up to save processing time later.

// An adjacency Map is built to track which stations are directly connected.
// Both directions are explicitly stored to create an undirected graph.
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

// A Breadth First Search (BFS) algorithm computes the shortest path distances.
// This is used to guarantee that the randomly selected start and destination stations 
// are always at least 3 segments apart, as required by the exam.
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

// A reusable SQL query is defined here to fetch all valid station pairings (segments) 
// along with their parent line's name and color.
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

// Route Validation Prepared Statements
// These SQL queries handle the complex business logic of determining if a player's route is legal.

// Checks which lines connect two directly adjacent stations.
const getSegmentLines = db.prepare(`
  SELECT DISTINCT ls1.line_id
  FROM line_stations ls1
  JOIN line_stations ls2
    ON ls1.line_id = ls2.line_id
    AND ABS(ls1.position - ls2.position) = 1
  WHERE ls1.station_id = ? AND ls2.station_id = ?
`);

// Counts how many distinct lines serve a given station. 
// If the count is greater than 1, the station is an interchange.
const getStationLineCount = db.prepare(`
  SELECT COUNT(DISTINCT line_id) AS cnt
  FROM line_stations
  WHERE station_id = ?
`);

// A cached dictionary of station IDs to names is generated for quick lookups during the scoring phase.
const stationNameMap = db
  .prepare('SELECT id, name FROM stations')
  .all()
  .reduce((m, s) => { m[s.id] = s.name; return m; }, {});

// The entire pool of random events is fetched once at startup.
const allEvents = db.prepare('SELECT description, effect FROM events').all();

// Route Validation Logic
// This function verifies the player's submitted route against four strict exam rules:
// 1) The route must contain at least one segment (two stations).
// 2) The route must start and end at the server-assigned stations.
// 3) Every pair of stations must be adjacent on the network.
// 4) Line changes are only permitted at valid interchange stations.

function validateRoute(route, startId, endId) {
  if (!Array.isArray(route) || route.length < 2) return false;
  if (route.some(id => !Number.isInteger(id) || id <= 0)) return false;
  if (route[0] !== startId || route[route.length - 1] !== endId) return false;

  // A Set is used to track segments to ensure no segment is traversed more than once, 
  // even if individual stations are visited multiple times.
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
    if (validLineIds.length === 0) return false; 

    // For the very first segment, the player boards whichever line serves it.
    if (currentLineId === null) {
      currentLineId = validLineIds[0]; 
    } 
    // If the current line serves the next segment, the journey continues without interruption.
    else if (validLineIds.includes(currentLineId)) {
      // No change needed
    } 
    // If a line change is required, the current station is checked to ensure it is actually an interchange.
    else {
      const { cnt } = getStationLineCount.get(fromId);
      if (cnt < 2) return false; 
      currentLineId = validLineIds[0]; 
    }
  }

  return true;
}

// Authentication Endpoints

// The login route attempts to authenticate the user and establish a session.
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

// The logout route destroys the user's session cookie.
app.delete('/api/sessions/current', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.status(204).end();
  });
});

// The session check route allows the React frontend to verify if the user is currently logged in.
app.get('/api/sessions/current', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ id: req.user.id, username: req.user.username });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Game API Endpoints

// Fetches the complete network map for the initial Setup phase.
// It returns every line, its ordered list of stations, and all available segments.
app.get('/api/network', isLoggedIn, (req, res) => {
  const lines = db.prepare(`
    SELECT l.id, l.name, l.color
    FROM lines l
    ORDER BY l.id
  `).all();

  // The ordered station list is attached directly to each respective line.
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


// Initializes a new game instance.
// It selects a random start and destination pair, ensuring they are separated by a minimum of 3 segments.
app.post('/api/planning', isLoggedIn, (req, res) => {
  // Any previously abandoned games are purged from the database to maintain a clean state.
  db.prepare('DELETE FROM games WHERE user_id = ? AND score IS NULL').run(req.user.id);

  let startId, endId;
  let found = false;

  // The station list is shuffled so that retries attempt different starting points.
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

  // The new game record is persisted to the database with a NULL score to indicate it is in progress.
  const gameId = db.prepare(`
    INSERT INTO games (user_id, start_station_id, end_station_id)
    VALUES (?, ?, ?)
  `).run(req.user.id, startId, endId).lastInsertRowid;

  // The game ID is stored in the session to prevent malicious cross-game manipulation.
  req.session.currentGameId = gameId;

  const startStation = db.prepare('SELECT id, name FROM stations WHERE id = ?').get(startId);
  const endStation   = db.prepare('SELECT id, name FROM stations WHERE id = ?').get(endId);
  const segments     = segmentsQuery.all();

  res.json({ gameId, startStation, endStation, segments });
});


// Retrieves the leaderboard data, listing the single highest score achieved by each registered user.
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


// Evaluates the player's submitted route and calculates the final score.
// It enforces strict security checks before determining if the route is valid.
app.post('/api/execute-route', isLoggedIn, (req, res) => {
  const { gameId, route } = req.body;

  if (!Number.isInteger(gameId) || !Array.isArray(route)) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  // The database is checked to ensure the game belongs to the current user and is actually in progress.
  const game = db.prepare(`
    SELECT id, start_station_id, end_station_id
    FROM games
    WHERE id = ? AND user_id = ? AND score IS NULL
  `).get(gameId, req.user.id);

  if (!game) {
    return res.status(404).json({ error: 'Game not found or already completed.' });
  }

  // The session guard ensures the user is attempting to execute the game they just planned.
  if (req.session.currentGameId !== gameId) {
    return res.status(403).json({ error: 'Session/game mismatch.' });
  }

  const isValid = validateRoute(route, game.start_station_id, game.end_station_id);

  // If the route is invalid or incomplete, the player immediately scores a zero.
  if (!isValid) {
    db.prepare('UPDATE games SET score = 0 WHERE id = ?').run(gameId);
    req.session.currentGameId = null;
    return res.json({ valid: false, finalScore: 0, steps: [] });
  }

  // If the route is valid, the simulation walks the path, applying one random event per segment.
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

  // The final score cannot drop below zero.
  const finalScore = Math.max(0, coins);

  db.prepare('UPDATE games SET score = ? WHERE id = ?').run(finalScore, gameId);
  req.session.currentGameId = null;

  res.json({ valid: true, finalScore, steps });
});

// Server Startup

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

