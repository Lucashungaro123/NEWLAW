import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const ACCESS_KEY = "newlaw.access_token";
const REFRESH_KEY = "newlaw.refresh_token";
const USER_KEY = "newlaw.user";

const defaultBaseURL = import.meta.env.DEV ? "http://127.0.0.1:8000" : "https://api.newlaw.app.br";
export const baseURL = import.meta.env.VITE_API_URL || defaultBaseURL;

export type AuthUser = { id: number; email: string; name: string; role: string };
export type AuthSession = { accessToken: string; refreshToken: string; user: AuthUser };
export type ApiClient = {
  id: number;
  organization_id?: number | null;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};
export type CreateClientPayload = {
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  notes?: string;
  organization_id?: number;
};
export type UpdateClientPayload = CreateClientPayload;
export type ApiCase = {
  id: number;
  organization_id?: number | null;
  number: string;
  title: string;
  client_id?: number | null;
  wallet_id?: number | null;
  wallet_name?: string | null;
  wallet_nickname?: string | null;
  status: string;
  forum?: string | null;
  court?: string | null;
  value?: number | null;
};
export type CreateCasePayload = {
  number: string;
  title: string;
  client_id?: number;
  wallet_id?: number;
  status?: string;
  forum?: string;
  court?: string;
  value?: number;
  organization_id?: number;
};
export type UpdateCasePayload = CreateCasePayload;

export type ApiWallet = {
  id: number;
  organization_id?: number | null;
  number: number;
  name: string;
  nickname: string;
  description?: string | null;
  is_active: boolean;
  case_count?: number;
};
export type CreateWalletPayload = {
  nickname: string;
  description?: string;
  is_active?: boolean;
  organization_id?: number;
};
export type UpdateWalletPayload = CreateWalletPayload;

export type ApiTeamMember = {
  id: number;
  organization_id?: number | null;
  full_name: string;
  email: string;
  phone?: string | null;
  cpf: string;
  oab: string;
  role_title: string;
  team_name: string;
  notes?: string | null;
  is_active: boolean;
};
export type CreateTeamMemberPayload = {
  full_name: string;
  email: string;
  phone?: string;
  cpf: string;
  oab: string;
  role_title: string;
  team_name: string;
  notes?: string;
  is_active?: boolean;
  organization_id?: number;
};
export type UpdateTeamMemberPayload = CreateTeamMemberPayload;

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

export async function listClients(organizationId?: number) {
  const params = organizationId ? { organization_id: organizationId } : undefined;
  const { data } = await api.get("/clients", { params });
  return data as ApiClient[];
}

export async function createClient(payload: CreateClientPayload) {
  const { data } = await api.post("/clients", payload);
  return data as ApiClient;
}

export async function updateClient(clientId: number, payload: UpdateClientPayload) {
  const { data } = await api.put(`/clients/${clientId}`, payload);
  return data as ApiClient;
}

export async function deleteClient(clientId: number) {
  const { data } = await api.delete(`/clients/${clientId}`);
  return data as { status: string; id: number };
}

export async function listCases(organizationId?: number) {
  const params = organizationId ? { organization_id: organizationId } : undefined;
  const { data } = await api.get("/cases", { params });
  return data as ApiCase[];
}

export async function createCase(payload: CreateCasePayload) {
  const { data } = await api.post("/cases", payload);
  return data as ApiCase;
}

export async function updateCase(caseId: number, payload: UpdateCasePayload) {
  const { data } = await api.put(`/cases/${caseId}`, payload);
  return data as ApiCase;
}

export async function deleteCase(caseId: number) {
  const { data } = await api.delete(`/cases/${caseId}`);
  return data as { status: string; id: number };
}

export async function listWallets(organizationId?: number) {
  const params = organizationId ? { organization_id: organizationId } : undefined;
  const { data } = await api.get("/wallets", { params });
  return data as ApiWallet[];
}

export async function createWallet(payload: CreateWalletPayload) {
  const { data } = await api.post("/wallets", payload);
  return data as ApiWallet;
}

export async function updateWallet(walletId: number, payload: UpdateWalletPayload) {
  const { data } = await api.put(`/wallets/${walletId}`, payload);
  return data as ApiWallet;
}

export async function deleteWallet(walletId: number) {
  const { data } = await api.delete(`/wallets/${walletId}`);
  return data as { status: string; id: number };
}

export async function listTeamMembers(organizationId?: number) {
  const params = organizationId ? { organization_id: organizationId } : undefined;
  const { data } = await api.get("/team-members", { params });
  return data as ApiTeamMember[];
}

export async function createTeamMember(payload: CreateTeamMemberPayload) {
  const { data } = await api.post("/team-members", payload);
  return data as ApiTeamMember;
}

export async function updateTeamMember(memberId: number, payload: UpdateTeamMemberPayload) {
  const { data } = await api.put(`/team-members/${memberId}`, payload);
  return data as ApiTeamMember;
}

export async function deleteTeamMember(memberId: number) {
  const { data } = await api.delete(`/team-members/${memberId}`);
  return data as { status: string; id: number };
}
