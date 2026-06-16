// All server communication lives here.
// The Vite proxy forwards /api/* to http://localhost:3001,
// so we never hard-code the backend host.

async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) throw data; // propagate { error: '...' } objects
  return data;
}

const API = {
  // ── Auth ────────────────────────────────────────────────────────────────────

  getCurrentSession() {
    return fetch('/api/sessions/current', { credentials: 'include' })
      .then(handleResponse);
  },

  login(username, password) {
    return fetch('/api/sessions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(handleResponse);
  },

  logout() {
    return fetch('/api/sessions/current', {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  // ── Game ─────────────────────────────────────────────────────────────────────

  // Full network for the Setup phase (lines, stations, segments with line colours).
  getNetwork() {
    return fetch('/api/network', { credentials: 'include' })
      .then(handleResponse);
  },

  // Start a new game: server picks start + destination, returns gameId + segments.
  startGame() {
    return fetch('/api/planning', { credentials: 'include' })
      .then(handleResponse);
  },

  // Submit the player's route.
  // route: number[]  — ordered station IDs
  executeRoute(gameId, route) {
    return fetch('/api/execute-route', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, route }),
    }).then(handleResponse);
  },

  // Leaderboard: best score per user.
  getRanking() {
    return fetch('/api/ranking', { credentials: 'include' })
      .then(handleResponse);
  },
};

export default API;
