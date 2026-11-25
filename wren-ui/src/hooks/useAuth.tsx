import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import { Spin } from 'antd';
import { LocaleCode, useI18n } from '@/hooks/useI18n';

export type AuthRole = 'admin' | 'user';

export interface AuthUserInfo {
  id: number;
  email: string;
  name: string;
  role: AuthRole;
  language?: LocaleCode;
}

interface AuthContextValue {
  user: AuthUserInfo | null;
  token: string | null;
  loading: boolean;
  isAdmin: boolean;
  forbiddenMessage: string | null;
  clearForbidden: () => void;
  updateLanguage: (language: LocaleCode) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    name: string;
    password: string;
    role: AuthRole;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const TOKEN_STORAGE_KEY = 'analai_token';
const PUBLIC_ROUTES = ['/login', '/register'];

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  isAdmin: false,
  forbiddenMessage: null,
  clearForbidden: () => {},
  updateLanguage: async () => {},
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { setLocale } = useI18n();
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);

  const isPublicRoute = PUBLIC_ROUTES.includes(router.pathname);

  const clearForbidden = useCallback(() => {
    setForbiddenMessage(null);
  }, []);

  useEffect(() => {
    const onForbidden = (ev: Event) => {
      const customEv = ev as CustomEvent<string>;
      setForbiddenMessage(
        customEv.detail ||
          'У вас недостаточно прав для получения этих данных, обратитесь к администратору, чтобы получить доступ',
      );
    };
    const onUnauthorized = () => {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      setUser(null);
      setToken(null);
      if (!PUBLIC_ROUTES.includes(router.pathname)) {
        router.replace('/login');
      }
    };

    window.addEventListener('analai:forbidden', onForbidden);
    window.addEventListener('analai:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('analai:forbidden', onForbidden);
      window.removeEventListener('analai:unauthorized', onUnauthorized);
    };
  }, [router]);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      const savedToken = getStoredToken();
      try {
        const res = await fetch('/api/auth/me', {
          headers: savedToken
            ? { Authorization: `Bearer ${savedToken}` }
            : undefined,
        });
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setToken(savedToken);
          if (data.user?.language === 'en' || data.user?.language === 'ru') {
            setLocale(data.user.language);
          }
        } else {
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(TOKEN_STORAGE_KEY);
          }
          setUser(null);
          setToken(null);
        }
      } catch {
        if (!active) return;
        setUser(null);
        setToken(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    checkSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setForbiddenMessage(null);
  }, [router.pathname]);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublicRoute) {
      router.replace('/login');
    } else if (user && isPublicRoute) {
      router.replace('/home');
    }
  }, [loading, user, isPublicRoute, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка входа');
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      }
      setToken(data.token);
      setUser(data.user);
      if (data.user?.language === 'en' || data.user?.language === 'ru') {
        setLocale(data.user.language);
      }
      setForbiddenMessage(null);
      await router.replace('/home');
    },
    [router, setLocale],
  );

  const register = useCallback(
    async (input: {
      email: string;
      name: string;
      password: string;
      role: AuthRole;
    }) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка регистрации');
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      }
      setToken(data.token);
      setUser(data.user);
      if (data.user?.language === 'en' || data.user?.language === 'ru') {
        setLocale(data.user.language);
      }
      setForbiddenMessage(null);
      await router.replace('/home');
    },
    [router, setLocale],
  );

  const updateLanguage = useCallback(
    async (language: LocaleCode) => {
      setLocale(language);
      setUser((prev) => (prev ? { ...prev, language } : prev));
      const currentToken = getStoredToken();
      const res = await fetch('/api/auth/language', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update language');
      }
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
      }
    },
    [setLocale],
  );

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    setToken(null);
    setUser(null);
    setForbiddenMessage(null);
    await router.replace('/login');
  }, [router]);

  if (loading || (!user && !isPublicRoute)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080909',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAdmin: user?.role === 'admin',
        forbiddenMessage,
        clearForbidden,
        updateLanguage,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
