const SERVER_URL = 'http://localhost:3001';

async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) throw data; // the error object from the server is re-thrown so callers can handle it
  return data;
}

const API = {
  // Auth

  getCurrentSession() {
    return fetch(`${SERVER_URL}/api/sessions/current`, { credentials: 'include' })
      .then(handleResponse);
  },

  login(username, password) {
    return fetch(`${SERVER_URL}/api/sessions`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(handleResponse);
  },

  logout() {
    return fetch(`${SERVER_URL}/api/sessions/current`, {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  // Game

  getEvents() {
    return fetch(`${SERVER_URL}/api/events`, { credentials: 'include' })
      .then(handleResponse);
  },

  getNetwork() {
    return fetch(`${SERVER_URL}/api/network`, { credentials: 'include' })
      .then(handleResponse);
  },

  startGame() {
    return fetch(`${SERVER_URL}/api/planning`, {
      method: 'POST',
      credentials: 'include',
    }).then(handleResponse);
  },

  executeRoute(gameId, route) {
    return fetch(`${SERVER_URL}/api/execute-route`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, route }),
    }).then(handleResponse);
  },

  getRanking() {
    return fetch(`${SERVER_URL}/api/ranking`, { credentials: 'include' })
      .then(handleResponse);
  },
};

export default API;
