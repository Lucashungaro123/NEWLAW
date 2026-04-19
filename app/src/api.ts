import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { invoke, isTauri } from "@tauri-apps/api/core";

const ACCESS_KEY = "newlaw.access_token";
const REFRESH_KEY = "newlaw.refresh_token";
const USER_KEY = "newlaw.user";

export const LOCAL_API_BASE_URL = "http://127.0.0.1:8000";
const configuredBaseURL = import.meta.env.VITE_API_URL;
const runningInTauri = isTauri();
const defaultBaseURL = import.meta.env.DEV ? LOCAL_API_BASE_URL : "https://api.newlaw.app.br";
export const baseURL = configuredBaseURL || defaultBaseURL;

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  oab?: string | null;
  role: string;
  organization_id?: number | null;
  is_admin?: boolean;
  allowed_nav_keys?: string[];
};
export type AuthSession = { accessToken: string; refreshToken: string; user: AuthUser };
export type RegisterOfficePayload = {
  office_name: string;
  owner_full_name: string;
  owner_email: string;
  owner_password: string;
  owner_phone?: string;
};
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
  team_member_ids?: number[];
  team_members?: {
    id: number;
    full_name: string;
    email: string;
    team_name: string;
    role_title: string;
    is_active: boolean;
  }[];
};
export type CreateWalletPayload = {
  nickname: string;
  description?: string;
  is_active?: boolean;
  team_member_ids?: number[];
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
  is_admin?: boolean;
  allowed_nav_keys?: string[];
  is_active: boolean;
  invite_email_sent?: boolean;
  invite_token?: string;
  is_read_only?: boolean;
  is_master_account?: boolean;
  account_role?: string | null;
};

export type TeamMemberPasswordResetResult = {
  status: string;
  id: number;
  email: string;
  invite_email_sent?: boolean;
  invite_token?: string;
  invite_link?: string;
};

export type TeamMembersCapacity = {
  organization_id: number;
  plan_slug?: string | null;
  plan_name?: string | null;
  user_limit?: number | null;
  active_users: number;
  available_slots?: number | null;
};
export type CalendarProvider = "google" | "microsoft";
export type CalendarConnectionStatus = {
  provider: CalendarProvider;
  connected: boolean;
  provider_email?: string | null;
  last_synced_at?: string | null;
  sync_error?: string | null;
};
export type CalendarConnectionStart = {
  provider: CalendarProvider;
  auth_url: string;
  state: string;
  expires_in_seconds: number;
};
export type AgendaItemKind = "deadline" | "meeting";
export type InternalAgendaEventType = "deadline" | "meeting" | "hearing" | "audit";
export type AgendaItem = {
  id: string;
  entity_id: number;
  kind: AgendaItemKind;
  source: string;
  title: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  location?: string | null;
  meeting_url?: string | null;
  reference?: string | null;
  description?: string | null;
  status?: string | null;
  event_type?: InternalAgendaEventType | null;
  assignee_name?: string | null;
  assignees?: string | null;
  publication_source_key?: string | null;
  publication_process_number?: string | null;
  publication_detail_url?: string | null;
  created_via?: string | null;
};
export type CreateAgendaDeadlinePayload = {
  title: string;
  due_date: string;
  reference?: string;
  notes?: string;
  event_type?: InternalAgendaEventType;
  meeting_url?: string;
  assignees?: string;
  end_time?: string;
  is_all_day?: boolean;
};
export type FinanceEntryType = "receita" | "despesa";
export type FinancePaymentMethod = "" | "pix" | "boleto" | "cartao" | "dinheiro" | "transferencia";
export type FinanceRecurring = "nao-recorrente" | "mensal" | "anual" | "personalizado";
export type ApiFinanceEntry = {
  id: number;
  organization_id: number;
  created_by_user_id?: number | null;
  entry_type: FinanceEntryType;
  category: string;
  client_id?: number | null;
  case_id?: number | null;
  client_name?: string | null;
  case_number?: string | null;
  amount: number;
  due_date: string;
  payment_date?: string | null;
  payment_method?: Exclude<FinancePaymentMethod, ""> | null;
  expense_type?: string | null;
  recurring?: FinanceRecurring | null;
  paid_amount?: number | null;
  installments?: number | null;
  attachment_name?: string | null;
};
export type ApiClientDocument = {
  id: number;
  organization_id?: number | null;
  client_id: number;
  case_id?: number | null;
  folder_label: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
};
export type PublicationAutomationRecord = {
  id: number;
  title: string;
  publication_date: string;
  client_name?: string | null;
  case_number?: string | null;
  matched_via?: "document" | "case_number" | null;
  created_at: string;
};
export type TodayPublicationItem = {
  id: number;
  hash: string;
  title: string;
  publication_date: string;
  tribunal?: string | null;
  court_name?: string | null;
  process_number?: string | null;
  communication_type?: string | null;
  detail_url: string;
  summary?: string | null;
};
export type TodayPublicationsResponse = {
  member_name: string;
  member_email: string;
  oab: string;
  publication_date: string;
  count: number;
  items: TodayPublicationItem[];
};
export type PublicationHandlingStatus = "task_created" | "read_no_action";
export type PublicationResponsibleOption = {
  name: string;
  email: string;
};
export type PublicationContextRequestItem = {
  source_key: string;
  process_number?: string | null;
};
export type PublicationContextItem = {
  source_key: string;
  status?: PublicationHandlingStatus | null;
  handled_at?: string | null;
  has_registered_case: boolean;
  case_id?: number | null;
  case_number?: string | null;
  wallet_id?: number | null;
  wallet_name?: string | null;
  allow_additional_responsibles: boolean;
  allowed_responsibles: PublicationResponsibleOption[];
  warning?: string | null;
};
export type PublicationContextResponse = {
  items: PublicationContextItem[];
};
export type HandlePublicationPayload = {
  source_key: string;
  publication_title: string;
  publication_date: string;
  process_number?: string;
  detail_url: string;
  summary?: string;
  action: PublicationHandlingStatus;
  task_title?: string;
  task_details?: string;
  due_date?: string;
  responsible_emails?: string[];
  include_actor_responsible?: boolean;
  allow_office_wide_responsibles?: boolean;
};
export type HandlePublicationResponse = {
  source_key: string;
  status: PublicationHandlingStatus;
  handled_at: string;
  created_agenda_items: number;
  message: string;
};
export type PublicationSearchByOabPayload = {
  oab_number: string;
  oab_uf: string;
  member_name: string;
  member_email: string;
  publication_date: string;
};
export type PublicationAutomationSettings = {
  organization_id: number;
  is_enabled: boolean;
  schedule_time: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  last_status?: "success" | "warning" | "error" | null;
  last_message?: string | null;
  last_new_records: number;
  last_existing_records: number;
  last_failed_records: number;
  is_running: boolean;
  recent_records: PublicationAutomationRecord[];
};
export type UpdatePublicationAutomationPayload = {
  is_enabled: boolean;
  schedule_time: string;
};
export type RunPublicationAutomationResponse = {
  started_at: string;
  finished_at: string;
  new_records: number;
  existing_records: number;
  failed_records: number;
  message: string;
  config: PublicationAutomationSettings;
};
export type CreateFinanceEntryPayload = {
  entry_type: FinanceEntryType;
  category: string;
  amount: number;
  due_date: string;
  client_id?: number;
  case_id?: number;
  client_name?: string;
  case_number?: string;
  payment_date?: string;
  payment_method?: Exclude<FinancePaymentMethod, "">;
  expense_type?: string;
  recurring?: FinanceRecurring;
  paid_amount?: number;
  installments?: number;
  attachment_name?: string;
  organization_id?: number;
};
export type UpdateFinanceEntryPayload = {
  payment_date?: string;
  payment_method?: Exclude<FinancePaymentMethod, "">;
  paid_amount?: number;
  organization_id?: number;
};
export type UploadClientDocumentPayload = {
  clientId: number;
  folderLabel: string;
  caseId?: number;
  file: File;
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
  is_admin?: boolean;
  allowed_nav_keys?: string[];
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
  baseURL,
  timeout: 10000
});

const desktopApi = axios.create({
  baseURL: LOCAL_API_BASE_URL,
  timeout: 10000
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

export async function registerOffice(payload: RegisterOfficePayload) {
  const { data } = await api.post("/auth/register-office", payload);
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

function buildHttpError(status: number, detail: string) {
  const error = new Error(detail) as Error & { response?: { status: number; data: { detail: string } } };
  error.response = { status, data: { detail } };
  return error;
}

const isDesktopRemoteApi =
  typeof window !== "undefined" &&
  isTauri() &&
  !baseURL.startsWith("http://127.0.0.1") &&
  !baseURL.startsWith("http://localhost");

type DeleteResponseBody = {
  detail?: string;
  status?: string;
  id?: number;
};

type DeleteResult = {
  status: string;
  id: number;
};

type TauriDeleteResponse = {
  status: number;
  body?: DeleteResponseBody;
};

async function deleteResource(path: string, failureMessage: string): Promise<DeleteResult> {
  if (isDesktopRemoteApi) {
    const executeDeleteViaTauri = async (token: string | null) => {
      if (!token) return { unauthorized: true as const };
      try {
        const response = await invoke<TauriDeleteResponse>("remote_delete_with_auth", {
          url: `${baseURL}${path}`,
          bearerToken: token
        });
        if (response.status === 401) return { unauthorized: true as const };
        if (response.status < 200 || response.status >= 300) {
          throw buildHttpError(response.status, response.body?.detail || `${failureMessage} (${response.status}).`);
        }
        return response.body as DeleteResult;
      } catch (error) {
        if ((error as Error & { response?: { status: number } }).response) {
          throw error;
        }
        throw new Error((error as Error)?.message || failureMessage);
      }
    };

    const firstAttempt = await executeDeleteViaTauri(getAccessToken());
    if ("unauthorized" in firstAttempt) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        throw buildHttpError(401, "Sessão expirada. Faça login novamente.");
      }
      const secondAttempt = await executeDeleteViaTauri(newToken);
      if ("unauthorized" in secondAttempt) {
        throw buildHttpError(401, "Sessão expirada. Faça login novamente.");
      }
      return secondAttempt;
    }
    return firstAttempt;
  }

  const executeDelete = async (token: string | null) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${baseURL}${path}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: controller.signal
      });
      const rawBody = await response.text();
      let payload: DeleteResponseBody | null = null;
      if (rawBody) {
        try {
          payload = JSON.parse(rawBody) as DeleteResponseBody;
        } catch {
          payload = { detail: rawBody };
        }
      }
      if (response.status === 401) return { unauthorized: true as const };
      if (!response.ok) {
        throw buildHttpError(response.status, payload?.detail || `${failureMessage} (${response.status}).`);
      }
      return payload as DeleteResult;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        const timeoutError = new Error("timeout") as Error & { code?: string };
        timeoutError.code = "ECONNABORTED";
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const firstAttempt = await executeDelete(getAccessToken());
  if ("unauthorized" in firstAttempt) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      throw buildHttpError(401, "Sessão expirada. Faça login novamente.");
    }
    const secondAttempt = await executeDelete(newToken);
    if ("unauthorized" in secondAttempt) {
      throw buildHttpError(401, "Sessão expirada. Faça login novamente.");
    }
    return secondAttempt;
  }
  return firstAttempt;
}

export async function deleteCase(caseId: number) {
  return deleteResource(`/cases/${caseId}`, "Falha ao excluir processo.");
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

export async function listTeamMembers(organizationId?: number, options?: { includeMasterAccounts?: boolean }) {
  const params: Record<string, unknown> = {};
  if (typeof organizationId === "number") {
    params.organization_id = organizationId;
  }
  if (options?.includeMasterAccounts) {
    params.include_master_accounts = true;
  }
  const { data } = await api.get("/team-members", { params });
  return data as ApiTeamMember[];
}

export async function getTeamMembersCapacity(organizationId?: number) {
  const params = organizationId ? { organization_id: organizationId } : undefined;
  const { data } = await api.get("/team-members/capacity", { params });
  return data as TeamMembersCapacity;
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
  return deleteResource(`/team-members/${memberId}`, "Falha ao excluir membro da equipe.");
}

export async function resetTeamMemberPassword(memberId: number) {
  const { data } = await api.post(`/team-members/${memberId}/password-reset`);
  return data as TeamMemberPasswordResetResult;
}

export async function listCalendarConnections() {
  const { data } = await api.get("/calendar/connections");
  return data as CalendarConnectionStatus[];
}

export async function startCalendarConnection(provider: CalendarProvider) {
  const { data } = await api.post(`/calendar/connections/${provider}/start`);
  return data as CalendarConnectionStart;
}

export async function syncCalendarConnection(provider: CalendarProvider) {
  const { data } = await api.post(`/calendar/connections/${provider}/sync`);
  return data as { provider: CalendarProvider; synced_events: number; last_synced_at: string };
}

export async function disconnectCalendarConnection(provider: CalendarProvider) {
  const { data } = await api.delete(`/calendar/connections/${provider}`);
  return data as { status: string; provider: CalendarProvider };
}

export async function listAgendaEvents(params?: { start?: string; end?: string; refresh_external?: boolean }) {
  const { data } = await api.get("/agenda/events", { params });
  return data as AgendaItem[];
}

export async function listAgendaDeadlines() {
  const { data } = await api.get("/agenda/deadlines");
  return data as AgendaItem[];
}

export async function createAgendaDeadline(payload: CreateAgendaDeadlinePayload) {
  const { data } = await api.post("/agenda/deadlines", payload);
  return data as AgendaItem;
}

export async function deleteAgendaDeadline(deadlineId: number) {
  const { data } = await api.delete(`/agenda/deadlines/${deadlineId}`);
  return data as { status: string; id: number };
}

export async function listFinanceEntries(organizationId?: number) {
  const params = organizationId ? { organization_id: organizationId } : undefined;
  const { data } = await api.get("/finance/entries", { params });
  return data as ApiFinanceEntry[];
}

export async function createFinanceEntry(payload: CreateFinanceEntryPayload) {
  const { data } = await api.post("/finance/entries", payload);
  return data as ApiFinanceEntry;
}

export async function updateFinanceEntry(entryId: number, payload: UpdateFinanceEntryPayload) {
  const { data } = await api.patch(`/finance/entries/${entryId}`, payload);
  return data as ApiFinanceEntry;
}

export async function deleteFinanceEntry(entryId: number) {
  const { data } = await api.delete(`/finance/entries/${entryId}`);
  return data as { status: string; id: number };
}

export async function listClientDocuments(clientId: number, caseId?: number) {
  const params = caseId ? { client_id: clientId, case_id: caseId } : { client_id: clientId };
  const { data } = await api.get("/files/documents", { params });
  return data as ApiClientDocument[];
}

export async function uploadClientDocument(payload: UploadClientDocumentPayload) {
  const formData = new FormData();
  formData.append("client_id", String(payload.clientId));
  formData.append("folder_label", payload.folderLabel);
  if (payload.caseId) {
    formData.append("case_id", String(payload.caseId));
  }
  formData.append("file", payload.file);
  const { data } = await api.post("/files/documents", formData);
  return data as ApiClientDocument;
}

export async function deleteClientDocument(documentId: number) {
  const { data } = await api.delete(`/files/documents/${documentId}`);
  return data as { status: string; id: number };
}

export async function downloadClientDocument(documentId: number) {
  const { data } = await api.get(`/files/documents/${documentId}/download`, {
    responseType: "blob"
  });
  return data as Blob;
}

export async function getPublicationAutomationSettings() {
  const { data } = await api.get("/publications/automation");
  return data as PublicationAutomationSettings;
}

export async function getTodayPublications(publicationDate?: string) {
  const { data } = await api.get("/publications/today", {
    params: publicationDate ? { publication_date: publicationDate } : undefined,
    timeout: 120000
  });
  return data as TodayPublicationsResponse;
}

export async function searchPublicationsByOabLocally(payload: PublicationSearchByOabPayload) {
  const { data } = await desktopApi.post("/publications/search-by-oab", payload, {
    timeout: 120000
  });
  return data as TodayPublicationsResponse;
}

export async function getPublicationContext(payload: { items: PublicationContextRequestItem[] }) {
  const { data } = await api.post("/publications/context", payload, {
    timeout: 120000
  });
  return data as PublicationContextResponse;
}

export async function handlePublication(payload: HandlePublicationPayload) {
  const { data } = await api.post("/publications/handle", payload, {
    timeout: 120000
  });
  return data as HandlePublicationResponse;
}

export async function updatePublicationAutomationSettings(payload: UpdatePublicationAutomationPayload) {
  const { data } = await api.put("/publications/automation", payload);
  return data as PublicationAutomationSettings;
}

export async function runPublicationAutomationNow() {
  const { data } = await api.post("/publications/automation/run", undefined, {
    timeout: 120000
  });
  return data as RunPublicationAutomationResponse;
}
