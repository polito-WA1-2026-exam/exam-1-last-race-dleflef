import { createContext, useContext, useState, useEffect } from 'react';
import API from '../api';

const UserContext = createContext(null);

// loading = true until GET /api/sessions/current resolves.
// This prevents protected routes from flashing a redirect on first paint.
export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.getCurrentSession()
      .then(u => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
