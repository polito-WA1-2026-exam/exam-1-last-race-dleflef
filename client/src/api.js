
// A set of utility functions for handling API requests and responses.
async function handleResponse(res) {
  const data = await res.json();
  
  // Processes the raw HTTP response.
  // If the server returns an error status, the JSON error object is extracted and thrown
  // so it can be properly caught and displayed 
  if (!res.ok) throw data; 
  return data;
}

const API = {
  
  // Authentication

  // The current active session is retrieved here to check if a user is already logged in 
  // when the application is first loaded.
  getCurrentSession() {
    return fetch('/api/sessions/current', { credentials: 'include' })
      .then(handleResponse);
  },

  // User credentials are submitted to the server to establish a new authenticated session.
  login(username, password) {
    return fetch('/api/sessions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(handleResponse);
  },

  // The active session is destroyed on the server side to securely log the user out.
  logout() {
    return fetch('/api/sessions/current', {
      method: 'DELETE',
      credentials: 'include',
    });
  },

  // Game Endpoints

  // The complete network layout, including lines, stations, and their respective colors, 
  // is fetched so it can be displayed to the player during the initial Setup phase.
  getNetwork() {
    return fetch('/api/network', { credentials: 'include' })
      .then(handleResponse);
  },

  // A new game session is initialized by the server. 
  // A new row is inserted into the database, and the randomly assigned starting and destination stations, 
  // along with the valid network segments, are returned to kick off the Planning phase.
  startGame() {
    return fetch('/api/planning', { 
      method: 'POST',
      credentials: 'include' 
    }).then(handleResponse);
  },

  // The final route built by the player (an ordered array of station IDs) is submitted here.
  // The server validates the path, applies the random events for each segment, and returns the final result.
  executeRoute(gameId, route) {
    return fetch('/api/execute-route', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, route }),
    }).then(handleResponse);
  },

  // The global leaderboard data, consisting of the highest scores achieved by all registered users, 
  // is retrieved to populate the ranking page.
  getRanking() {
    return fetch('/api/ranking', { credentials: 'include' })
      .then(handleResponse);
  },
};

export default API;