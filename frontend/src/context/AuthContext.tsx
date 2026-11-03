import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken, removeAuthToken, getCurrentUser, setCurrentUser } from '../services/api';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  designation?: string;
  department?: string;
  avatarUrl?: string;
  clientId?: string | null;
  clientName?: string | null;
  organization?: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string;
    currency: string;
    timezone: string;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(getCurrentUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const res = await api.getMe();
          if (res.success && res.user) {
            setUserState(res.user);
            setCurrentUser(res.user);
            setLoading(false);
            return;
          }
        } catch {
          removeAuthToken();
          setCurrentUser(null);
          setUserState(null);
        }
      } else {
        // Fallback default: if user was already stored in session, use it
        const saved = getCurrentUser();
        if (saved) {
          setUserState(saved);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    if (res.success) {
      setAuthToken(res.token);
      setCurrentUser(res.user);
      setUserState(res.user);
    }
  };

  const logout = () => {
    removeAuthToken();
    setCurrentUser(null);
    setUserState(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
