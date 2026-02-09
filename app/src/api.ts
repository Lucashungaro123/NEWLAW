import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const ACCESS_KEY = "newlaw.access_token";
const REFRESH_KEY = "newlaw.refresh_token";
const USER_KEY = "newlaw.user";

const defaultBaseURL = import.meta.env.DEV ? "http://127.0.0.1:8000" : "https://api.newlaw.app.br";
const baseURL = import.meta.env.VITE_API_URL || defaultBaseURL;

export type AuthUser = { id: number; email: string; name: string; role: string };
export type AuthSession = { accessToken: string; refreshToken: string; user: AuthUser };

const storage = typeof window !== "undefined" ? window.localStorage : null;

export function loadAuthSession(): AuthSession | null {
  if (!storage) return null;
  const accessToken = storage.getItem(ACCESS_KEY);
  const refreshToken = storage.getItem(REFRESH_KEY);
  const userRaw = storage.getItem(USER_KEY);
  if (!accessToken || !refreshToken || !userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as AuthUser;
    return { accessToken, refreshToken, user };
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession) {
  if (!storage) return;
  storage.setItem(ACCESS_KEY, session.accessToken);
  storage.setItem(REFRESH_KEY, session.refreshToken);
  storage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearAuthSession() {
  if (!storage) return;
  storage.removeItem(ACCESS_KEY);
  storage.removeItem(REFRESH_KEY);
  storage.removeItem(USER_KEY);
}

export function getAccessToken() {
  return storage ? storage.getItem(ACCESS_KEY) : null;
}

export function getRefreshToken() {
  return storage ? storage.getItem(REFRESH_KEY) : null;
}

export const api = axios.create({
  baseURL
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await api.post("/auth/refresh", { refresh_token: refreshToken });
    const session: AuthSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user
    };
    saveAuthSession(session);
    return session.accessToken;
  } catch {
    clearAuthSession();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    if (!original || original._retry || status !== 401) {
      return Promise.reject(error);
    }
    if (original.url?.includes("/auth/login") || original.url?.includes("/auth/refresh")) {
      return Promise.reject(error);
    }
    original._retry = true;
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    if (newToken) {
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    }
    return Promise.reject(error);
  }
);

export async function ping() {
  const { data } = await api.get("/health");
  return data;
}

export async function login(username: string, password: string) {
  const { data } = await api.post("/auth/login", { username, password });
  return data;
}

export async function me() {
  const { data } = await api.get("/auth/me");
  return data as AuthUser;
}

export async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await api.post("/auth/logout", { refresh_token: refreshToken });
  }
  clearAuthSession();
}
