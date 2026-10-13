import { createContext, useContext, useEffect, useState } from "react";
import api, { setAccessToken } from "../api/axios";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

// React StrictMode runs effects twice in dev. The refresh token rotates on use,
// so the request must only be sent once per page load.
let restoring = null;
const restoreSession = () => {
  restoring ??= api
    .post("/auth/refresh")
    .then((r) => r.data)
    .catch(() => null);
  return restoring;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    restoreSession().then((data) => {
      if (data) {
        setAccessToken(data.accessToken);
        setUser(data.user);
      }
      setLoading(false);
    });

    const onExpired = () => setUser(null);
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  const signIn = (data) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    signIn(data);
    return data.user;
  };

  const register = async (email, password) => {
    const { data } = await api.post("/auth/register", { email, password });
    signIn(data);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
