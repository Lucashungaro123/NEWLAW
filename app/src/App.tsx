import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  AgendaItem,
  AuthUser,
  ApiCase,
  ApiCaseClosing,
  ApiCaseClosingObligation,
  ApiClient,
  ApiClientDocument,
  ApiFinanceEntry,
  ApiServiceIntake,
  ApiTeamMember,
  ApiWallet,
  CalendarConnectionStatus,
  CalendarProvider,
  InternalAgendaEventType,
  JurisprudenceSearchResponse,
  LOCAL_API_BASE_URL,
  PublicationContextItem,
  PublicationHandlingStatus,
  PublicationAutomationRecord,
  PublicationAutomationSettings,
  TodayPublicationItem,
  TodayPublicationsResponse,
  TeamMembersCapacity,
  baseURL,
  createAgendaDeadline as apiCreateAgendaDeadline,
  createServiceIntake as apiCreateServiceIntake,
  deleteClientDocument as apiDeleteClientDocument,
  createFinanceEntry as apiCreateFinanceEntry,
  createTeamMember as apiCreateTeamMember,
  createWallet as apiCreateWallet,
  deleteServiceIntake as apiDeleteServiceIntake,
  downloadClientDocument as apiDownloadClientDocument,
  clearAuthSession,
  createCase as apiCreateCase,
  createClient as apiCreateClient,
  deleteAgendaDeadline as apiDeleteAgendaDeadline,
  deleteTeamMember as apiDeleteTeamMember,
  deleteCase as apiDeleteCase,
  deleteClient as apiDeleteClient,
  deleteFinanceEntry as apiDeleteFinanceEntry,
  disconnectCalendarConnection as apiDisconnectCalendarConnection,
  getPublicationContext as apiGetPublicationContext,
  getTeamMembersCapacity as apiGetTeamMembersCapacity,
  getPublicationAutomationSettings as apiGetPublicationAutomationSettings,
  getTodayPublications as apiGetTodayPublications,
  handlePublication as apiHandlePublication,
  listAgendaEvents as apiListAgendaEvents,
  listCalendarConnections as apiListCalendarConnections,
  listClientDocuments as apiListClientDocuments,
  listFinanceEntries as apiListFinanceEntries,
  listCases as apiListCases,
  listClients as apiListClients,
  listServiceIntakes as apiListServiceIntakes,
  listTeamMembers as apiListTeamMembers,
  listWallets as apiListWallets,
  login as apiLogin,
  startCalendarConnection as apiStartCalendarConnection,
  syncCalendarConnection as apiSyncCalendarConnection,
  uploadClientDocument as apiUploadClientDocument,
  updateTeamMember as apiUpdateTeamMember,
  updateCase as apiUpdateCase,
  updateClient as apiUpdateClient,
  updateFinanceEntry as apiUpdateFinanceEntry,
  updateWallet as apiUpdateWallet,
  loadAuthSession,
  logout as apiLogout,
  ping,
  resetTeamMemberPassword as apiResetTeamMemberPassword,
  saveCaseClosing as apiSaveCaseClosing,
  saveAuthSession,
  me as apiMe,
  updateAgendaDeadline as apiUpdateAgendaDeadline,
  updateServiceIntake as apiUpdateServiceIntake,
  updatePublicationAutomationSettings as apiUpdatePublicationAutomationSettings,
  searchJurisprudenceStats as apiSearchJurisprudenceStats
} from "./api";
import { NavKey } from "./types";

type ClientKind = "PF" | "PJ";
type ClientRow = {
  id: number;
  name: string;
  phone: string;
  phone2?: string;
  email: string;
  city: string;
  document: string;
  kind: ClientKind;
};
type ServiceIntakeFormState = {
  leadName: string;
  document: string;
  email: string;
  phone: string;
  legalArea: string;
  referralSource: string;
  meetingDate: string;
  meetingTime: string;
  meetingMode: string;
  summary: string;
  processOverview: string;
  nextSteps: string;
  agreedFee: string;
  paymentTerms: string;
  handledByName: string;
  status: ApiServiceIntake["status"];
};
type ThemeMode = "dark" | "light";
type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "installing" | "installed" | "up-to-date" | "error" | "unavailable";
type CalendarAuthLinkState = {
  provider: CalendarProvider;
  url: string;
};
type FileFolderNodeKind = "client-folder" | "case-folder" | "case-section";
type FileFolderNode = {
  id: string;
  label: string;
  note?: string;
  kind: FileFolderNodeKind;
  children?: FileFolderNode[];
};
type ClientFileTree = {
  client: ApiClient;
  kind: ClientKind;
  cases: ApiCase[];
  nodes: FileFolderNode[];
  totalFolders: number;
  searchText: string;
};
type FilesFolderTarget =
  | { scope: "client"; folderLabel: string }
  | { scope: "case"; caseId: number; folderLabel: string };

const textScaleOptions = [
  { label: "Pequeno", value: 0.98, previewSize: 12 },
  { label: "Médio", value: 1.02, previewSize: 13 },
  { label: "Grande", value: 1.06, previewSize: 14 }
] as const;

const filesAllowedUploadExtensions = [".pdf", ".doc", ".docx"];
const filesAllowedUploadMimeTypes = [
  "application/pdf",
  "application/x-pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/octet-stream"
];

const brazilUfOptions = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO"
] as const;

const clampTextScaleIndex = (value: number) => Math.min(Math.max(value, 0), textScaleOptions.length - 1);

const navItems: { key: NavKey; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "dashboard", label: "Dashboard" },
  { key: "cases", label: "Processos" },
  { key: "wallets", label: "Carteiras" },
  { key: "people", label: "Pessoas" },
  { key: "team", label: "Equipe" },
  { key: "agenda", label: "Agenda" },
  { key: "finance", label: "Financeiro" },
  { key: "service", label: "Atendimento" },
  { key: "stats", label: "Estatísticas" },
  { key: "official", label: "Publicações" },
  { key: "progress", label: "Andamentos" },
  { key: "files", label: "Arquivos" },
  { key: "settings", label: "Configurações" }
];

const navPermissionOptions = navItems.map((item) => ({ key: item.key, label: item.label }));
const defaultMemberNavKeys = navPermissionOptions.map((item) => item.key);
const adminRequiredNavKeys: NavKey[] = ["team", "wallets"];
const MASTER_OFFICE_NAME = "NEWLAW";
const PROFILE_STORAGE_KEY_PREFIX = "newlaw-profile-preferences";
const profilePhotoMaxSizeBytes = 2 * 1024 * 1024;
const supportedProfilePhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const supportedProfilePhotoExtensions = [".jpg", ".jpeg", ".png", ".webp"];

type UserProfilePreferences = {
  avatarDataUrl: string;
  displayName: string;
  roleLabel: string;
  phone: string;
  bio: string;
};

const buildDefaultProfilePreferences = (user: AuthUser | null): UserProfilePreferences => ({
  avatarDataUrl: "",
  displayName: user?.name?.trim() || "",
  roleLabel: "Login master",
  phone: user?.phone?.trim() || "",
  bio: ""
});

const normalizeProfilePreferences = (
  value: Partial<UserProfilePreferences> | null | undefined,
  user: AuthUser | null
): UserProfilePreferences => {
  const defaults = buildDefaultProfilePreferences(user);
  const hasField = (field: keyof UserProfilePreferences) => Object.prototype.hasOwnProperty.call(value ?? {}, field);
  return {
    avatarDataUrl:
      typeof value?.avatarDataUrl === "string" && value.avatarDataUrl.startsWith("data:image/")
        ? value.avatarDataUrl
        : "",
    displayName: hasField("displayName") && typeof value?.displayName === "string" ? value.displayName.slice(0, 60) : defaults.displayName,
    roleLabel: typeof value?.roleLabel === "string" && value.roleLabel.trim() ? value.roleLabel.trim() : defaults.roleLabel,
    phone: hasField("phone") && typeof value?.phone === "string" ? value.phone.slice(0, 32) : defaults.phone,
    bio: hasField("bio") && typeof value?.bio === "string" ? value.bio.slice(0, 220) : defaults.bio
  };
};

const getProfileStorageKey = (user: AuthUser | null) => {
  const identity = user?.id != null ? String(user.id) : user?.email?.trim().toLowerCase();
  return identity ? `${PROFILE_STORAGE_KEY_PREFIX}:${identity}` : "";
};

const loadStoredProfilePreferences = (user: AuthUser | null): UserProfilePreferences => {
  if (typeof window === "undefined") return buildDefaultProfilePreferences(user);
  const storageKey = getProfileStorageKey(user);
  if (!storageKey) return buildDefaultProfilePreferences(user);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return buildDefaultProfilePreferences(user);
    return normalizeProfilePreferences(JSON.parse(raw) as Partial<UserProfilePreferences>, user);
  } catch {
    return buildDefaultProfilePreferences(user);
  }
};

const hasStoredProfilePhonePreference = (user: AuthUser | null) => {
  if (typeof window === "undefined") return false;
  const storageKey = getProfileStorageKey(user);
  if (!storageKey) return false;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return false;
    const value = JSON.parse(raw) as Partial<UserProfilePreferences>;
    return Object.prototype.hasOwnProperty.call(value, "phone");
  } catch {
    return false;
  }
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Não foi possível carregar a imagem."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível carregar a imagem."));
    reader.readAsDataURL(file);
  });

const navIconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

const navIcons: Record<NavKey, JSX.Element> = {
  home: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  ),
  dashboard: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  people: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
    </svg>
  ),
  cases: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </svg>
  ),
  wallets: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h6" />
    </svg>
  ),
  finance: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h3" />
    </svg>
  ),
  templates: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  ),
  agenda: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 10h18" />
    </svg>
  ),
  team: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2 20c0-3 2.7-5.5 6-5.5" />
      <path d="M22 20c0-3-2.7-5.5-6-5.5" />
      <path d="M7 20c0-3.4 3-6.5 5-6.5s5 3.1 5 6.5" />
    </svg>
  ),
  billing: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <path d="M6 2h12a2 2 0 0 1 2 2v18l-4-2-4 2-4-2-4 2V4a2 2 0 0 1 2-2z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </svg>
  ),
  service: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 16 0" />
      <rect x="3" y="12" width="4" height="6" rx="2" />
      <rect x="17" y="12" width="4" height="6" rx="2" />
      <path d="M12 18v2a2 2 0 0 1-2 2H8" />
    </svg>
  ),
  stats: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <path d="M3 20h18" />
      <polyline points="3 16 9 10 13 14 21 6" />
    </svg>
  ),
  official: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h6" />
      <path d="M7 12h6" />
      <path d="M15 8h4" />
      <path d="M15 12h4" />
    </svg>
  ),
  progress: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M14 4h6v6" />
    </svg>
  ),
  files: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
  settings: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  )
};

const professions = [
  "Advogado",
  "Advogado Trabalhista",
  "Advogado Tributário",
  "Advogado Empresarial",
  "Advogado Criminal",
  "Juiz",
  "Promotor",
  "Defensor Público",
  "Administrador",
  "Contador",
  "Economista",
  "Analista Financeiro",
  "Analista de Crédito",
  "Consultor Financeiro",
  "Gestor de Projetos",
  "Gestor de RH",
  "Assistente Social",
  "Analista de Sistemas",
  "Desenvolvedor Front-end",
  "Desenvolvedor Back-end",
  "Engenheiro de Software",
  "Analista de Dados",
  "Cientista de Dados",
  "Analista de BI",
  "Engenheiro de Dados",
  "Tester/QA",
  "Suporte Técnico",
  "Técnico em Informática",
  "Designer Gráfico",
  "Designer de Produto",
  "UX Designer",
  "UI Designer",
  "Arquiteto",
  "Engenheiro Civil",
  "Engenheiro Eletricista",
  "Engenheiro Mecânico",
  "Engenheiro de Produção",
  "Engenheiro Químico",
  "Engenheiro Ambiental",
  "Engenheiro Agrônomo",
  "Engenheiro de Manutenção",
  "Mestre de Obras",
  "Pedreiro",
  "Carpinteiro",
  "Pintor",
  "Serralheiro",
  "Marceneiro",
  "Encanador",
  "Eletricista",
  "Técnico de Manutenção",
  "Técnico de Segurança do Trabalho",
  "Operador de Máquina",
  "Operador de Caixa",
  "Estoquista",
  "Almoxarife",
  "Analista de Logística",
  "Logístico",
  "Motorista",
  "Caminhoneiro",
  "Motorista de Aplicativo",
  "Piloto de Avião",
  "Comissário de Bordo",
  "Bombeiro",
  "Policial Militar",
  "Policial Civil",
  "Militar",
  "Professor",
  "Professor Universitário",
  "Bibliotecário",
  "Jornalista",
  "Publicitário",
  "Relações Públicas",
  "Social Media",
  "Influencer",
  "Produtor Cultural",
  "Ator",
  "Músico",
  "Fotógrafo",
  "Cinegrafista",
  "Editor de Vídeo",
  "Chef de Cozinha",
  "Cozinheiro",
  "Garçom",
  "Bartender",
  "Padeiro",
  "Confeiteiro",
  "Sommelier",
  "Recepcionista",
  "Secretária",
  "Vendedor",
  "Representante Comercial",
  "Supervisor Comercial",
  "Gerente Comercial",
  "Atendente de Call Center",
  "Operador de Telemarketing",
  "Corretor de Imóveis",
  "Corretor de Seguros",
  "Bancário",
  "Produtor Rural",
  "Agrônomo",
  "Técnico Agrícola",
  "Veterinário",
  "Médico Clínico",
  "Médico Pediatra",
  "Médico Ortopedista",
  "Enfermeiro",
  "Técnico de Enfermagem",
  "Psicólogo",
  "Dentista",
  "Farmacêutico",
  "Fisioterapeuta",
  "Nutricionista",
  "Fonoaudiólogo",
  "Terapeuta Ocupacional",
  "Biólogo",
  "Químico",
  "Físico",
  "Consultor Empresarial",
  "Consultor Jurídico",
  "Analista de Mercado",
  "Analista de Suprimentos"
];

type ClientForm = {
  kind: ClientKind;
  name: string;
  tradeName: string;
  phone1: string;
  phone2: string;
  email: string;
  cpf: string;
  rg: string;
  cnpj: string;
  birth: string;
  gender: string;
  marital: string;
  job: string;
  cep: string;
  city: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  state: string;
  notes: string;
};

const emptyClientForm: ClientForm = {
  kind: "PF",
  name: "",
  tradeName: "",
  phone1: "",
  phone2: "",
  email: "",
  cpf: "",
  rg: "",
  cnpj: "",
  birth: "",
  gender: "",
  marital: "",
  job: "",
  cep: "",
  city: "",
  address: "",
  number: "",
  complement: "",
  neighborhood: "",
  state: "",
  notes: ""
};

const normalizeCpfDigits = (value: string) => value.replace(/\D/g, "").slice(0, 11);

const formatCpf = (value: string) => {
  const digits = normalizeCpfDigits(value);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 11)];
  if (digits.length <= 3) return parts[0];
  if (digits.length <= 6) return `${parts[0]}.${parts[1]}`;
  if (digits.length <= 9) return `${parts[0]}.${parts[1]}.${parts[2]}`;
  return `${parts[0]}.${parts[1]}.${parts[2]}-${parts[3]}`;
};

const formatCpfFromDigits = (value: string) => formatCpf(value.replace(/\D/g, ""));

const calculateCpfCheckDigit = (digits: string, factor: number) => {
  const total = digits
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * (factor - index), 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

const isValidCpf = (value: string) => {
  const digits = normalizeCpfDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const firstDigit = calculateCpfCheckDigit(digits.slice(0, 9), 10);
  const secondDigit = calculateCpfCheckDigit(digits.slice(0, 10), 11);
  return digits === `${digits.slice(0, 9)}${firstDigit}${secondDigit}`;
};

const normalizeCnpjDigits = (value: string) => value.replace(/\D/g, "").slice(0, 14);

const formatCnpj = (value: string) => {
  const digits = normalizeCnpjDigits(value);
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 5),
    digits.slice(5, 8),
    digits.slice(8, 12),
    digits.slice(12, 14)
  ];
  if (digits.length <= 2) return parts[0];
  if (digits.length <= 5) return `${parts[0]}.${parts[1]}`;
  if (digits.length <= 8) return `${parts[0]}.${parts[1]}.${parts[2]}`;
  if (digits.length <= 12) return `${parts[0]}.${parts[1]}.${parts[2]}/${parts[3]}`;
  return `${parts[0]}.${parts[1]}.${parts[2]}/${parts[3]}-${parts[4]}`;
};

const calculateCnpjCheckDigit = (digits: string) => {
  const weights = digits.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const total = digits.split("").reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};

const isValidCnpj = (value: string) => {
  const digits = normalizeCnpjDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const firstDigit = calculateCnpjCheckDigit(digits.slice(0, 12));
  const secondDigit = calculateCnpjCheckDigit(`${digits.slice(0, 12)}${firstDigit}`);
  return digits === `${digits.slice(0, 12)}${firstDigit}${secondDigit}`;
};

const emptyCaseForm = {
  process: "",
  walletId: "",
  court: "",
  region: "",
  associated: "",
  counterparty: "",
  counterLawyer: "",
  oab: "",
  contact: "",
  notes: ""
};

type CaseForm = typeof emptyCaseForm;
const caseNumberPattern = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;
const isLocalApiBaseUrl = (url: string) => url.startsWith(LOCAL_API_BASE_URL) || url.startsWith("http://localhost");

const formatCaseNumber = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 20);
  const parts = [
    digits.slice(0, 7),
    digits.slice(7, 9),
    digits.slice(9, 13),
    digits.slice(13, 14),
    digits.slice(14, 16),
    digits.slice(16, 20)
  ];
  let formatted = parts[0];
  if (digits.length > 7) formatted += `-${parts[1]}`;
  if (digits.length > 9) formatted += `.${parts[2]}`;
  if (digits.length > 13) formatted += `.${parts[3]}`;
  if (digits.length > 14) formatted += `.${parts[4]}`;
  if (digits.length > 16) formatted += `.${parts[5]}`;
  return formatted;
};

const isCompleteCaseNumber = (value: string) => caseNumberPattern.test(formatCaseNumber(value));
const formatCounterparty = (value: string) => value.toUpperCase().replace(/[^A-ZÀ-Ÿ0-9\s]/g, "");
const formatCourtOrRegion = (value: string) => value.toLocaleUpperCase("pt-BR");

const getCaseFormValidationMessage = (form: CaseForm) => {
  if (!isCompleteCaseNumber(form.process)) {
    return "Informe o número completo do processo no padrão 0000000-00.0000.0.00.0000.";
  }
  if (!form.walletId) {
    return "Selecione uma carteira para vincular o processo.";
  }
  if (!form.court.trim()) {
    return "Informe a vara do processo.";
  }
  if (!form.region.trim()) {
    return "Informe a comarca do processo.";
  }
  return "";
};

const getClientFormValidationMessage = (form: ClientForm) => {
  if (!form.name.trim()) {
    return form.kind === "PF" ? "Informe o nome completo do cliente." : "Informe a razão social do cliente.";
  }
  if (form.kind === "PF") {
    if (!form.cpf.trim()) {
      return "Informe o CPF do cliente.";
    }
    if (!isValidCpf(form.cpf)) {
      return "Informe um CPF válido.";
    }
    return "";
  }
  if (!form.cnpj.trim()) {
    return "Informe o CNPJ do cliente.";
  }
  if (!isValidCnpj(form.cnpj)) {
    return "Informe um CNPJ válido.";
  }
  return "";
};

type FinanceEntryType = "receita" | "despesa";
type FinancePaymentMethod = "" | "pix" | "boleto" | "cartao" | "dinheiro" | "transferencia";
type FinanceStatus = "Pago" | "A vencer" | "Vencido" | "Parcial";
type FinanceRecurring = "nao-recorrente" | "mensal" | "anual" | "personalizado";
type FinancePeriodFilter = "this-month" | "this-week" | "overdue" | "all";
type FinanceChartView = "year" | "month";

type RevenueForm = {
  category: string;
  clientId: string;
  caseId: string;
  amount: string;
  dueDate: string;
  paymentDate: string;
  paymentMethod: FinancePaymentMethod;
  attachmentName: string;
};

type ExpenseForm = {
  expenseType: string;
  category: string;
  amount: string;
  dueDate: string;
  recurring: FinanceRecurring;
  client: string;
  process: string;
  paidAmount: string;
  installments: string;
  attachmentName: string;
};

type FinanceSettlementForm = {
  paymentDate: string;
  paymentMethod: FinancePaymentMethod;
  paidAmount: string;
};

type FinanceEntry = {
  id: number;
  entryType: FinanceEntryType;
  category: string;
  clientId?: number;
  caseId?: number;
  client: string;
  process: string;
  amount: number;
  dueDate: string;
  paymentDate?: string;
  paymentMethod?: FinancePaymentMethod;
  expenseType?: string;
  recurring?: FinanceRecurring;
  paidAmount?: number;
  installments?: number;
  attachmentName?: string;
};

type FinanceChartDrilldown = {
  key: string;
  label: string;
  kind: "month" | "day";
  year: number;
  month: number;
  day?: number;
};

type FinanceComparisonChartItem = {
  key: string;
  label: string;
  tooltipLabel: string;
  expected: number;
  received: number;
  expense: number;
  result: number;
  drilldown: FinanceChartDrilldown;
};

type FinanceChartHoverState = {
  item: FinanceComparisonChartItem;
  index: number;
};

const revenueCategories = [
  "Honorários contratuais",
  "Honorários de sucumbência",
  "Honorários de êxito (%)",
  "Precatórios",
  "Alvarás",
  "RPVS",
  "Consultoria",
  "Reembolso de custo",
  "Multa e juros"
];

const expenseTypes = ["Variável", "Fixa", "Investimento", "Tributária"];

const expenseCategories = [
  "Honorários de associados",
  "Salário funcionários",
  "Anuidade OAB",
  "Energia",
  "Aluguel",
  "IPTU",
  "Simples nacional",
  "Telefonia",
  "Condomínio",
  "Internet",
  "Água",
  "Cursos",
  "Limpeza",
  "Manutenção",
  "Custas processuais",
  "Deslocamento",
  "Correspondente jurídico",
  "Taxas judiciais",
  "Diligência",
  "Assinatura digital",
  "Marketing",
  "Eletrônicos",
  "Equipamentos",
  "Outros"
];

const recurringOptions: { value: FinanceRecurring; label: string }[] = [
  { value: "nao-recorrente", label: "Não recorrente" },
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
  { value: "personalizado", label: "Personalizado" }
];

const paymentMethodOptions: { value: Exclude<FinancePaymentMethod, "">; label: string }[] = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao", label: "Cartão" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" }
];

const paymentMethodLabels: Record<Exclude<FinancePaymentMethod, "">, string> = {
  pix: "PIX",
  boleto: "Boleto",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência"
};

const emptyRevenueForm: RevenueForm = {
  category: "",
  clientId: "",
  caseId: "",
  amount: "",
  dueDate: "",
  paymentDate: "",
  paymentMethod: "",
  attachmentName: ""
};

const emptyExpenseForm: ExpenseForm = {
  expenseType: "",
  category: "",
  amount: "",
  dueDate: "",
  recurring: "nao-recorrente",
  client: "",
  process: "",
  paidAmount: "",
  installments: "1",
  attachmentName: ""
};

const emptyFinanceSettlementForm: FinanceSettlementForm = {
  paymentDate: "",
  paymentMethod: "",
  paidAmount: ""
};

const financeMonths = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const financeMonthOptions = financeMonths.map((shortLabel, index) => {
  const baseDate = new Date(2026, index, 1);
  const fullLabel = baseDate.toLocaleDateString("pt-BR", { month: "long" });
  return {
    value: index,
    shortLabel,
    label: fullLabel.charAt(0).toUpperCase() + fullLabel.slice(1)
  };
});
const financeChartViewOptions: { value: FinanceChartView; label: string }[] = [
  { value: "year", label: "Ano" },
  { value: "month", label: "Mês" }
];
const financePeriodOptions: { value: FinancePeriodFilter; label: string }[] = [
  { value: "this-month", label: "Este mês" },
  { value: "this-week", label: "Esta semana" },
  { value: "overdue", label: "Vencidos" },
  { value: "all", label: "Todos" }
];
const financeStatusOptions: Array<FinanceStatus | "todos"> = ["todos", "Pago", "A vencer", "Vencido", "Parcial"];
const clientDocumentMaxSizeBytes = 10 * 1024 * 1024;
const processFolderBlueprint = [
  { label: "Petições", note: "Iniciais, intermediárias, recursos e manifestações" },
  { label: "Andamentos", note: "Movimentações, publicações e intimações" },
  { label: "Decisões e Sentenças", note: "Despachos, decisões interlocutórias e sentenças" },
  { label: "Provas e Documentos", note: "Documentos anexados, laudos e evidências" },
  { label: "Audiências", note: "Atas, pautas e gravações" },
  { label: "Financeiro", note: "Custas, honorários, guias e comprovantes" },
  { label: "Acordos e Encerramento", note: "Minutas, termos finais e baixa do caso" }
] as const;

const getClientFolderBlueprint = (kind: ClientKind) => [
  { label: "Dados", note: "Cadastro, contatos, observações e documentos de identificação" },
  {
    label: kind === "PF" ? "Documentos Pessoais" : "Documentos Societários",
    note:
      kind === "PF"
        ? "CPF, RG, comprovante de endereço e fichas cadastrais"
        : "Contrato social, CNPJ, alterações contratuais e atos societários"
  },
  { label: "Contratos e Procurações", note: "Honorários, procurações, substabelecimentos e aditivos" },
  { label: "Financeiro", note: "Notas, recibos, comprovantes e cobranças do cliente" },
  { label: "Correspondências", note: "E-mails, notificações e comunicações relevantes" }
];

const toIsoDateWithOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatDatePtBr = (value: string) => {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});
const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1
});
const axisCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});
const dateTimeFormatterPtBr = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short"
});

const formatCurrencyBRL = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value : 0);
const formatCurrencyAxis = (value: number) => {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  if (Math.abs(normalized) >= 1000) return compactCurrencyFormatter.format(normalized);
  return axisCurrencyFormatter.format(normalized);
};
const formatDateTimePtBr = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateTimeFormatterPtBr.format(parsed);
};
const formatFileSize = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
};

const getNiceChartStep = (value: number, round: boolean) => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 2.25) niceFraction = 2;
    else if (fraction < 3.75) niceFraction = 2.5;
    else if (fraction < 7.5) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
};

const buildNiceChartScale = (values: number[], tickCount = 5) => {
  const safeValues = values.filter((value) => Number.isFinite(value));
  const rawMin = safeValues.length ? Math.min(...safeValues, 0) : 0;
  const rawMax = safeValues.length ? Math.max(...safeValues, 0) : 0;

  let min = rawMin;
  let max = rawMax;

  if (min === max) {
    if (max === 0) {
      max = 1000;
    } else {
      const padding = Math.abs(max) * 0.2;
      min = Math.min(0, min - padding);
      max = max + padding;
    }
  }

  const niceRange = getNiceChartStep(max - min, false);
  const step = getNiceChartStep(niceRange / Math.max(1, tickCount - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];

  for (let current = niceMin; current <= niceMax + step * 0.5; current += step) {
    const normalized = Math.abs(current) < 1e-9 ? 0 : Number(current.toFixed(10));
    ticks.push(normalized);
  }

  const range = Math.max(step, niceMax - niceMin);
  return {
    min: niceMin,
    max: niceMax,
    step,
    range,
    ticks
  };
};

const buildSmoothChartPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }

  const slopes = Array.from({ length: points.length - 1 }, (_, index) => {
    const current = points[index];
    const next = points[index + 1];
    return (next.y - current.y) / (next.x - current.x);
  });
  const tangents = Array.from({ length: points.length }, () => 0);
  tangents[0] = slopes[0];
  tangents[points.length - 1] = slopes[slopes.length - 1];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previousSlope = slopes[index - 1];
    const nextSlope = slopes[index];
    tangents[index] = previousSlope * nextSlope <= 0 ? 0 : (previousSlope + nextSlope) / 2;
  }

  for (let index = 0; index < slopes.length; index += 1) {
    const slope = slopes[index];
    if (Math.abs(slope) < 1e-9) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const alpha = tangents[index] / slope;
    const beta = tangents[index + 1] / slope;
    const magnitude = alpha * alpha + beta * beta;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[index] = scale * alpha * slope;
      tangents[index + 1] = scale * beta * slope;
    }
  }

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const deltaX = next.x - current.x;
    const control1X = current.x + deltaX / 3;
    const control1Y = current.y + (tangents[index] * deltaX) / 3;
    const control2X = next.x - deltaX / 3;
    const control2Y = next.y - (tangents[index + 1] * deltaX) / 3;
    path += ` C ${control1X.toFixed(2)} ${control1Y.toFixed(2)} ${control2X.toFixed(2)} ${control2Y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }

  return path;
};

const parseCurrencyBRL = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
};

const formatCurrencyInputBRL = (value: string) => {
  const amount = parseCurrencyBRL(value);
  return amount ? formatCurrencyBRL(amount) : "";
};

const toDateStart = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const daysFromToday = (value: string) => {
  const date = toDateStart(value);
  if (!date) return Number.NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

const getFinanceStatus = (entry: FinanceEntry): FinanceStatus => {
  const overdue = entry.dueDate ? daysFromToday(entry.dueDate) < 0 : false;
  const paidAmount = entry.paidAmount ?? (entry.paymentDate ? entry.amount : 0);
  if (paidAmount >= entry.amount && entry.amount > 0) return "Pago";
  if (paidAmount > 0 && paidAmount < entry.amount) return "Parcial";
  return overdue ? "Vencido" : "A vencer";
};

const getFinanceSettledAmount = (entry: FinanceEntry) => {
  return entry.paidAmount ?? (entry.paymentDate ? entry.amount : 0);
};

const seedFinanceEntries: FinanceEntry[] = [];

const toFinanceEntry = (entry: ApiFinanceEntry): FinanceEntry => ({
  id: entry.id,
  entryType: entry.entry_type,
  category: entry.category,
  clientId: entry.client_id ?? undefined,
  caseId: entry.case_id ?? undefined,
  client: entry.client_name || "Não informado",
  process: entry.case_number || "",
  amount: entry.amount,
  dueDate: entry.due_date,
  paymentDate: entry.payment_date || undefined,
  paymentMethod: entry.payment_method || undefined,
  expenseType: entry.expense_type || undefined,
  recurring: entry.recurring || undefined,
  paidAmount: entry.paid_amount ?? undefined,
  installments: entry.installments ?? undefined,
  attachmentName: entry.attachment_name || undefined
});

const parseClientMetadata = (rawNotes?: string | null): Partial<ClientForm> => {
  if (!rawNotes) return {};
  try {
    const parsed = JSON.parse(rawNotes) as Partial<ClientForm>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { notes: rawNotes };
  }
};

const resolveClientKind = (document: string, metadataKind?: ClientKind): ClientKind => {
  if (metadataKind === "PF" || metadataKind === "PJ") return metadataKind;
  const digits = document.replace(/\D/g, "");
  return digits.length > 11 ? "PJ" : "PF";
};

const clientGenderOptions = ["Masculino", "Feminino"] as const;
type ClientGender = (typeof clientGenderOptions)[number] | "";
type ClientMaritalKey = "" | "single" | "married" | "divorced" | "widowed" | "stable_union";

const clientMaritalOptions: { key: Exclude<ClientMaritalKey, "">; label: string; masculine: string; feminine: string }[] = [
  { key: "single", label: "Solteiro(a)", masculine: "Solteiro", feminine: "Solteira" },
  { key: "married", label: "Casado(a)", masculine: "Casado", feminine: "Casada" },
  { key: "divorced", label: "Divorciado(a)", masculine: "Divorciado", feminine: "Divorciada" },
  { key: "widowed", label: "Viúvo(a)", masculine: "Viúvo", feminine: "Viúva" },
  { key: "stable_union", label: "União estável", masculine: "União estável", feminine: "União estável" }
];

const getClientMaritalOption = (key: ClientMaritalKey) => clientMaritalOptions.find((option) => option.key === key) || null;

const getClientGenderFromMarital = (marital: string): ClientGender => {
  if (["Solteira", "Casada", "Divorciada", "Viúva"].includes(marital)) return "Feminino";
  if (["Solteiro", "Casado", "Divorciado", "Viúvo"].includes(marital)) return "Masculino";
  return "";
};

const getClientMaritalKey = (marital: string): ClientMaritalKey => {
  const normalized = marital.trim();
  if (!normalized) return "";
  const option = clientMaritalOptions.find(
    (item) => item.masculine === normalized || item.feminine === normalized || item.label === normalized
  );
  return option?.key || "";
};

const formatClientMaritalStatus = (key: ClientMaritalKey, gender: string) => {
  const option = getClientMaritalOption(key);
  if (!option) return "";
  if (gender === "Feminino") return option.feminine;
  if (gender === "Masculino") return option.masculine;
  return option.label;
};

const getClientMaritalOptionLabel = (
  option: { label: string; masculine: string; feminine: string },
  gender: string
) => {
  if (gender === "Feminino") return option.feminine;
  if (gender === "Masculino") return option.masculine;
  return option.label;
};

const toClientForm = (client: ApiClient): ClientForm => {
  const metadata = parseClientMetadata(client.notes);
  const document = (client.document || "").trim();
  const kind = resolveClientKind(document, metadata.kind as ClientKind | undefined);
  const form: ClientForm = {
    ...emptyClientForm,
    ...metadata,
    kind,
    name: client.name || metadata.name || "",
    phone1: client.phone || metadata.phone1 || "",
    email: client.email || metadata.email || "",
    city: metadata.city || ""
  };
  if (form.kind === "PF" && !form.gender) {
    form.gender = getClientGenderFromMarital(form.marital);
  }
  if (document) {
    if (kind === "PF") {
      form.cpf = formatCpf(document);
      form.cnpj = "";
    } else {
      form.cnpj = formatCnpj(document);
      form.cpf = "";
    }
  }
  return form;
};

const buildClientNotes = (form: ClientForm) =>
  JSON.stringify({
    kind: form.kind,
    tradeName: form.tradeName.trim(),
    phone2: form.phone2.trim(),
    rg: form.rg.trim(),
    birth: form.birth.trim(),
    gender: form.gender.trim(),
    marital: form.marital.trim(),
    job: form.job.trim(),
    cep: form.cep.trim(),
    city: form.city.trim(),
    address: form.address.trim(),
    number: form.number.trim(),
    complement: form.complement.trim(),
    neighborhood: form.neighborhood.trim(),
    state: form.state.trim(),
    notes: form.notes.trim()
  });

const buildClientPayload = (form: ClientForm) => {
  const isPerson = form.kind === "PF";
  return {
    name: form.name.trim(),
    document: (isPerson ? form.cpf : form.cnpj).trim(),
    email: form.email.trim() || undefined,
    phone: form.phone1.trim() || undefined,
    notes: buildClientNotes(form)
  };
};

const toClientRow = (client: ApiClient): ClientRow => {
  const form = toClientForm(client);
  const document = (form.kind === "PF" ? form.cpf : form.cnpj).trim() || "-";
  return {
    id: client.id,
    name: form.name || "-",
    phone: form.phone1 || "-",
    email: form.email || "-",
    city: form.city || "-",
    document,
    kind: form.kind
  };
};

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const extractCaseCounterparty = (title?: string | null) => {
  const normalizedTitle = (title || "").trim();
  if (!normalizedTitle) return "";
  const [, ...rest] = normalizedTitle.split(/\s+x\s+/i);
  return rest.length ? rest.join(" x ").trim() : normalizedTitle;
};

const getCasePickerLabel = (caseItem: ApiCase) => {
  const counterparty = extractCaseCounterparty(caseItem.title) || "Parte contrária";
  return caseItem.number ? `${caseItem.number} - ${counterparty}` : counterparty;
};

const countFileNodes = (nodes: FileFolderNode[]): number =>
  nodes.reduce((total, node) => total + 1 + countFileNodes(node.children || []), 0);

const buildClientFileTree = (client: ApiClient, clientCases: ApiCase[]): ClientFileTree => {
  const kind = resolveClientKind((client.document || "").trim());
  const baseFolders = getClientFolderBlueprint(kind).map((folder) => ({
    id: `client-${client.id}-${normalizeSearchText(folder.label).replace(/\s+/g, "-")}`,
    label: folder.label,
    note: folder.note,
    kind: "client-folder" as const
  }));
  const sortedCases = [...clientCases].sort((a, b) =>
    (a.number || "").localeCompare(b.number || "", "pt-BR", { numeric: true, sensitivity: "base" })
  );
  const caseFolders = sortedCases.map((caseItem) => ({
    id: `client-${client.id}-case-${caseItem.id}`,
    label: caseItem.number ? `Processo ${caseItem.number}` : `Processo #${caseItem.id}`,
    note: [caseItem.title?.trim(), caseItem.status?.trim()].filter(Boolean).join(" · ") || "Subpastas padrão do processo",
    kind: "case-folder" as const,
    children: processFolderBlueprint.map((folder) => ({
      id: `case-${caseItem.id}-${normalizeSearchText(folder.label).replace(/\s+/g, "-")}`,
      label: folder.label,
      note: folder.note,
      kind: "case-section" as const
    }))
  }));
  const nodes = [...baseFolders, ...caseFolders];
  return {
    client,
    kind,
    cases: sortedCases,
    nodes,
    totalFolders: countFileNodes(nodes),
    searchText: normalizeSearchText(
      [client.name, client.document || ""]
        .filter(Boolean)
        .join(" ")
    )
  };
};

const extractApiErrorMessage = (err: unknown, fallback: string) => {
  const error = err as {
    response?: { status?: number; data?: { detail?: string } };
    message?: string;
    code?: string;
  };
  if (error.response?.status === 401) {
    return "Sessão expirada. Faça login novamente.";
  }
  if (error.response?.status === 405) {
    return "API no VPS desatualizada para esta operação (405). Atualize e reinicie o backend.";
  }
  if (error.response?.data?.detail) {
    return error.response.data.detail;
  }
  const raw = (error.message || "").toLowerCase();
  if (error.code === "ECONNABORTED" || raw.includes("timeout")) {
    return `Tempo esgotado ao conectar com a API (${baseURL}).`;
  }
  if (raw.includes("network") || raw.includes("failed to fetch")) {
    return `Sem conexão com a API (${baseURL}).`;
  }
  if (error.message) {
    return error.message;
  }
  return fallback;
};

const extractRuntimeErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }
  if (typeof err === "object" && err !== null) {
    try {
      const serialized = JSON.stringify(err);
      if (serialized && serialized !== "{}") {
        return `${fallback} (${serialized})`;
      }
    } catch {
      // Ignore and fallback.
    }
  }
  return fallback;
};

const normalizeNavKeys = (keys?: string[] | null): NavKey[] => {
  const valid = new Set<NavKey>(navPermissionOptions.map((item) => item.key));
  const output: NavKey[] = [];
  const seen = new Set<NavKey>();
  for (const raw of keys || []) {
    const key = raw as NavKey;
    if (!valid.has(key) || seen.has(key)) continue;
    seen.add(key);
    output.push(key);
  }
  return output;
};

const expandNavAliases = (keys: NavKey[]): NavKey[] => {
  const output = [...keys];
  if (output.includes("official") && !output.includes("progress")) {
    output.push("progress");
  }
  return output;
};

const getEffectiveAllowedNavKeys = (user: AuthUser | null): NavKey[] => {
  if (!user) return [];
  const isPlatformAdmin = user.role === "superadmin" || user.role === "owner" || user.role === "admin";
  if (isPlatformAdmin) return [...defaultMemberNavKeys];
  const keys = normalizeNavKeys(user.allowed_nav_keys);
  const base = expandNavAliases(keys.length ? [...keys] : [...defaultMemberNavKeys]);
  if (!base.includes("settings")) base.push("settings");
  if (user.is_admin) {
    for (const required of adminRequiredNavKeys) {
      if (!base.includes(required)) base.push(required);
    }
  }
  return base;
};

function StatCard({ title, value, description, badge }: { title: string; value: string; description?: string; badge?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <span>{title}</span>
      </div>
      <div className="stat-value">{value}</div>
      {description && <div className="stat-sub">{description}</div>}
      {badge && <div className="stat-badge">{badge}</div>}
    </div>
  );
}

function MiniCard({ title, cta, items }: { title: string; cta?: string; items: { label: string; note: string }[] }) {
  return (
    <div className="mini-card">
      <div className="mini-head">
        <span>{title}</span>
        {cta && <span className="mini-cta">{cta}</span>}
      </div>
      {items.map((item) => (
        <div key={item.label + item.note} className="mini-item">
          <strong>{item.label}</strong>
          <span>{item.note}</span>
        </div>
      ))}
    </div>
  );
}

function AddClientModal({
  open,
  form,
  saving,
  title,
  saveLabel,
  errorMessage,
  onChange,
  onClose,
  onSave,
  onLookupCep,
  cepError
}: {
  open: boolean;
  form: ClientForm;
  saving?: boolean;
  title?: string;
  saveLabel?: string;
  errorMessage?: string;
  onChange: (key: keyof ClientForm, value: ClientForm[keyof ClientForm]) => void;
  onClose: () => void;
  onSave: () => void;
  onLookupCep?: (cepDigits: string) => void;
  cepError?: string;
}) {
  if (!open) return null;
  const formatCep = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const handleCepChange = (value: string) => {
    onChange("cep", formatCep(value));
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatName = (value: string, kind: ClientKind) => {
    if (kind === "PF") {
      return value.replace(/[^A-Za-zÀ-ÿ\s]/g, "").toUpperCase();
    }
    return value.replace(/[^A-Za-zÀ-ÿ0-9\s.&/()-]/g, "").toUpperCase();
  };

  const formatTradeName = (value: string) => formatName(value, "PJ");

  const formatEmail = (value: string) => {
    return value.replace(/\s+/g, "").toLowerCase();
  };

  const formatBirth = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];
    if (digits.length <= 2) return parts[0];
    if (digits.length <= 4) return `${parts[0]}/${parts[1]}`;
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  };

  const formatRg = (value: string) => {
    const clean = value.replace(/[^0-9xX]/g, "").toUpperCase();
    const digits = clean.slice(0, 8);
    const check = clean.slice(8, 9);
    const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8)];
    let formatted = parts[0];
    if (digits.length > 2) formatted += `.${parts[1]}`;
    if (digits.length > 5) formatted += `.${parts[2]}`;
    if (check) formatted += `-${check}`;
    return formatted;
  };

  const emailHint = (() => {
    const domains = ["gmail.com", "hotmail.com", "outlook.com", "terra.com.br", "uol.com.br"];
    const value = form.email || "";
    const atIndex = value.indexOf("@");
    if (atIndex === -1) return { hint: "", completion: "" };
    const local = value.slice(0, atIndex);
    const domainPart = value.slice(atIndex + 1).toLowerCase();
    if (!local || !domainPart) return { hint: "", completion: "" };
    const match = domains.find((d) => d.startsWith(domainPart));
    if (match && match !== domainPart) {
      return { hint: match, completion: `${local}@${match}` };
    }
    return { hint: "", completion: "" };
  })();

  const handleNameChange = (value: string) => {
    onChange("name", formatName(value, form.kind));
  };

  const handleTradeNameChange = (value: string) => {
    onChange("tradeName", formatTradeName(value));
  };

  const handlePhoneChange = (key: "phone1" | "phone2", value: string) => {
    onChange(key, formatPhone(value));
  };

  const handleEmailChange = (value: string) => {
    onChange("email", formatEmail(value));
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (emailHint.completion && e.key === "Tab") {
      e.preventDefault();
      onChange("email", emailHint.completion);
    }
  };

  const handleBirthChange = (value: string) => {
    onChange("birth", formatBirth(value));
  };

  const handleCpfChange = (value: string) => {
    onChange("cpf", formatCpf(value));
  };

  const handleCnpjChange = (value: string) => {
    onChange("cnpj", formatCnpj(value));
  };

  const handleRgChange = (value: string) => {
    onChange("rg", formatRg(value));
  };

  const handleGenderChange = (value: ClientGender) => {
    onChange("gender", value);
    const maritalKey = getClientMaritalKey(form.marital);
    if (maritalKey) {
      onChange("marital", formatClientMaritalStatus(maritalKey, value));
    }
  };

  const handleMaritalChange = (value: ClientMaritalKey) => {
    onChange("marital", formatClientMaritalStatus(value, form.gender));
  };

  const cepDigits = (form.cep || "").replace(/\D/g, "");
  const isPerson = form.kind === "PF";
  const maritalKey = getClientMaritalKey(form.marital);
  const validationMessage = getClientFormValidationMessage(form);
  const cpfInvalid = isPerson && form.cpf.trim().length > 0 && !isValidCpf(form.cpf);
  const cnpjInvalid = !isPerson && form.cnpj.trim().length > 0 && !isValidCnpj(form.cnpj);
  const requiredLabel = isPerson ? "Nome completo e CPF" : "Razão social e CNPJ";

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <h2 className="modal-title">{title || "Cadastrar novo cliente"}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="client-kind-switch" role="tablist" aria-label="Tipo de cadastro">
          <button
            type="button"
            className={`client-kind-btn ${form.kind === "PF" ? "active" : ""}`}
            onClick={() => onChange("kind", "PF")}
            aria-pressed={form.kind === "PF"}
          >
            Pessoa física
          </button>
          <button
            type="button"
            className={`client-kind-btn ${form.kind === "PJ" ? "active" : ""}`}
            onClick={() => onChange("kind", "PJ")}
            aria-pressed={form.kind === "PJ"}
          >
            Pessoa jurídica
          </button>
        </div>
        <div className="modal-note">Campos obrigatórios: {requiredLabel}.</div>
        <div className="modal-grid">
          <div className="field span-2">
            <label>
              {isPerson ? "Nome completo" : "Razão social"} <span className="required">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label>Telefone 1</label>
            <input value={form.phone1} onChange={(e) => handlePhoneChange("phone1", e.target.value)} inputMode="tel" />
          </div>
          <div className="field">
            <label>Telefone 2</label>
            <input value={form.phone2} onChange={(e) => handlePhoneChange("phone2", e.target.value)} inputMode="tel" />
          </div>
          <div className="field span-2">
            <label>Email</label>
            <div className="input-with-hint">
              <input
                value={form.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onKeyDown={handleEmailKeyDown}
              />
              {emailHint.hint && <span className="hint">@{emailHint.hint}</span>}
            </div>
          </div>
          {isPerson ? (
            <>
              <div className="field">
                <label>
                  CPF <span className="required">*</span>
                </label>
                <input value={form.cpf} onChange={(e) => handleCpfChange(e.target.value)} inputMode="numeric" />
                {cpfInvalid && <div className="error-inline">Informe um CPF válido.</div>}
              </div>
              <div className="field">
                <label>RG</label>
                <input value={form.rg} onChange={(e) => handleRgChange(e.target.value)} inputMode="numeric" />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label>
                  CNPJ <span className="required">*</span>
                </label>
                <input value={form.cnpj} onChange={(e) => handleCnpjChange(e.target.value)} inputMode="numeric" />
                {cnpjInvalid && <div className="error-inline">Informe um CNPJ válido.</div>}
              </div>
              <div className="field">
                <label>Nome fantasia</label>
                <input value={form.tradeName} onChange={(e) => handleTradeNameChange(e.target.value)} />
              </div>
            </>
          )}
          {isPerson && (
            <>
              <div className="field">
                <label>Data de nascimento</label>
                <input
                  value={form.birth}
                  onChange={(e) => handleBirthChange(e.target.value)}
                  inputMode="numeric"
                  placeholder="00/00/0000"
                />
              </div>
              <div className="field">
                <label>Sexo</label>
                <select value={form.gender} onChange={(e) => handleGenderChange(e.target.value as ClientGender)}>
                  <option value="">Selecione</option>
                  {clientGenderOptions.map((gender) => (
                    <option key={gender} value={gender}>
                      {gender}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Estado civil</label>
                <select value={maritalKey} onChange={(e) => handleMaritalChange(e.target.value as ClientMaritalKey)}>
                  <option value="">Selecione</option>
                  {clientMaritalOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {getClientMaritalOptionLabel(option, form.gender)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Profissão</label>
                <input list="professionList" value={form.job} onChange={(e) => onChange("job", e.target.value)} />
                <datalist id="professionList">
                  {professions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </>
          )}
          <div className="field">
            <label>CEP</label>
            <div className="input-inline">
              <input value={form.cep} onChange={(e) => handleCepChange(e.target.value)} inputMode="numeric" />
              <button
                className="btn secondary inline"
                type="button"
                disabled={cepDigits.length !== 8}
                onClick={() => onLookupCep?.(cepDigits)}
              >
                Buscar
              </button>
            </div>
            {cepError && <div className="error-inline">{cepError}</div>}
          </div>
          <div className="field">
            <label>Cidade</label>
            <input value={form.city} onChange={(e) => onChange("city", e.target.value)} />
          </div>
          <div className="field span-2">
            <label>Endereço</label>
            <input value={form.address} onChange={(e) => onChange("address", e.target.value)} />
          </div>
          <div className="field">
            <label>Número</label>
            <input value={form.number} onChange={(e) => onChange("number", e.target.value)} />
          </div>
          <div className="field">
            <label>Complemento</label>
            <input value={form.complement} onChange={(e) => onChange("complement", e.target.value)} />
          </div>
          <div className="field">
            <label>Bairro</label>
            <input value={form.neighborhood} onChange={(e) => onChange("neighborhood", e.target.value)} />
          </div>
          <div className="field">
            <label>Estado</label>
            <input value={form.state} onChange={(e) => onChange("state", e.target.value)} />
          </div>
          <div className="field span-2">
            <label>Observações</label>
            <textarea value={form.notes} onChange={(e) => onChange("notes", e.target.value)} />
          </div>
        </div>
        {errorMessage && <div className="error">{errorMessage}</div>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="button" onClick={onSave} disabled={saving || !!validationMessage}>
            {saving ? "Salvando..." : saveLabel || "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProcessFormFields({
  form,
  wallets,
  onChange
}: {
  form: CaseForm;
  wallets?: ApiWallet[];
  onChange: (key: keyof CaseForm, value: string) => void;
}) {
  return (
    <div className="modal-grid process-form-grid">
      <div className="field">
        <label>
          Processo <span className="required">*</span>
        </label>
        <input
          value={form.process}
          onChange={(e) => onChange("process", formatCaseNumber(e.target.value))}
          inputMode="numeric"
          maxLength={25}
          placeholder="0000000-00.0000.0.00.0000"
        />
        <div className="field-hint">Informe o número completo no padrão CNJ.</div>
      </div>
      <div className="field">
        <label>
          Carteira <span className="required">*</span>
        </label>
        <select value={form.walletId} onChange={(e) => onChange("walletId", e.target.value)}>
          <option value="">Selecione</option>
          {(wallets || []).map((wallet) => (
            <option key={wallet.id} value={String(wallet.id)}>
              {wallet.name} - {wallet.nickname}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>
          Vara <span className="required">*</span>
        </label>
        <input value={form.court} onChange={(e) => onChange("court", formatCourtOrRegion(e.target.value))} />
      </div>
      <div className="field">
        <label>
          Comarca <span className="required">*</span>
        </label>
        <input value={form.region} onChange={(e) => onChange("region", formatCourtOrRegion(e.target.value))} />
      </div>
      <div className="field">
        <label>Processos associados</label>
        <input value={form.associated} onChange={(e) => onChange("associated", e.target.value)} />
      </div>
      <div className="field">
        <label>Parte contrária</label>
        <input value={form.counterparty} onChange={(e) => onChange("counterparty", formatCounterparty(e.target.value))} />
      </div>
      <div className="field">
        <label>Advogado parte contrária</label>
        <input value={form.counterLawyer} onChange={(e) => onChange("counterLawyer", e.target.value)} />
      </div>
      <div className="field">
        <label>OAB</label>
        <input value={form.oab} onChange={(e) => onChange("oab", e.target.value)} />
      </div>
      <div className="field">
        <label>Contato</label>
        <input value={form.contact} onChange={(e) => onChange("contact", e.target.value)} />
      </div>
      <div className="field span-2">
        <label>Observações</label>
        <textarea value={form.notes} onChange={(e) => onChange("notes", e.target.value)} />
      </div>
    </div>
  );
}

function AddProcessModal({
  open,
  clientName,
  form,
  wallets,
  saving,
  errorMessage,
  onChange,
  onClose,
  onSave
}: {
  open: boolean;
  clientName?: string;
  form: CaseForm;
  wallets?: ApiWallet[];
  saving?: boolean;
  errorMessage?: string;
  onChange: (key: keyof CaseForm, value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) return null;
  const validationMessage = getCaseFormValidationMessage(form);
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2 className="modal-title">Cliente: {clientName}</h2>
        <ProcessFormFields form={form} wallets={wallets} onChange={onChange} />
        {errorMessage && <div className="error">{errorMessage}</div>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="button" onClick={onSave} disabled={saving || !!validationMessage}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  open,
  title,
  message,
  confirmLabel,
  busy,
  errorMessage,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button className="icon-btn" type="button" onClick={onCancel} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-note">{message}</div>
        {errorMessage && <div className="error">{errorMessage}</div>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="btn danger" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Excluindo..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientDetailsModal({
  open,
  form,
  onClose,
  onEdit,
  onDelete
}: {
  open: boolean;
  form: ClientForm;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!open) return null;
  const document = form.kind === "PF" ? form.cpf : form.cnpj;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <h2 className="modal-title">Cliente: {form.name || "-"}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-grid">
          <div className="field">
            <label>Tipo</label>
            <input value={form.kind === "PF" ? "Pessoa física" : "Pessoa jurídica"} readOnly />
          </div>
          <div className="field">
            <label>{form.kind === "PF" ? "CPF" : "CNPJ"}</label>
            <input value={document || "-"} readOnly />
          </div>
          <div className="field">
            <label>{form.kind === "PF" ? "RG" : "Nome fantasia"}</label>
            <input value={form.kind === "PF" ? form.rg || "-" : form.tradeName || "-"} readOnly />
          </div>
          <div className="field">
            <label>Telefone 1</label>
            <input value={form.phone1 || "-"} readOnly />
          </div>
          <div className="field">
            <label>Telefone 2</label>
            <input value={form.phone2 || "-"} readOnly />
          </div>
          <div className="field span-2">
            <label>Email</label>
            <input value={form.email || "-"} readOnly />
          </div>
          {form.kind === "PF" && (
            <>
              <div className="field">
                <label>Data de nascimento</label>
                <input value={form.birth || "-"} readOnly />
              </div>
              <div className="field">
                <label>Sexo</label>
                <input value={form.gender || "-"} readOnly />
              </div>
              <div className="field">
                <label>Estado civil</label>
                <input value={form.marital || "-"} readOnly />
              </div>
              <div className="field">
                <label>Profissão</label>
                <input value={form.job || "-"} readOnly />
              </div>
            </>
          )}
          <div className="field">
            <label>Cidade</label>
            <input value={form.city || "-"} readOnly />
          </div>
          <div className="field">
            <label>Estado</label>
            <input value={form.state || "-"} readOnly />
          </div>
          <div className="field span-2">
            <label>Endereço</label>
            <input value={form.address || "-"} readOnly />
          </div>
          <div className="field">
            <label>Número</label>
            <input value={form.number || "-"} readOnly />
          </div>
          <div className="field">
            <label>Complemento</label>
            <input value={form.complement || "-"} readOnly />
          </div>
          <div className="field">
            <label>Bairro</label>
            <input value={form.neighborhood || "-"} readOnly />
          </div>
          <div className="field">
            <label>CEP</label>
            <input value={form.cep || "-"} readOnly />
          </div>
          <div className="field span-2">
            <label>Observações</label>
            <textarea value={form.notes || "-"} readOnly />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Fechar
          </button>
          <button className="btn danger" type="button" onClick={onDelete}>
            Excluir cliente
          </button>
          <button className="btn" type="button" onClick={onEdit}>
            Editar
          </button>
        </div>
      </div>
    </div>
  );
}

function People() {
  const [apiClients, setApiClients] = useState<ApiClient[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedId, setSelectedId] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [showAddClient, setShowAddClient] = useState(false);
  const [showClientDetails, setShowClientDetails] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [showDeleteClientConfirm, setShowDeleteClientConfirm] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [editClientId, setEditClientId] = useState<number | null>(null);
  const [editClientForm, setEditClientForm] = useState<ClientForm>(emptyClientForm);
  const [cepError, setCepError] = useState("");
  const [editCepError, setEditCepError] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isUpdatingClient, setIsUpdatingClient] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [pageError, setPageError] = useState("");
  const [saveClientError, setSaveClientError] = useState("");
  const [updateClientError, setUpdateClientError] = useState("");
  const [deleteClientError, setDeleteClientError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadClients = async () => {
      setIsLoadingClients(true);
      setPageError("");
      try {
        const data = await apiListClients();
        if (cancelled) return;
        setApiClients(data);
        const mapped = data.map(toClientRow);
        setClients(mapped);
      } catch (err) {
        if (cancelled) return;
        setPageError(extractApiErrorMessage(err, "Não foi possível carregar os clientes da API."));
      } finally {
        if (!cancelled) setIsLoadingClients(false);
      }
    };
    loadClients();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clients.length) {
      if (selectedId !== 0) setSelectedId(0);
      return;
    }
    if (!clients.some((client) => client.id === selectedId)) {
      setSelectedId(clients[0].id);
    }
  }, [clients, selectedId]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c) => `${c.name} ${c.document}`.toLowerCase().includes(term));
  }, [clients, search]);

  const selectedApiClient = apiClients.find((c) => c.id === selectedId);
  const selectedClientForm = selectedApiClient ? toClientForm(selectedApiClient) : emptyClientForm;

  const handleSaveClient = async () => {
    const validationMessage = getClientFormValidationMessage(clientForm);
    if (validationMessage) {
      setSaveClientError(validationMessage);
      return;
    }
    const payload = buildClientPayload(clientForm);
    const document = (payload.document || "").trim();
    if (!clientForm.name.trim() || !document) return;
    setIsSavingClient(true);
    setSaveClientError("");
    try {
      const created = await apiCreateClient(payload);
      setApiClients((prev) => [...prev, created]);
      const newEntry = toClientRow(created);
      setClients((prev) => [...prev, newEntry]);
      setSelectedId(newEntry.id);
      setClientForm(emptyClientForm);
      setShowAddClient(false);
      setCepError("");
    } catch (err) {
      setSaveClientError(extractApiErrorMessage(err, "Não foi possível salvar o cliente na API."));
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleUpdateClient = async () => {
    if (!editClientId) return;
    const validationMessage = getClientFormValidationMessage(editClientForm);
    if (validationMessage) {
      setUpdateClientError(validationMessage);
      return;
    }
    const payload = buildClientPayload(editClientForm);
    if (!payload.name || !payload.document) return;
    setIsUpdatingClient(true);
    setUpdateClientError("");
    try {
      const updated = await apiUpdateClient(editClientId, payload);
      setApiClients((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      const row = toClientRow(updated);
      setClients((prev) => prev.map((item) => (item.id === updated.id ? row : item)));
      setShowEditClient(false);
      setEditClientId(null);
      setEditClientForm(emptyClientForm);
      setEditCepError("");
    } catch (err) {
      setUpdateClientError(extractApiErrorMessage(err, "Não foi possível atualizar o cliente na API."));
    } finally {
      setIsUpdatingClient(false);
    }
  };

  const handleLookupCep = async (cepDigits: string) => {
    if (cepDigits.length !== 8) return;
    setCepError("");
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data = await resp.json();
      if (!data || data.erro) {
        setCepError("CEP não encontrado.");
        return;
      }
      setClientForm((prev) => ({
        ...prev,
        cep: `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`,
        address: data.logradouro || prev.address,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state
      }));
    } catch (err) {
      setCepError("Falha ao buscar CEP.");
    }
  };

  const handleLookupCepEdit = async (cepDigits: string) => {
    if (cepDigits.length !== 8) return;
    setEditCepError("");
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data = await resp.json();
      if (!data || data.erro) {
        setEditCepError("CEP não encontrado.");
        return;
      }
      setEditClientForm((prev) => ({
        ...prev,
        cep: `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`,
        address: data.logradouro || prev.address,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state
      }));
    } catch (err) {
      setEditCepError("Falha ao buscar CEP.");
    }
  };

  const handleOpenClientDetails = (clientId: number) => {
    setSelectedId(clientId);
    setShowClientDetails(true);
  };

  const handleStartEditClient = () => {
    if (!selectedApiClient) return;
    setEditClientId(selectedApiClient.id);
    setEditClientForm(toClientForm(selectedApiClient));
    setUpdateClientError("");
    setEditCepError("");
    setShowClientDetails(false);
    setShowEditClient(true);
  };

  const handleRequestDeleteClient = () => {
    if (!selectedApiClient) return;
    setDeleteClientError("");
    setShowClientDetails(false);
    setShowDeleteClientConfirm(true);
  };

  const handleDeleteClient = async () => {
    if (!selectedApiClient) return;
    setIsDeletingClient(true);
    setDeleteClientError("");
    try {
      await apiDeleteClient(selectedApiClient.id);
      setApiClients((prev) => prev.filter((item) => item.id !== selectedApiClient.id));
      setClients((prev) => prev.filter((item) => item.id !== selectedApiClient.id));
      setShowDeleteClientConfirm(false);
      setShowClientDetails(false);
      setShowEditClient(false);
      setEditClientId(null);
      setEditClientForm(emptyClientForm);
    } catch (err) {
      setDeleteClientError(extractApiErrorMessage(err, "Não foi possível excluir o cliente."));
    } finally {
      setIsDeletingClient(false);
    }
  };

  return (
    <div className="content-card page-card">
      <div className="page-header">
        <div>
          <div className="eyebrow">Pessoas e Clientes</div>
          <h1 className="page-title">Gerencie cadastros, contatos estratégicos e pendências documentais.</h1>
        </div>
        <div className="pill">Atualizado semanalmente</div>
      </div>

      <div className="stats-grid">
        <StatCard title="Clientes ativos" value={`${clients.length}`} description="Com planos vigentes" badge="4 aguardam assinatura" />
        <StatCard title="Clientes potenciais" value="11" description="Em fase de proposta" badge="2 retornos pendentes" />
        <StatCard title="Contatos principais" value="57" description="Responsáveis diretos pelos casos" badge="Atualizado semanalmente" />
      </div>

      <div className="mini-grid">
        <MiniCard
          title="Aniversariantes"
          cta="Enviar felicitações"
          items={[
            { label: "Cláudia Nunes", note: "Hoje" },
            { label: "Marcos Peixoto", note: "23/11" }
          ]}
        />
        <MiniCard
          title="Novos cadastros"
          cta="Revisar"
          items={[
            { label: "Cooperativa Vale Azul", note: "Cliente empresarial" },
            { label: "Ricardo Lopes", note: "Pessoa física" }
          ]}
        />
        <MiniCard
          title="Pendências cadastrais"
          cta="Solicitar documentos"
          items={[
            { label: "Grupo Arnaud", note: "Contrato social desatualizado" },
            { label: "Luciana Prado", note: "Endereço divergente" }
          ]}
        />
      </div>

      <div className="client-card">
        <div className="client-header">
          <div>
            <div className="client-title">Área de Clientes</div>
            <div className="client-sub">Cadastre clientes, pesquise rapidamente e visualize o histórico consolidado.</div>
          </div>
          <div className="client-toolbar">
            <div className="search-input">
              <input placeholder="Pesquisar cliente pelo nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button
              className="btn secondary"
              onClick={() => {
                setSaveClientError("");
                setShowAddClient(true);
              }}
              disabled={isLoadingClients}
            >
              Adicionar cliente
            </button>
          </div>
        </div>
        {pageError && <div className="error">{pageError}</div>}
        {!pageError && <div className="page-subtitle">Dica: clique duas vezes no cliente para abrir detalhes e editar.</div>}

        <div className="table-shell">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Telefone 1</th>
                <th>Email</th>
                <th>Cidade</th>
                <th>Documento</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingClients && (
                <tr>
                  <td colSpan={7}>Carregando clientes...</td>
                </tr>
              )}
              {!isLoadingClients && filteredClients.length === 0 && (
                <tr>
                  <td colSpan={7}>Nenhum cliente cadastrado.</td>
                </tr>
              )}
              {!isLoadingClients &&
                filteredClients.map((client, idx) => (
                  <tr
                    key={client.id}
                    className={selectedId === client.id ? "selected" : ""}
                    onClick={() => setSelectedId(client.id)}
                    onDoubleClick={() => handleOpenClientDetails(client.id)}
                  >
                    <td className="index-cell">{idx + 1}</td>
                    <td>{client.name}</td>
                    <td>
                      <span className={`client-kind-badge ${client.kind.toLowerCase()}`}>
                        {client.kind === "PF" ? "Pessoa física" : "Pessoa jurídica"}
                      </span>
                    </td>
                    <td>{client.phone}</td>
                    <td>{client.email}</td>
                    <td>{client.city}</td>
                    <td>{client.document}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddClientModal
        open={showAddClient}
        form={clientForm}
        saving={isSavingClient}
        title="Cadastrar novo cliente"
        saveLabel="Salvar"
        errorMessage={saveClientError}
        onClose={() => {
          if (isSavingClient) return;
          setShowAddClient(false);
          setClientForm(emptyClientForm);
          setCepError("");
          setSaveClientError("");
        }}
        onChange={(key, value) => {
          if (key === "cep") setCepError("");
          if (saveClientError) setSaveClientError("");
          setClientForm((prev) => ({ ...prev, [key]: value }));
        }}
        onSave={handleSaveClient}
        onLookupCep={(cepDigits) => {
          handleLookupCep(cepDigits);
        }}
        cepError={cepError}
      />
      <ClientDetailsModal
        open={showClientDetails}
        form={selectedClientForm}
        onClose={() => setShowClientDetails(false)}
        onEdit={handleStartEditClient}
        onDelete={handleRequestDeleteClient}
      />
      <ConfirmDeleteModal
        open={showDeleteClientConfirm}
        title="Excluir cliente"
        message={`Deseja excluir o cliente ${selectedClientForm.name || "selecionado"}?`}
        confirmLabel="Excluir cliente"
        busy={isDeletingClient}
        errorMessage={deleteClientError}
        onCancel={() => {
          if (isDeletingClient) return;
          setShowDeleteClientConfirm(false);
          setDeleteClientError("");
        }}
        onConfirm={handleDeleteClient}
      />
      <AddClientModal
        open={showEditClient}
        form={editClientForm}
        saving={isUpdatingClient}
        title="Editar cliente"
        saveLabel="Salvar alterações"
        errorMessage={updateClientError}
        onClose={() => {
          if (isUpdatingClient) return;
          setShowEditClient(false);
          setEditClientId(null);
          setEditClientForm(emptyClientForm);
          setUpdateClientError("");
          setEditCepError("");
        }}
        onChange={(key, value) => {
          if (key === "cep") setEditCepError("");
          if (updateClientError) setUpdateClientError("");
          setEditClientForm((prev) => ({ ...prev, [key]: value }));
        }}
        onSave={handleUpdateClient}
        onLookupCep={(cepDigits) => {
          handleLookupCepEdit(cepDigits);
        }}
        cepError={editCepError}
      />
    </div>
  );
}

type JurisprudenceAreaId = "consumer" | "civil_bank" | "labor" | "family" | "health";

type JurisprudenceIntakeForm = {
  area: JurisprudenceAreaId | "";
  processNumber: string;
  claimType: string;
  objective: string;
  narrative: string;
  opposingParty: string;
  jurisdiction: string;
  factPeriod: string;
  valueRange: string;
  evidenceStrength: string;
  evidenceSummary: string;
  proceduralStage: string;
  hasDocuments: boolean;
  hasMessages: boolean;
  hasWitnesses: boolean;
  hasAdministrativeAttempt: boolean;
  needsExpertEvidence: boolean;
};

const jurisprudenceAreaOptions = [
  {
    value: "consumer",
    label: "Consumidor",
    description: "Cobrança indevida, negativação, falha de serviço, cancelamento e vício do produto.",
    claimSuggestions: ["Cobrança indevida", "Negativação indevida", "Falha na prestação de serviço", "Rescisão contratual"],
    reading:
      "Em consumo, os julgados parecidos normalmente giram em torno da falha comprovada, da reação do fornecedor e da extensão concreta do prejuízo.",
    proofFocus: "Contratos, faturas, extratos, protocolos e histórico de atendimento costumam definir o eixo da comparação.",
    sensitivePoint:
      "Dano moral tende a oscilar quando o constrangimento é narrado sem cronologia, sem prova da insistência da cobrança ou sem negativação formal.",
    officeBridge: "falha de serviço, documentação da cobrança, persistência do problema e resposta da empresa",
    searchSeeds: ["falha na prestação do serviço", "inversão do ônus da prova", "dano moral por cobrança"],
    nextStep: "separar contrato, comprovantes, extratos e protocolos em ordem cronológica"
  },
  {
    value: "civil_bank",
    label: "Cível bancário",
    description: "Fraude, revisão contratual, descontos indevidos, empréstimos e dever de informação.",
    claimSuggestions: ["Desconto indevido", "Fraude bancária", "Revisão contratual", "Juros abusivos"],
    reading:
      "Em litígios bancários, a jurisprudência costuma separar com nitidez o que é fraude, o que é inadimplemento contratual e o que é dever de informação insuficiente.",
    proofFocus: "Extratos, contrato, comprovantes de autorização, logs de transação e registros de atendimento costumam ser decisivos.",
    sensitivePoint:
      "Sem documento financeiro claro, casos bancários tendem a se dispersar entre responsabilidade objetiva, culpa de terceiro e necessidade de perícia.",
    officeBridge: "autorização da operação, cadeia documental do contrato e nexo entre o débito e a instituição financeira",
    searchSeeds: ["desconto indevido em conta", "responsabilidade por fraude bancária", "revisão de contrato bancário"],
    nextStep: "delimitar a operação específica, a data do débito e o documento que demonstra a irregularidade"
  },
  {
    value: "labor",
    label: "Trabalhista",
    description: "Horas extras, verbas rescisórias, vínculo, assédio, adicionais e jornada.",
    claimSuggestions: ["Horas extras", "Reconhecimento de vínculo", "Verbas rescisórias", "Assédio moral"],
    reading:
      "Em matéria trabalhista, julgados próximos costumam diferenciar o que está bem documentado do que depende fortemente de prova oral sobre a rotina real de trabalho.",
    proofFocus: "Cartões de ponto, recibos, holerites, mensagens, escalas e testemunhas costumam empurrar a leitura jurisprudencial.",
    sensitivePoint:
      "Quando a narrativa não explica jornada, subordinação ou função efetiva, a comparação com precedentes trabalhistas perde precisão rapidamente.",
    officeBridge: "rotina concreta de trabalho, documentos da relação empregatícia e coerência entre prova documental e oral",
    searchSeeds: ["horas extras habitualidade", "reconhecimento de vínculo", "prova da jornada de trabalho"],
    nextStep: "amarrar função, jornada, chefia imediata e período exato da prestação de serviços"
  },
  {
    value: "family",
    label: "Família",
    description: "Alimentos, guarda, convivência, partilha e medidas de proteção.",
    claimSuggestions: ["Fixação de alimentos", "Revisão de alimentos", "Guarda", "Regulamentação de convivência"],
    reading:
      "Em família, o comportamento da jurisprudência costuma ser mais casuístico e centrado em contexto fático, renda demonstrada e melhor interesse do núcleo familiar.",
    proofFocus: "Comprovantes de renda, despesas da criança, rotina familiar, mensagens e histórico de cuidado costumam orientar o recorte.",
    sensitivePoint:
      "Sem dados objetivos de renda, despesas ou dinâmica familiar, a leitura se torna aberta demais e a comparação com precedentes fica superficial.",
    officeBridge: "capacidade financeira, necessidade concreta e impacto prático da medida sobre a rotina familiar",
    searchSeeds: ["binômio necessidade possibilidade", "melhor interesse da criança", "revisão de alimentos"],
    nextStep: "quantificar renda, despesas e o impacto cotidiano da medida buscada"
  },
  {
    value: "health",
    label: "Saúde",
    description: "Plano de saúde, negativa de cobertura, urgência médica e fornecimento de tratamento.",
    claimSuggestions: ["Negativa de cobertura", "Home care", "Medicamento de alto custo", "Cirurgia urgente"],
    reading:
      "Em saúde, decisões parecidas normalmente valorizam urgência, prescrição médica, negativa formal do plano ou do ente público e risco concreto ao paciente.",
    proofFocus: "Relatório médico, prescrição, negativa formal, exames e indicação terapêutica tendem a puxar a leitura do caso.",
    sensitivePoint:
      "Sem prescrição ou justificativa clínica robusta, a discussão costuma deslocar o foco para prova técnica e excepcionalidade do tratamento.",
    officeBridge: "urgência clínica, negativa formal e documentação médica que sustenta necessidade, adequação e risco",
    searchSeeds: ["negativa de cobertura plano de saúde", "fornecimento de medicamento", "urgência médica e tutela"],
    nextStep: "separar a prescrição atual, a negativa formal e os documentos clínicos que indiquem urgência"
  }
] as const;

const jurisprudenceJurisdictionOptions = [
  { value: "tjsp", label: "TJSP" },
  { value: "tjrj", label: "TJRJ" },
  { value: "tjmg", label: "TJMG" },
  { value: "tjrs", label: "TJRS" },
  { value: "tjpr", label: "TJPR" },
  { value: "trt2", label: "TRT 2" },
  { value: "trt15", label: "TRT 15" },
  { value: "trf3", label: "TRF 3" },
  { value: "stj", label: "STJ" },
  { value: "local", label: "Outro recorte (sem consulta automática)" }
] as const;

const jurisprudenceValueRangeOptions = [
  { value: "up-to-10k", label: "Até R$ 10 mil" },
  { value: "10k-50k", label: "R$ 10 mil a R$ 50 mil" },
  { value: "50k-200k", label: "R$ 50 mil a R$ 200 mil" },
  { value: "200k-plus", label: "Acima de R$ 200 mil" },
  { value: "not-defined", label: "Ainda sem faixa econômica definida" }
] as const;

const jurisprudenceEvidenceStrengthOptions = [
  { value: "low", label: "Base inicial" },
  { value: "medium", label: "Base intermediária" },
  { value: "high", label: "Base robusta" }
] as const;

const jurisprudenceStageOptions = [
  { value: "pre-litigation", label: "Antes da ação" },
  { value: "initial-petition", label: "Montando a inicial" },
  { value: "defense", label: "Após contestação" },
  { value: "evidence-phase", label: "Fase de prova / instrução" },
  { value: "appeal", label: "Recurso / revisão estratégica" }
] as const;

const jurisprudenceStopwords = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "contra",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "ela",
  "ele",
  "em",
  "entre",
  "era",
  "essa",
  "esse",
  "esta",
  "este",
  "foi",
  "foram",
  "mais",
  "mas",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "pela",
  "pelas",
  "pelo",
  "pelos",
  "por",
  "qual",
  "quando",
  "que",
  "se",
  "sem",
  "ser",
  "sobre",
  "sua",
  "suas",
  "seu",
  "seus",
  "uma",
  "umas",
  "um",
  "uns"
]);

const buildEmptyJurisprudenceForm = (): JurisprudenceIntakeForm => ({
  area: "",
  processNumber: "",
  claimType: "",
  objective: "",
  narrative: "",
  opposingParty: "",
  jurisdiction: "",
  factPeriod: "",
  valueRange: "",
  evidenceStrength: "",
  evidenceSummary: "",
  proceduralStage: "",
  hasDocuments: false,
  hasMessages: false,
  hasWitnesses: false,
  hasAdministrativeAttempt: false,
  needsExpertEvidence: false
});

const getJurisprudenceAreaConfig = (area: JurisprudenceAreaId | "") =>
  jurisprudenceAreaOptions.find((option) => option.value === area) ?? null;

const getOptionLabel = (options: ReadonlyArray<{ value: string; label: string }>, value: string) =>
  options.find((option) => option.value === value)?.label ?? "";

const extractJurisprudenceKeywords = (value: string) => {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5 && !jurisprudenceStopwords.has(token));
  return Array.from(new Set(tokens)).slice(0, 4);
};

const buildJurisprudenceAnalysis = (form: JurisprudenceIntakeForm) => {
  const areaConfig = getJurisprudenceAreaConfig(form.area);
  const proofSignals = [
    form.hasDocuments ? "Documentos principais já separados" : "",
    form.hasMessages ? "Mensagens, protocolos ou e-mails" : "",
    form.hasWitnesses ? "Prova testemunhal mapeada" : "",
    form.hasAdministrativeAttempt ? "Tentativa administrativa anterior" : "",
    form.needsExpertEvidence ? "Tema com possível dependência de prova técnica" : ""
  ].filter(Boolean);
  const requiredChecks = [
    { label: "Área do direito definida", done: Boolean(form.area), critical: true, weight: 10 },
    { label: "Controvérsia principal descrita", done: form.claimType.trim().length >= 6, critical: true, weight: 10 },
    { label: "Pedido / objetivo informado", done: form.objective.trim().length >= 8, critical: true, weight: 10 },
    { label: "Narrativa com contexto suficiente", done: form.narrative.trim().length >= 180, critical: true, weight: 18 },
    { label: "Parte contrária identificada", done: form.opposingParty.trim().length >= 3, critical: true, weight: 8 },
    { label: "Recorte de tribunal/UF definido", done: Boolean(form.jurisdiction), critical: true, weight: 10 },
    { label: "Período dos fatos informado", done: form.factPeriod.trim().length >= 5, critical: true, weight: 8 },
    { label: "Base probatória resumida", done: form.evidenceSummary.trim().length >= 60, critical: true, weight: 14 },
    { label: "Faixa econômica informada", done: Boolean(form.valueRange), critical: false, weight: 4 },
    { label: "Tipo de prova sinalizado", done: proofSignals.length > 0, critical: false, weight: 4 },
    { label: "Maturidade da prova definida", done: Boolean(form.evidenceStrength), critical: false, weight: 4 }
  ];
  const completionScore = Math.max(
    0,
    Math.min(
      100,
      requiredChecks.reduce((total, item) => total + (item.done ? item.weight : 0), 0)
    )
  );
  const criticalGaps = requiredChecks.filter((item) => item.critical && !item.done).map((item) => item.label);
  const pendingQuestions: string[] = [];
  if (!form.area) pendingQuestions.push("Qual área do direito concentra o pedido principal do caso?");
  if (form.claimType.trim().length < 6) pendingQuestions.push("Qual é a controvérsia central em uma linha objetiva?");
  if (form.objective.trim().length < 8) pendingQuestions.push("O que exatamente o escritório pretende buscar: indenização, obrigação de fazer, revisão, verbas, guarda?");
  if (form.narrative.trim().length < 180) pendingQuestions.push("Faltam fatos: contexto, sequência dos eventos, reação da parte contrária e impacto prático.");
  if (!form.jurisdiction) pendingQuestions.push("Qual tribunal, estado ou recorte jurisdicional deve orientar a pesquisa?");
  if (form.evidenceSummary.trim().length < 60) pendingQuestions.push("Quais documentos, prints, contratos, laudos ou protocolos já existem e o que eles provam?");
  if (!form.factPeriod.trim()) pendingQuestions.push("Em que período os fatos aconteceram e desde quando o problema persiste?");
  if (proofSignals.length === 0) pendingQuestions.push("Há pelo menos um bloco de prova já disponível para comparar o caso com julgados similares?");
  if (!form.valueRange) pendingQuestions.push("Qual é a faixa econômica envolvida ou o impacto financeiro aproximado da controvérsia?");
  if (form.needsExpertEvidence && form.evidenceStrength !== "high") {
    pendingQuestions.push("Se o caso depende de perícia, já existe laudo, orçamento técnico ou documento especializado?");
  }
  const evidenceStrengthLabel = getOptionLabel(jurisprudenceEvidenceStrengthOptions, form.evidenceStrength) || "Nível de prova não informado";
  const stageLabel = getOptionLabel(jurisprudenceStageOptions, form.proceduralStage) || "Fase processual não informada";
  const jurisdictionLabel = getOptionLabel(jurisprudenceJurisdictionOptions, form.jurisdiction) || "Tribunal/UF a definir";
  const valueLabel = getOptionLabel(jurisprudenceValueRangeOptions, form.valueRange) || "Faixa econômica não informada";
  const evidenceLead =
    form.evidenceStrength === "high" && proofSignals.length >= 2
      ? "há base probatória suficiente para comparar o caso com precedentes mais próximos"
      : form.evidenceStrength === "medium" || proofSignals.length >= 2
        ? "o recorte já permite leitura inicial, mas a consistência dos documentos ainda vai deslocar bastante o entendimento"
        : "o recorte ainda depende de mais suporte probatório para não misturar casos juridicamente diferentes";
  const researchScope = [
    jurisdictionLabel,
    areaConfig?.label || "Área a definir",
    form.claimType.trim() || "Controvérsia a definir",
    stageLabel
  ].join(" · ");
  const dominantRead = areaConfig
    ? `${areaConfig.reading} No recorte atual, ${evidenceLead}. ${
        form.objective.trim()
          ? `O pedido informado (${form.objective.trim().toLowerCase()}) ajuda a filtrar melhor os julgados realmente comparáveis.`
          : "Sem o pedido principal bem amarrado, a pesquisa tende a misturar decisões com fundamentos muito diferentes."
      }`
    : "Defina a área do direito para o sistema calibrar a leitura jurisprudencial e o recorte de pesquisa.";
  const officeLanguage = areaConfig
    ? `Para conversar com o cliente, o escritório pode tratar o tema assim: em casos parecidos com ${form.claimType.trim().toLowerCase() || "essa controvérsia"}, a jurisprudência costuma reagir a partir de ${areaConfig.officeBridge}. No cenário informado, o ponto que mais pesa é ${
        form.hasDocuments
          ? "a consistência da prova documental"
          : form.hasWitnesses
            ? "a coerência entre narrativa e prova oral"
            : "a necessidade de amarrar melhor os elementos de prova"
      }.`
    : "Sem área jurídica definida, a saída deve ficar no nível de coleta de dados e ainda não de leitura jurisprudencial.";
  const searchTerms = Array.from(
    new Set(
      [
        form.claimType.trim(),
        form.objective.trim(),
        `${jurisdictionLabel} ${areaConfig?.label.toLowerCase() || "jurisprudência"}`,
        ...(areaConfig?.searchSeeds ?? []),
        ...extractJurisprudenceKeywords(`${form.narrative} ${form.evidenceSummary}`)
      ].filter(Boolean)
    )
  ).slice(0, 6);
  const jurisprudenceFocus = areaConfig
    ? [
        areaConfig.proofFocus,
        areaConfig.sensitivePoint,
        form.hasAdministrativeAttempt
          ? "A tentativa administrativa anterior costuma reforçar boa-fé e persistência do problema quando a parte contrária permaneceu inerte."
          : "Sem histórico administrativo, vale diferenciar se o caso exige notificação prévia ou se o fato já nasce judicializável.",
        form.needsExpertEvidence
          ? "Casos dependentes de perícia tendem a apresentar leitura menos linear até que o suporte técnico esteja claro."
          : "Quando o caso é predominantemente documental, a comparação com precedentes similares fica mais limpa."
      ]
    : [
        "Escolha a área do direito para destravar os fatores comparativos mais relevantes.",
        "Defina a controvérsia central antes de buscar decisões parecidas."
      ];
  const nextSteps = criticalGaps.length
    ? criticalGaps.slice(0, 4).map((gap) => `Completar: ${gap}.`)
    : [
        `Pesquisar ${searchTerms[0] || "precedentes próximos"} com foco em ${jurisdictionLabel}.`,
        areaConfig ? `Executar o recorte sugerido da área: ${areaConfig.nextStep}.` : "Definir a área jurídica para orientar o recorte.",
        form.objective.trim()
          ? `Organizar os pedidos em torno de ${form.objective.trim().toLowerCase()}.`
          : "Fixar qual resultado o cliente realmente espera do caso.",
        "Revisar se a narrativa cobre fato, prova, reação da parte contrária e impacto prático em ordem cronológica."
      ];
  const readinessTone = completionScore >= 90 ? "ready" : completionScore >= 70 ? "attention" : "pending";
  const readinessLabel = completionScore >= 90 ? "Pronto para consulta oficial" : "Dados a completar";
  return {
    areaConfig,
    requiredChecks,
    completionScore,
    score: completionScore,
    readinessTone,
    readinessLabel,
    criticalGaps,
    pendingQuestions,
    proofSignals,
    jurisdictionLabel,
    valueLabel,
    evidenceStrengthLabel,
    stageLabel,
    researchScope,
    dominantRead,
    officeLanguage,
    searchTerms,
    jurisprudenceFocus,
    nextSteps
  };
};

const formatJurisprudenceTotal = (result: JurisprudenceSearchResponse | null) => {
  if (!result) return "Aguardando";
  if (result.status !== "ok" && result.status !== "empty") return "Indisponível";
  const suffix = result.total_relation === "gte" ? "+" : "";
  return `${result.total_hits}${suffix}`;
};

const formatVerifiedDate = (value?: string | null) => {
  if (!value) return "Sem data";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

function StatisticsWorkbench() {
  const [form, setForm] = useState<JurisprudenceIntakeForm>(() => buildEmptyJurisprudenceForm());
  const [analysisRequested, setAnalysisRequested] = useState(false);
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [jurisprudenceResult, setJurisprudenceResult] = useState<JurisprudenceSearchResponse | null>(null);
  const [isSearchingJurisprudence, setIsSearchingJurisprudence] = useState(false);
  const [jurisprudenceSearchError, setJurisprudenceSearchError] = useState("");
  const analysis = useMemo(() => buildJurisprudenceAnalysis(form), [form]);
  const areaConfig = analysis.areaConfig;
  const narrativeLength = form.narrative.trim().length;
  const filledChecksCount = analysis.requiredChecks.filter((item) => item.done).length;
  const canGenerateJurisprudence = analysis.requiredChecks.every((item) => item.done);
  const verifiedCases = jurisprudenceResult?.cases ?? [];
  const hasAnyCaseData = Boolean(
    form.area ||
      form.processNumber.trim() ||
      form.claimType.trim() ||
      form.objective.trim() ||
      form.narrative.trim() ||
      form.opposingParty.trim() ||
      form.jurisdiction ||
      form.factPeriod.trim() ||
      form.valueRange ||
      form.evidenceStrength ||
      form.evidenceSummary.trim() ||
      form.proceduralStage ||
      form.hasDocuments ||
      form.hasMessages ||
      form.hasWitnesses ||
      form.hasAdministrativeAttempt ||
      form.needsExpertEvidence
  );
  useEffect(() => {
    if (analysisRequested && !canGenerateJurisprudence) {
      setAnalysisRequested(false);
      setJurisprudenceResult(null);
    }
  }, [analysisRequested, canGenerateJurisprudence]);

  const updateField =
    (field: keyof JurisprudenceIntakeForm) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const target = event.target;
      const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
      setAnalysisRequested(false);
      setJurisprudenceResult(null);
      setJurisprudenceSearchError("");
      setForm((current) => ({
        ...current,
        [field]: value
      }));
    };

  const applyClaimSuggestion = (value: string) => {
    setAnalysisRequested(false);
    setJurisprudenceResult(null);
    setJurisprudenceSearchError("");
    setForm((current) => ({
      ...current,
      claimType: value
    }));
  };

  const handleGenerate = async () => {
    if (!canGenerateJurisprudence || isSearchingJurisprudence) return;
    setAnalysisRequested(true);
    setIsCaseModalOpen(false);
    setIsSearchingJurisprudence(true);
    setJurisprudenceResult(null);
    setJurisprudenceSearchError("");
    try {
      const result = await apiSearchJurisprudenceStats({
        area: form.area || undefined,
        claim_type: form.claimType.trim(),
        objective: form.objective.trim(),
        narrative: form.narrative.trim(),
        opposing_party: form.opposingParty.trim(),
        jurisdiction: form.jurisdiction,
        fact_period: form.factPeriod.trim(),
        evidence_summary: form.evidenceSummary.trim(),
        process_number: form.processNumber.trim() || undefined,
        limit: 6
      });
      setJurisprudenceResult(result);
    } catch (error) {
      setJurisprudenceSearchError((error as Error)?.message || "Não foi possível consultar uma fonte confiável agora.");
    } finally {
      setIsSearchingJurisprudence(false);
    }
  };

  const handleReset = () => {
    setForm(buildEmptyJurisprudenceForm());
    setAnalysisRequested(false);
    setIsCaseModalOpen(false);
    setJurisprudenceResult(null);
    setJurisprudenceSearchError("");
  };

  return (
    <div className="content-card page-card stats-lab-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Estatísticas</div>
          <h1 className="page-title">Leitura jurisprudencial guiada para casos parecidos com o relato do cliente.</h1>
          <div className="page-subtitle">
            O advogado descreve o caso, confirma os campos mínimos e o sistema organiza uma leitura qualitativa sobre como a jurisprudência costuma aparecer em recortes semelhantes.
          </div>
        </div>
        <div className="stats-lab-toolbar">
          <button className="btn ghost small stats-lab-entry-button" type="button" onClick={() => setIsCaseModalOpen(true)}>
            Entrada do caso
          </button>
          {hasAnyCaseData && (
            <button className="btn ghost small" type="button" onClick={handleReset}>
              Limpar caso
            </button>
          )}
        </div>
      </div>

      <div className="stats-lab-card stats-lab-analysis-card stats-lab-analysis-card-full">
          <div className="stats-lab-head">
            <div>
              <div className="settings-title">Saída para o escritório</div>
              <div className="settings-sub">Leitura qualitativa do cenário, pontos sensíveis, filtros de pesquisa e pendências de coleta.</div>
            </div>
            {analysisRequested && <div className={`stats-lab-status ${analysis.readinessTone}`}>{analysis.readinessLabel}</div>}
          </div>

          {!analysisRequested ? (
            <div className="stats-lab-placeholder">
              <strong>Abra a entrada do caso.</strong>
              <p>Use o botão “Entrada do caso”, preencha o recorte completo no popup e gere a leitura jurisprudencial por lá.</p>
            </div>
          ) : (
            <>
              <div className="stats-lab-score-card">
                <div className="stats-lab-score-head">
                  <span>Consulta oficial de processos</span>
                  <strong>{isSearchingJurisprudence ? "Buscando..." : formatJurisprudenceTotal(jurisprudenceResult)}</strong>
                </div>
                <div className="stats-lab-score-track" aria-hidden="true">
                  <span className="stats-lab-score-fill" style={{ width: `${analysis.score}%` }} />
                </div>
                <div className="field-hint">Recorte atual: {analysis.researchScope}.</div>
                <div className="field-hint">Os números de processo abaixo só aparecem quando retornam da fonte oficial. Sem retorno confiável, a tela fica vazia.</div>
                {jurisprudenceSearchError && <div className="error">{jurisprudenceSearchError}</div>}
              </div>

              <div className="stats-lab-insight-grid">
                <div className="stats-lab-insight-card" data-tone="neutral">
                  <span>Fonte dos processos</span>
                  <strong>{jurisprudenceResult?.source_name || "DataJud/CNJ"}</strong>
                  <p>{jurisprudenceResult?.message || "A consulta ainda está em andamento ou aguardando retorno da fonte oficial."}</p>
                </div>
                <div className="stats-lab-insight-card" data-tone={analysis.readinessTone === "ready" ? "accent" : "warning"}>
                  <span>Processos verificados</span>
                  <strong>{formatJurisprudenceTotal(jurisprudenceResult)}</strong>
                  <p>Total informado pela API pública consultada para os termos do recorte.</p>
                </div>
                <div className="stats-lab-insight-card" data-tone="neutral">
                  <span>Base probatória</span>
                  <strong>{analysis.proofSignals.length ? analysis.proofSignals.join(" · ") : "Prova ainda muito aberta"}</strong>
                  <p>Quanto mais claro o suporte documental, mais limpa tende a ser a leitura da jurisprudência.</p>
                </div>
                <div className="stats-lab-insight-card" data-tone="accent">
                  <span>Resultado de mérito</span>
                  <strong>Não inferido</strong>
                  <p>Deferimento, improcedência ou parcial só serão mostrados quando vierem de dado auditável da fonte.</p>
                </div>
              </div>

              <div className="stats-lab-section">
                <div className="stats-lab-section-head">
                  <div className="stats-lab-section-title">Processos verificados no recorte</div>
                </div>
                <span className="stats-lab-section-caption">Amostra retornada diretamente pelo DataJud/CNJ. Nenhum número é criado pelo sistema.</span>
                {isSearchingJurisprudence ? (
                  <div className="stats-lab-placeholder">
                    <strong>Consultando fonte oficial...</strong>
                    <p>Buscando processos públicos no tribunal selecionado.</p>
                  </div>
                ) : !jurisprudenceResult || jurisprudenceSearchError ? (
                  <div className="stats-lab-placeholder">
                    <strong>Sem consulta verificada.</strong>
                    <p>{jurisprudenceSearchError || "Gere a leitura para consultar processos reais na fonte oficial."}</p>
                  </div>
                ) : verifiedCases.length === 0 ? (
                  <div className="stats-lab-placeholder">
                    <strong>Nenhum processo público encontrado.</strong>
                    <p>{jurisprudenceResult.message}</p>
                  </div>
                ) : (
                  <div className="stats-lab-similar-cases">
                    {verifiedCases.map((item) => (
                      <div key={item.number} className="stats-lab-similar-case">
                        <div className="stats-lab-similar-head">
                          <strong>{item.formatted_number || item.number}</strong>
                          <span className="stats-lab-case-status granted">Verificado</span>
                        </div>
                        <div className="stats-lab-similar-meta">
                          {item.court && <span>{item.court}</span>}
                          {item.degree && <span>Grau {item.degree}</span>}
                          {item.organ && <span>{item.organ}</span>}
                          <span>Atualizado em {formatVerifiedDate(item.updated_at)}</span>
                          {item.filed_at && <span>Ajuizado em {formatVerifiedDate(item.filed_at)}</span>}
                        </div>
                        <p>{item.class_name || "Classe processual não informada pela fonte."}</p>
                        {item.subjects.length > 0 && (
                          <div className="stats-lab-tags">
                            {item.subjects.map((subject) => (
                              <span key={subject} className="stats-lab-tag">
                                {subject}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.movements.length > 0 && <div className="field-hint">Movimentos recentes: {item.movements.join(" · ")}</div>}
                        <div className="field-hint">
                          Fonte:{" "}
                          <a href={item.source_url} target="_blank" rel="noreferrer">
                            {item.source_name}
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="stats-lab-section">
                <div className="stats-lab-section-title">Como a jurisprudência costuma se comportar</div>
                <p>{analysis.dominantRead}</p>
                <p>{analysis.officeLanguage}</p>
              </div>

              <div className="stats-lab-two-columns">
                <div className="stats-lab-section">
                  <div className="stats-lab-section-title">Fatores que normalmente deslocam o entendimento</div>
                  <div className="stats-lab-bullet-list">
                    {analysis.jurisprudenceFocus.map((item) => (
                      <div key={item} className="stats-lab-bullet-item">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="stats-lab-section">
                  <div className="stats-lab-section-title">Termos sugeridos para pesquisa</div>
                  <div className="stats-lab-tags">
                    {analysis.searchTerms.map((term) => (
                      <span key={term} className="stats-lab-tag">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {analysis.pendingQuestions.length > 0 && (
                <div className="stats-lab-section stats-lab-section-warning">
                  <div className="stats-lab-section-title">Dados que ainda fariam diferença</div>
                  <div className="stats-lab-bullet-list">
                    {analysis.pendingQuestions.map((item) => (
                      <div key={item} className="stats-lab-bullet-item">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="stats-lab-section">
                <div className="stats-lab-section-title">Próximos passos para o escritório</div>
                <div className="stats-lab-bullet-list">
                  {analysis.nextSteps.map((item) => (
                    <div key={item} className="stats-lab-bullet-item">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
      </div>

      {isCaseModalOpen && (
        <div className="modal-backdrop stats-lab-modal-backdrop" onClick={() => setIsCaseModalOpen(false)}>
          <div className="modal-card stats-lab-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">Estatísticas</div>
                <div className="modal-title">Ficha do caso para leitura jurisprudencial</div>
                <div className="settings-sub">
                  Preencha o caso em tela ampla. A leitura só é liberada quando todos os campos mínimos estiverem completos.
                </div>
              </div>
              <button className="icon-btn" type="button" onClick={() => setIsCaseModalOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="stats-lab-modal-banner">
              <div className="stats-lab-meter">
                <strong>{filledChecksCount}/{analysis.requiredChecks.length}</strong>
                <span>{canGenerateJurisprudence ? "pronto para leitura" : "campos completos"}</span>
              </div>
              <div className="stats-lab-note">
                Quanto mais preciso o recorte, melhor fica a organização da jurisprudência parecida e dos resumos de saída para o escritório.
              </div>
            </div>

            <div className="stats-lab-form-grid">
              <div className="field">
                <label>Área do direito *</label>
                <select value={form.area} onChange={updateField("area")}>
                  <option value="">Selecione</option>
                  {jurisprudenceAreaOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {areaConfig && <div className="field-hint">{areaConfig.description}</div>}
              </div>
              <div className="field">
                <label>Tribunal / UF de interesse *</label>
                <select value={form.jurisdiction} onChange={updateField("jurisdiction")}>
                  <option value="">Selecione</option>
                  {jurisprudenceJurisdictionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field span-2">
                <label>Número CNJ do processo base</label>
                <input
                  value={form.processNumber}
                  onChange={updateField("processNumber")}
                  placeholder="Opcional. Ex.: 0000000-00.0000.0.00.0000"
                />
                <div className="field-hint">Se informado, a busca prioriza esse número na fonte oficial.</div>
              </div>
              <div className="field">
                <label>Controvérsia principal *</label>
                <input
                  value={form.claimType}
                  onChange={updateField("claimType")}
                  placeholder="Ex.: cobrança indevida, horas extras, negativa de cobertura"
                />
              </div>
              <div className="field">
                <label>Pedido / objetivo do cliente *</label>
                <input value={form.objective} onChange={updateField("objective")} placeholder="Ex.: repetição de indébito e dano moral" />
              </div>
              <div className="field">
                <label>Parte contrária *</label>
                <input
                  value={form.opposingParty}
                  onChange={updateField("opposingParty")}
                  placeholder="Banco, empresa, ex-empregador, plano de saúde, ex-cônjuge"
                />
              </div>
              <div className="field">
                <label>Período dos fatos *</label>
                <input value={form.factPeriod} onChange={updateField("factPeriod")} placeholder="Ex.: jan/2023 a jul/2024" />
              </div>
              <div className="field">
                <label>Faixa econômica *</label>
                <select value={form.valueRange} onChange={updateField("valueRange")}>
                  <option value="">Selecione</option>
                  {jurisprudenceValueRangeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Fase da análise</label>
                <select value={form.proceduralStage} onChange={updateField("proceduralStage")}>
                  <option value="">Selecione</option>
                  {jurisprudenceStageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Maturidade da prova *</label>
                <select value={form.evidenceStrength} onChange={updateField("evidenceStrength")}>
                  <option value="">Selecione</option>
                  {jurisprudenceEvidenceStrengthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field span-2">
                <label>História contada pelo cliente *</label>
                <textarea
                  value={form.narrative}
                  onChange={updateField("narrative")}
                  placeholder="Descreva os fatos em ordem cronológica: o que aconteceu, quando começou, o que a outra parte fez ou deixou de fazer, o impacto e o que já foi tentado."
                />
                <div className="field-hint">Mínimo recomendado: 180 caracteres. Atual: {narrativeLength}.</div>
              </div>
              <div className="field span-2">
                <label>Resumo das provas já disponíveis *</label>
                <textarea
                  value={form.evidenceSummary}
                  onChange={updateField("evidenceSummary")}
                  placeholder="Liste os documentos ou elementos já disponíveis e explique o que cada um comprova."
                />
              </div>
            </div>

            {areaConfig && (
              <div className="stats-lab-suggestions">
                <span>Sugestões de controvérsia:</span>
                {areaConfig.claimSuggestions.map((suggestion) => (
                  <button key={suggestion} type="button" className="stats-lab-suggestion" onClick={() => applyClaimSuggestion(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            <div className="stats-lab-proof-box">
              <div className="stats-lab-proof-title">Sinais objetivos do caso</div>
              <div className="stats-lab-proof-grid">
                <label className={`stats-lab-proof-item ${form.hasDocuments ? "active" : ""}`}>
                  <input type="checkbox" checked={form.hasDocuments} onChange={updateField("hasDocuments")} />
                  Documentos-chave já em mãos
                </label>
                <label className={`stats-lab-proof-item ${form.hasMessages ? "active" : ""}`}>
                  <input type="checkbox" checked={form.hasMessages} onChange={updateField("hasMessages")} />
                  Mensagens, protocolos ou e-mails
                </label>
                <label className={`stats-lab-proof-item ${form.hasWitnesses ? "active" : ""}`}>
                  <input type="checkbox" checked={form.hasWitnesses} onChange={updateField("hasWitnesses")} />
                  Testemunhas mapeadas
                </label>
                <label className={`stats-lab-proof-item ${form.hasAdministrativeAttempt ? "active" : ""}`}>
                  <input type="checkbox" checked={form.hasAdministrativeAttempt} onChange={updateField("hasAdministrativeAttempt")} />
                  Houve tentativa administrativa prévia
                </label>
                <label className={`stats-lab-proof-item ${form.needsExpertEvidence ? "active" : ""}`}>
                  <input type="checkbox" checked={form.needsExpertEvidence} onChange={updateField("needsExpertEvidence")} />
                  Tema depende ou pode depender de perícia
                </label>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn small" type="button" onClick={handleGenerate} disabled={!canGenerateJurisprudence || isSearchingJurisprudence}>
                {isSearchingJurisprudence ? "Consultando fonte oficial..." : "Montar leitura jurisprudencial"}
              </button>
              <button className="btn ghost small" type="button" onClick={() => setIsCaseModalOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="content-card page-card">
      <div className="page-header">
        <div>
          <div className="eyebrow">{title}</div>
          <h1 className="page-title">Sessão em preparação</h1>
          <div className="page-subtitle">Os atalhos e cadastros principais ficam na área de Pessoas.</div>
        </div>
        <div className="pill">Prévia</div>
      </div>
    </div>
  );
}

const serviceIntakeStatusOptions: Array<{ value: ApiServiceIntake["status"]; label: string }> = [
  { value: "registrado", label: "Registrado" },
  { value: "proposta", label: "Proposta" },
  { value: "fechado", label: "Fechado" },
  { value: "nao_avancou", label: "Não avançou" }
];

const serviceMeetingModeOptions = [
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online" },
  { value: "telefone", label: "Telefone" },
  { value: "whatsapp", label: "WhatsApp" }
];

const serviceStatusLabelMap: Record<ApiServiceIntake["status"], string> = {
  registrado: "Registrado",
  proposta: "Proposta",
  fechado: "Fechado",
  nao_avancou: "Não avançou"
};

const buildEmptyServiceIntakeForm = (user: AuthUser | null): ServiceIntakeFormState => ({
  leadName: "",
  document: "",
  email: "",
  phone: "",
  legalArea: "",
  referralSource: "",
  meetingDate: formatIsoDate(new Date()),
  meetingTime: "",
  meetingMode: "presencial",
  summary: "",
  processOverview: "",
  nextSteps: "",
  agreedFee: "",
  paymentTerms: "",
  handledByName: user?.name || "",
  status: "registrado"
});

const mapServiceIntakeToForm = (record: ApiServiceIntake): ServiceIntakeFormState => ({
  leadName: record.lead_name || "",
  document: record.document || "",
  email: record.email || "",
  phone: record.phone || "",
  legalArea: record.legal_area || "",
  referralSource: record.referral_source || "",
  meetingDate: record.meeting_date || "",
  meetingTime: record.meeting_time || "",
  meetingMode: record.meeting_mode || "presencial",
  summary: record.summary || "",
  processOverview: record.process_overview || "",
  nextSteps: record.next_steps || "",
  agreedFee: typeof record.agreed_fee === "number" ? formatCurrencyBRL(record.agreed_fee) : "",
  paymentTerms: record.payment_terms || "",
  handledByName: record.handled_by_name || "",
  status: record.status || "registrado"
});

const getServiceIntakeTimestamp = (record: ApiServiceIntake) =>
  record.meeting_date || record.updated_at || record.created_at || "";

const sortServiceIntakes = (items: ApiServiceIntake[]) =>
  [...items].sort((left, right) => getServiceIntakeTimestamp(right).localeCompare(getServiceIntakeTimestamp(left)));

const getServiceIntakePreview = (record: ApiServiceIntake) =>
  record.summary?.trim() || record.process_overview?.trim() || record.next_steps?.trim() || "Sem síntese registrada.";

function Service({ user }: { user: AuthUser | null }) {
  const [records, setRecords] = useState<ApiServiceIntake[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<ServiceIntakeFormState>(() => buildEmptyServiceIntakeForm(user));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [inlineMessage, setInlineMessage] = useState("");

  useEffect(() => {
    if (!inlineMessage) return;
    const timeout = window.setTimeout(() => setInlineMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [inlineMessage]);

  useEffect(() => {
    if (!selectedId && !form.handledByName && user?.name) {
      setForm((prev) => ({ ...prev, handledByName: user.name }));
    }
  }, [form.handledByName, selectedId, user?.name]);

  useEffect(() => {
    let cancelled = false;
    const loadRecords = async () => {
      setIsLoading(true);
      setError("");
      try {
        const data = await apiListServiceIntakes();
        if (cancelled) return;
        setRecords(sortServiceIntakes(data));
      } catch (err) {
        if (cancelled) return;
        setError(extractApiErrorMessage(err, "Não foi possível carregar os atendimentos."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadRecords();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRecord = useMemo(
    () => records.find((item) => item.id === selectedId) ?? null,
    [records, selectedId]
  );

  const statusCounts = useMemo(
    () =>
      records.reduce(
        (acc, item) => {
          acc.total += 1;
          if (item.status === "proposta") acc.proposta += 1;
          if (item.status === "fechado") acc.fechado += 1;
          return acc;
        },
        { total: 0, proposta: 0, fechado: 0 }
      ),
    [records]
  );

  const resetForm = () => {
    setSelectedId(null);
    setForm(buildEmptyServiceIntakeForm(user));
    setError("");
  };

  const handleSelectRecord = (record: ApiServiceIntake) => {
    setSelectedId(record.id);
    setForm(mapServiceIntakeToForm(record));
    setError("");
  };

  const handleChangeField =
    <K extends keyof ServiceIntakeFormState>(key: K) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const nextValue = event.target.value;
      setForm((prev) => ({
        ...prev,
        [key]: key === "agreedFee" ? formatCurrencyInputBRL(nextValue) : nextValue
      }));
    };

  const buildPayload = () => ({
    lead_name: form.leadName.trim(),
    document: form.document.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    legal_area: form.legalArea.trim() || undefined,
    referral_source: form.referralSource.trim() || undefined,
    meeting_date: form.meetingDate || undefined,
    meeting_time: form.meetingTime || undefined,
    meeting_mode: form.meetingMode || undefined,
    summary: form.summary.trim() || undefined,
    process_overview: form.processOverview.trim() || undefined,
    next_steps: form.nextSteps.trim() || undefined,
    agreed_fee: form.agreedFee ? parseCurrencyBRL(form.agreedFee) : undefined,
    payment_terms: form.paymentTerms.trim() || undefined,
    handled_by_name: form.handledByName.trim() || undefined,
    status: form.status
  });

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.leadName.trim()) {
      setError("Preencha o nome do interessado.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const payload = buildPayload();
      const saved = selectedRecord
        ? await apiUpdateServiceIntake(selectedRecord.id, payload)
        : await apiCreateServiceIntake(payload);
      setRecords((prev) => {
        const next = selectedRecord ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev];
        return sortServiceIntakes(next);
      });
      setSelectedId(saved.id);
      setForm(mapServiceIntakeToForm(saved));
      setInlineMessage(selectedRecord ? "Atendimento atualizado." : "Atendimento registrado.");
    } catch (err) {
      setError(extractApiErrorMessage(err, "Não foi possível salvar o atendimento."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRecord) return;
    if (!window.confirm(`Remover o atendimento de ${selectedRecord.lead_name}?`)) return;
    setIsDeleting(true);
    setError("");
    try {
      await apiDeleteServiceIntake(selectedRecord.id);
      setRecords((prev) => prev.filter((item) => item.id !== selectedRecord.id));
      resetForm();
      setInlineMessage("Atendimento removido.");
    } catch (err) {
      setError(extractApiErrorMessage(err, "Não foi possível remover o atendimento."));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="content-card page-card service-page">
      <div className="page-header service-header">
        <div>
          <div className="eyebrow">Atendimento</div>
          <h1 className="page-title">Ficha de atendimento</h1>
          <div className="page-subtitle">
            Registre quem é o interessado, como foi a reunião, a estratégia inicial e os valores combinados.
          </div>
        </div>
        <button type="button" className="btn small" onClick={resetForm}>
          Novo atendimento
        </button>
      </div>

      <div className="service-summary-row">
        <div className="service-summary-card">
          <span>Atendimentos</span>
          <strong>{statusCounts.total}</strong>
        </div>
        <div className="service-summary-card">
          <span>Em proposta</span>
          <strong>{statusCounts.proposta}</strong>
        </div>
        <div className="service-summary-card">
          <span>Fechados</span>
          <strong>{statusCounts.fechado}</strong>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {inlineMessage && <div className="agenda-inline">{inlineMessage}</div>}

      <div className="service-layout">
        <aside className="service-sidebar">
          <div className="service-list-card">
            <div className="service-list-head">
              <strong>Histórico</strong>
              <span className="pill">{records.length}</span>
            </div>
            {isLoading ? (
              <div className="service-empty">Carregando atendimentos...</div>
            ) : records.length > 0 ? (
              <div className="service-list">
                {records.map((record) => (
                  <button
                    type="button"
                    key={record.id}
                    className={`service-list-item ${record.id === selectedId ? "active" : ""}`}
                    onClick={() => handleSelectRecord(record)}
                  >
                    <div className="service-list-top">
                      <strong>{record.lead_name}</strong>
                      <span className={`service-status-pill tone-${record.status}`}>{serviceStatusLabelMap[record.status]}</span>
                    </div>
                    <div className="service-list-meta">
                      <span>{record.meeting_date ? formatBrazilDate(record.meeting_date) : "Sem data"}</span>
                      <span>{record.meeting_time || "Sem horário"}</span>
                    </div>
                    <div className="service-list-note">{getServiceIntakePreview(record)}</div>
                    <div className="service-list-footer">
                      <span>{record.handled_by_name || "Sem responsável"}</span>
                      <span>{typeof record.agreed_fee === "number" ? formatCurrencyBRL(record.agreed_fee) : "Sem valor"}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="service-empty">Nenhum atendimento registrado ainda.</div>
            )}
          </div>
        </aside>

        <section className="service-main">
          <form className="service-form-card" onSubmit={handleSave}>
            <div className="service-form-head">
              <div>
                <strong>{selectedRecord ? "Editar atendimento" : "Novo atendimento"}</strong>
                <span>{selectedRecord ? "Atualize a ficha e mantenha o histórico da reunião." : "Preencha a ficha simples do atendimento."}</span>
              </div>
              {selectedRecord?.updated_at ? (
                <div className="service-form-updated">
                  Atualizado em {new Date(selectedRecord.updated_at).toLocaleString("pt-BR")}
                </div>
              ) : null}
            </div>

            <div className="service-section">
              <div className="service-section-title">Cadastro básico</div>
              <div className="service-form-grid">
                <label>
                  Nome do interessado *
                  <input value={form.leadName} onChange={handleChangeField("leadName")} placeholder="Nome completo" />
                </label>
                <label>
                  CPF/CNPJ
                  <input value={form.document} onChange={handleChangeField("document")} placeholder="Documento" />
                </label>
                <label>
                  Telefone / WhatsApp
                  <input value={form.phone} onChange={handleChangeField("phone")} placeholder="(00) 00000-0000" />
                </label>
                <label>
                  E-mail
                  <input type="email" value={form.email} onChange={handleChangeField("email")} placeholder="email@cliente.com" />
                </label>
              </div>
            </div>

            <div className="service-section">
              <div className="service-section-title">Reunião</div>
              <div className="service-form-grid">
                <label>
                  Área / assunto
                  <input value={form.legalArea} onChange={handleChangeField("legalArea")} placeholder="Ex.: Trabalhista, família, consumidor" />
                </label>
                <label>
                  Onde nos conheceu
                  <input value={form.referralSource} onChange={handleChangeField("referralSource")} placeholder="Indicação, Instagram, Google..." />
                </label>
                <label>
                  Data do atendimento
                  <input type="date" value={form.meetingDate} onChange={handleChangeField("meetingDate")} />
                </label>
                <label>
                  Horário
                  <input type="time" value={form.meetingTime} onChange={handleChangeField("meetingTime")} />
                </label>
                <label>
                  Forma do atendimento
                  <select value={form.meetingMode} onChange={handleChangeField("meetingMode")}>
                    {serviceMeetingModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Responsável pelo atendimento
                  <input value={form.handledByName} onChange={handleChangeField("handledByName")} placeholder="Quem conduziu a reunião" />
                </label>
                <label>
                  Status
                  <select value={form.status} onChange={handleChangeField("status")}>
                    {serviceIntakeStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="service-section">
              <div className="service-section-title">Conteúdo do atendimento</div>
              <div className="service-form-grid service-form-grid-wide">
                <label className="service-field-span-2">
                  Síntese da reunião
                  <textarea
                    value={form.summary}
                    onChange={handleChangeField("summary")}
                    placeholder="Resumo objetivo do que o cliente trouxe e do que foi conversado."
                    rows={4}
                  />
                </label>
                <label className="service-field-span-2">
                  Como será o processo
                  <textarea
                    value={form.processOverview}
                    onChange={handleChangeField("processOverview")}
                    placeholder="Explique a estratégia inicial, documentos necessários, riscos e caminho processual."
                    rows={4}
                  />
                </label>
                <label className="service-field-span-2">
                  Próximos passos
                  <textarea
                    value={form.nextSteps}
                    onChange={handleChangeField("nextSteps")}
                    placeholder="Ex.: enviar proposta, aguardar documentos, abrir pasta, agendar retorno."
                    rows={3}
                  />
                </label>
              </div>
            </div>

            <div className="service-section">
              <div className="service-section-title">Financeiro do atendimento</div>
              <div className="service-form-grid">
                <label>
                  Valor acordado
                  <input
                    value={form.agreedFee}
                    onChange={handleChangeField("agreedFee")}
                    placeholder="R$ 0,00"
                    inputMode="decimal"
                  />
                </label>
                <label className="service-field-span-2">
                  Condições / observações financeiras
                  <textarea
                    value={form.paymentTerms}
                    onChange={handleChangeField("paymentTerms")}
                    placeholder="Parcelamento, entrada, consulta paga, êxito, pendência de aprovação..."
                    rows={3}
                  />
                </label>
              </div>
            </div>

            <div className="modal-actions service-actions">
              {selectedRecord ? (
                <button className="btn ghost danger small" type="button" onClick={handleDelete} disabled={isDeleting || isSaving}>
                  Excluir atendimento
                </button>
              ) : (
                <span />
              )}
              <div className="service-actions-right">
                <button className="btn ghost small" type="button" onClick={resetForm} disabled={isSaving}>
                  Limpar
                </button>
                <button className="btn small" type="submit" disabled={isSaving || !form.leadName.trim()}>
                  {isSaving ? "Salvando..." : selectedRecord ? "Salvar alterações" : "Registrar atendimento"}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function FilesUploadModal({
  open,
  clientName,
  cases,
  folderOptions,
  selectedCaseId,
  selectedFolder,
  selectedFile,
  inputKey,
  errorMessage,
  saving,
  onClose,
  onCaseChange,
  onFolderChange,
  onFileChange,
  onSave
}: {
  open: boolean;
  clientName: string;
  cases: ApiCase[];
  folderOptions: { label: string; note: string }[];
  selectedCaseId: string;
  selectedFolder: string;
  selectedFile: File | null;
  inputKey: number;
  errorMessage?: string;
  saving?: boolean;
  onClose: () => void;
  onCaseChange: (value: string) => void;
  onFolderChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
}) {
  if (!open) return null;

  const selectedCase = cases.find((item) => String(item.id) === selectedCaseId) ?? null;
  const destinationLabel = selectedCase
    ? `${selectedCase.number ? `Processo ${selectedCase.number}` : `Processo #${selectedCase.id}`} / ${selectedFolder}`
    : `${clientName} / ${selectedFolder}`;

  return (
    <div className="modal-backdrop">
      <div className="modal-card files-modal-card">
        <div className="modal-head">
          <h2 className="modal-title">Novo arquivo</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar" disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-note">Envie documentos em PDF ou Word com até 10 MB e escolha exatamente em qual pasta eles devem cair.</div>

        <div className="modal-grid files-modal-grid">
          <div className="field span-2">
            <label>Cliente</label>
            <input value={clientName} readOnly />
          </div>

          <div className="field">
            <label>Destino</label>
            <select value={selectedCaseId} onChange={(event) => onCaseChange(event.target.value)}>
              <option value="">Pasta principal do cliente</option>
              {cases.map((caseItem) => (
                <option key={caseItem.id} value={String(caseItem.id)}>
                  {caseItem.number ? `Processo ${caseItem.number}` : `Processo #${caseItem.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Subpasta</label>
            <select value={selectedFolder} onChange={(event) => onFolderChange(event.target.value)}>
              {folderOptions.map((folder) => (
                <option key={folder.label} value={folder.label}>
                  {folder.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field span-2">
            <label>Arquivo</label>
            <input
              key={inputKey}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onFileChange}
            />
          </div>
        </div>

        <div className="files-modal-destination">
          <div className="files-modal-destination-label">Destino atual</div>
          <div className="files-modal-destination-path">{destinationLabel}</div>
        </div>

        {selectedFile && (
          <div className="files-upload-selected">
            <strong>{selectedFile.name}</strong>
            <span>{formatFileSize(selectedFile.size)}</span>
          </div>
        )}

        {errorMessage && <div className="error">{errorMessage}</div>}

        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn" type="button" onClick={onSave} disabled={!selectedFile || saving}>
            {saving ? "Enviando..." : "Enviar arquivo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Files() {
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [cases, setCases] = useState<ApiCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
  const [processSearchTerm, setProcessSearchTerm] = useState("");
  const [isProcessSearchOpen, setIsProcessSearchOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [browserMode, setBrowserMode] = useState<"client" | "process">("client");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [selectedFolderTarget, setSelectedFolderTarget] = useState<FilesFolderTarget | null>(null);
  const [documents, setDocuments] = useState<ApiClientDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedUploadCaseId, setSelectedUploadCaseId] = useState("");
  const [selectedUploadFolder, setSelectedUploadFolder] = useState("");
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null);
  const [documentPendingDelete, setDocumentPendingDelete] = useState<ApiClientDocument | null>(null);
  const [deleteDocumentError, setDeleteDocumentError] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const [uploadInputKey, setUploadInputKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadFileTrees = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [clientData, caseData] = await Promise.all([apiListClients(), apiListCases()]);
        if (cancelled) return;
        setClients(clientData);
        setCases(caseData);
      } catch (err) {
        if (cancelled) return;
        setError(extractApiErrorMessage(err, "Não foi possível carregar clientes e processos para montar as pastas."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadFileTrees();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!documentMessage) return;
    const timeout = window.setTimeout(() => setDocumentMessage(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [documentMessage]);

  const allClientTrees = useMemo(() => {
    const casesByClientId = new Map<number, ApiCase[]>();
    cases.forEach((caseItem) => {
      if (!caseItem.client_id) return;
      const current = casesByClientId.get(caseItem.client_id) || [];
      current.push(caseItem);
      casesByClientId.set(caseItem.client_id, current);
    });

    return [...clients]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      .map((client) => buildClientFileTree(client, casesByClientId.get(client.id) || []));
  }, [cases, clients]);

  const clientSearchResults = useMemo(() => {
    const normalizedTerm = normalizeSearchText(searchTerm.trim());
    const matches = !normalizedTerm
      ? allClientTrees
      : allClientTrees.filter((tree) => tree.searchText.includes(normalizedTerm));
    return matches.slice(0, 8);
  }, [allClientTrees, searchTerm]);

  useEffect(() => {
    if (selectedClientId !== null && !allClientTrees.some((tree) => tree.client.id === selectedClientId)) {
      setSelectedClientId(null);
      setSearchTerm("");
    }
  }, [allClientTrees, selectedClientId]);

  const selectedClientTree = useMemo(
    () => allClientTrees.find((tree) => tree.client.id === selectedClientId) ?? null,
    [allClientTrees, selectedClientId]
  );
  const selectedClientDetails = useMemo(
    () => (selectedClientTree ? toClientRow(selectedClientTree.client) : null),
    [selectedClientTree]
  );

  useEffect(() => {
    if (!selectedClientTree) {
      setBrowserMode("client");
      setSelectedProcessId(null);
      return;
    }
    setSelectedProcessId((current) => {
      if (current !== null && selectedClientTree.cases.some((caseItem) => caseItem.id === current)) {
        return current;
      }
      return selectedClientTree.cases[0]?.id ?? null;
    });
    if (!selectedClientTree.cases.length) {
      setBrowserMode("client");
    }
  }, [selectedClientTree]);

  useEffect(() => {
    if (!selectedClientId) {
      setDocuments([]);
      return;
    }
    let cancelled = false;

    const loadDocuments = async () => {
      setIsLoadingDocuments(true);
      setDocumentsError("");
      try {
        const data = await apiListClientDocuments(selectedClientId);
        if (cancelled) return;
        setDocuments(data);
      } catch (err) {
        if (cancelled) return;
        setDocumentsError(extractApiErrorMessage(err, "Não foi possível carregar os documentos do cliente."));
      } finally {
        if (!cancelled) setIsLoadingDocuments(false);
      }
    };

    void loadDocuments();

    return () => {
      cancelled = true;
    };
  }, [documentsRefreshKey, selectedClientId]);

  useEffect(() => {
    setSelectedUploadCaseId("");
    setSelectedUploadFolder("");
    setSelectedUploadFile(null);
    setUploadError("");
    setProcessSearchTerm("");
    setIsProcessSearchOpen(false);
    setDocumentPendingDelete(null);
    setDeleteDocumentError("");
    setUploadInputKey((value) => value + 1);
    setShowUploadModal(false);
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientTree) {
      if (selectedUploadCaseId) setSelectedUploadCaseId("");
      return;
    }
    if (selectedUploadCaseId && !selectedClientTree.cases.some((item) => String(item.id) === selectedUploadCaseId)) {
      setSelectedUploadCaseId("");
    }
  }, [selectedClientTree, selectedUploadCaseId]);

  const linkedCaseCount = useMemo(() => cases.filter((caseItem) => Number(caseItem.client_id)).length, [cases]);
  const selectedClientFolders = useMemo(
    () => (selectedClientTree ? getClientFolderBlueprint(selectedClientTree.kind) : getClientFolderBlueprint("PF")),
    [selectedClientTree]
  );
  useEffect(() => {
    if (!selectedClientTree) {
      setSelectedFolderTarget(null);
      return;
    }
    if (browserMode === "process") {
      const processId = selectedProcessId ?? selectedClientTree.cases[0]?.id ?? null;
      if (!processId) {
        setSelectedFolderTarget(null);
        return;
      }
      setSelectedFolderTarget((current) => {
        if (current?.scope === "case" && current.caseId === processId && processFolderBlueprint.some((folder) => folder.label === current.folderLabel)) {
          return current;
        }
        const defaultFolder = processFolderBlueprint[0]?.label;
        return defaultFolder ? { scope: "case", caseId: processId, folderLabel: defaultFolder } : null;
      });
      return;
    }
    setSelectedFolderTarget((current) => {
      if (current?.scope === "client" && selectedClientFolders.some((folder) => folder.label === current.folderLabel)) {
        return current;
      }
      const defaultFolder = selectedClientFolders[0]?.label;
      return defaultFolder ? { scope: "client", folderLabel: defaultFolder } : null;
    });
  }, [browserMode, selectedClientFolders, selectedClientTree, selectedProcessId]);
  const selectedUploadCase = useMemo(
    () => selectedClientTree?.cases.find((item) => String(item.id) === selectedUploadCaseId) ?? null,
    [selectedClientTree, selectedUploadCaseId]
  );
  const uploadFolderOptions = useMemo(
    () => (selectedUploadCase ? [...processFolderBlueprint] : selectedClientFolders),
    [selectedClientFolders, selectedUploadCase]
  );
  const rootFolderCards = useMemo(() => {
    return selectedClientFolders.map((folder) => {
      const items = documents.filter((record) => !record.case_id && record.folder_label === folder.label);
      const latestRecord = [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      return {
        ...folder,
        count: items.length,
        latestRecord
      };
    });
  }, [documents, selectedClientFolders]);
  const processCards = useMemo(() => {
    return (selectedClientTree?.cases || []).map((caseItem) => {
      const caseDocuments = documents.filter((record) => record.case_id === caseItem.id);
      const latestRecord = [...caseDocuments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      return {
        caseItem,
        latestRecord,
        totalDocuments: caseDocuments.length,
        sections: processFolderBlueprint.map((folder) => ({
          ...folder,
          count: caseDocuments.filter((record) => record.folder_label === folder.label).length
        }))
      };
    });
  }, [documents, selectedClientTree]);
  const caseLabelById = useMemo(() => {
    const map = new Map<number, string>();
    selectedClientTree?.cases.forEach((caseItem) => {
      map.set(caseItem.id, caseItem.number ? `Processo ${caseItem.number}` : `Processo #${caseItem.id}`);
    });
    return map;
  }, [selectedClientTree]);
  const selectedProcessCard = useMemo(
    () => processCards.find(({ caseItem }) => caseItem.id === selectedProcessId) ?? null,
    [processCards, selectedProcessId]
  );
  const processSearchEntries = useMemo(
    () =>
      processCards.map(({ caseItem, totalDocuments }) => ({
        caseItem,
        totalDocuments,
        label: getCasePickerLabel(caseItem),
        subtitle: [caseItem.title?.trim(), caseItem.status?.trim()].filter(Boolean).join(" · ") || "Sem detalhes adicionais",
        searchText: normalizeSearchText(
          [caseItem.number, extractCaseCounterparty(caseItem.title), caseItem.title, caseItem.status]
            .filter(Boolean)
            .join(" ")
        )
      })),
    [processCards]
  );
  const processSearchResults = useMemo(() => {
    const normalizedTerm = normalizeSearchText(processSearchTerm.trim());
    const matches = !normalizedTerm
      ? processSearchEntries
      : processSearchEntries.filter((entry) => entry.searchText.includes(normalizedTerm));
    return matches.slice(0, 8);
  }, [processSearchEntries, processSearchTerm]);
  const selectedProcessSearchEntry = useMemo(
    () => processSearchEntries.find((entry) => entry.caseItem.id === selectedProcessId) ?? null,
    [processSearchEntries, selectedProcessId]
  );
  const activeFolderCards = useMemo(
    () => (browserMode === "client" ? rootFolderCards : selectedProcessCard?.sections || []),
    [browserMode, rootFolderCards, selectedProcessCard]
  );
  const browserPanelTitle = browserMode === "client" ? "Pastas do cliente" : "Pastas do processo";
  const browserPanelSubtitle =
    browserMode === "client"
      ? "Selecione uma pasta principal do cliente para visualizar os arquivos abaixo."
      : selectedProcessCard
        ? "Selecione uma pasta do processo para visualizar os documentos correspondentes."
        : "Selecione um processo para visualizar as pastas e os documentos.";
  const selectedProcessLabel = selectedProcessSearchEntry?.label || "";
  const selectedProcessMeta = selectedProcessSearchEntry?.subtitle || "";
  useEffect(() => {
    if (isProcessSearchOpen) return;
    if (!selectedProcessSearchEntry) {
      setProcessSearchTerm("");
      return;
    }
    setProcessSearchTerm(selectedProcessSearchEntry.label);
  }, [isProcessSearchOpen, selectedProcessSearchEntry]);
  const selectedFolderDocuments = useMemo(() => {
    if (!selectedFolderTarget) return [];
    return documents.filter((record) =>
      selectedFolderTarget.scope === "client"
        ? !record.case_id && record.folder_label === selectedFolderTarget.folderLabel
        : record.case_id === selectedFolderTarget.caseId && record.folder_label === selectedFolderTarget.folderLabel
    );
  }, [documents, selectedFolderTarget]);
  const selectedFolderTitle = useMemo(() => {
    if (!selectedFolderTarget) return "Documentos enviados";
    if (selectedFolderTarget.scope === "client") return selectedFolderTarget.folderLabel;
    return `${caseLabelById.get(selectedFolderTarget.caseId) || "Processo"} / ${selectedFolderTarget.folderLabel}`;
  }, [caseLabelById, selectedFolderTarget]);
  const selectedFolderDescription = useMemo(() => {
    if (!selectedFolderTarget) return "Selecione uma pasta acima para visualizar apenas os arquivos dela.";
    if (selectedFolderTarget.scope === "client") return "Arquivos armazenados na pasta principal selecionada do cliente.";
    return "Arquivos armazenados apenas nesta subpasta do processo selecionado.";
  }, [selectedFolderTarget]);

  useEffect(() => {
    if (!uploadFolderOptions.length) {
      if (selectedUploadFolder) setSelectedUploadFolder("");
      return;
    }
    if (!uploadFolderOptions.some((folder) => folder.label === selectedUploadFolder)) {
      setSelectedUploadFolder(uploadFolderOptions[0].label);
    }
  }, [selectedUploadFolder, uploadFolderOptions]);

  const handleSelectUploadFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    if (!nextFile) {
      setSelectedUploadFile(null);
      return;
    }
    const normalizedName = nextFile.name.toLowerCase();
    const hasAllowedExtension = filesAllowedUploadExtensions.some((extension) => normalizedName.endsWith(extension));
    const hasAllowedType = !nextFile.type || filesAllowedUploadMimeTypes.includes(nextFile.type);
    if (!hasAllowedExtension || !hasAllowedType) {
      setSelectedUploadFile(null);
      setUploadError("Envie apenas arquivos PDF ou Word.");
      event.target.value = "";
      return;
    }
    if (nextFile.size > clientDocumentMaxSizeBytes) {
      setSelectedUploadFile(null);
      setUploadError("O arquivo excede o limite de 10 MB.");
      event.target.value = "";
      return;
    }
    setUploadError("");
    setSelectedUploadFile(nextFile);
  };

  const handleSearchClient = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setSearchTerm(nextValue);
    setIsClientSearchOpen(true);
    if (!selectedClientTree || nextValue.trim() !== selectedClientTree.client.name) {
      setSelectedClientId(null);
    }
  };

  const handleSelectClientTree = (tree: ClientFileTree) => {
    setSelectedClientId(tree.client.id);
    setSearchTerm(tree.client.name);
    setIsClientSearchOpen(false);
  };

  const handleSearchProcess = (event: ChangeEvent<HTMLInputElement>) => {
    setProcessSearchTerm(event.target.value);
    setIsProcessSearchOpen(true);
  };

  const handleSelectProcess = (caseId: number) => {
    const selectedEntry = processSearchEntries.find((entry) => entry.caseItem.id === caseId);
    setBrowserMode("process");
    setSelectedProcessId(caseId);
    setProcessSearchTerm(selectedEntry?.label || "");
    setIsProcessSearchOpen(false);
  };

  const resetUploadForm = () => {
    setSelectedUploadCaseId("");
    setSelectedUploadFolder("");
    setSelectedUploadFile(null);
    setUploadError("");
    setUploadInputKey((value) => value + 1);
  };

  const handleOpenUploadModal = () => {
    if (!selectedClientTree) return;
    resetUploadForm();
    if (selectedFolderTarget?.scope === "case") {
      setSelectedUploadCaseId(String(selectedFolderTarget.caseId));
      setSelectedUploadFolder(selectedFolderTarget.folderLabel);
    } else if (selectedFolderTarget?.scope === "client") {
      setSelectedUploadFolder(selectedFolderTarget.folderLabel);
    }
    setShowUploadModal(true);
  };

  const handleCloseUploadModal = () => {
    if (isUploadingDocument) return;
    setShowUploadModal(false);
    resetUploadForm();
  };

  const handleUploadDocument = async () => {
    if (!selectedClientTree) return;
    if (!selectedUploadFolder) {
      setUploadError("Selecione uma subpasta para enviar o documento.");
      return;
    }
    if (!selectedUploadFile) {
      setUploadError("Selecione um arquivo PDF ou Word para enviar.");
      return;
    }
    setIsUploadingDocument(true);
    setUploadError("");
    try {
      await apiUploadClientDocument({
        clientId: selectedClientTree.client.id,
        caseId: selectedUploadCase?.id,
        folderLabel: selectedUploadFolder,
        file: selectedUploadFile
      });
      setSelectedUploadFile(null);
      setDocumentMessage("Documento enviado com sucesso.");
      setDocumentsRefreshKey((value) => value + 1);
      setShowUploadModal(false);
      resetUploadForm();
    } catch (err) {
      setUploadError(extractApiErrorMessage(err, "Não foi possível enviar o documento."));
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleDownloadStoredDocument = async (record: ApiClientDocument) => {
    setDocumentsError("");
    try {
      const fileBlob = await apiDownloadClientDocument(record.id);
      const objectUrl = window.URL.createObjectURL(fileBlob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = record.original_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setDocumentMessage("Download iniciado com sucesso.");
    } catch (err) {
      setDocumentsError(extractApiErrorMessage(err, "Não foi possível baixar o documento."));
    }
  };

  const handleRequestDeleteStoredDocument = (record: ApiClientDocument) => {
    setDeleteDocumentError("");
    setDocumentsError("");
    setDocumentPendingDelete(record);
  };

  const handleDeleteStoredDocument = async () => {
    if (!documentPendingDelete) return;
    const record = documentPendingDelete;
    setDeletingDocumentId(record.id);
    setDeleteDocumentError("");
    setDocumentsError("");
    try {
      await apiDeleteClientDocument(record.id);
      setDocuments((prev) => prev.filter((item) => item.id !== record.id));
      setDocumentMessage("Documento removido com sucesso.");
      setDocumentPendingDelete(null);
    } catch (err) {
      setDeleteDocumentError(extractApiErrorMessage(err, "Não foi possível remover o documento."));
    } finally {
      setDeletingDocumentId(null);
    }
  };

  return (
    <div className="content-card page-card files-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Arquivos</div>
        </div>
        <div className="files-page-actions">
          <div className="files-header-search-wrap">
            <div className="search-input files-header-search">
              <input
                placeholder="Buscar cliente"
                value={searchTerm}
                onChange={handleSearchClient}
                onFocus={() => setIsClientSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setIsClientSearchOpen(false), 120)}
              />
            </div>
            {isClientSearchOpen && (
              <div className="files-client-picker">
                {isLoading ? (
                  <div className="files-picker-empty">Carregando clientes...</div>
                ) : error ? (
                  <div className="files-picker-empty">{error}</div>
                ) : clientSearchResults.length === 0 ? (
                  <div className="files-picker-empty">
                    {allClientTrees.length === 0
                      ? "Cadastre um cliente na aba Pessoas para gerar a primeira pasta."
                      : "Nenhum cliente encontrado para a busca informada."}
                  </div>
                ) : (
                  <>
                    {clientSearchResults.map((tree) => (
                      <button
                        key={tree.client.id}
                        type="button"
                        className={`files-picker-item ${tree.client.id === selectedClientId ? "active" : ""}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSelectClientTree(tree)}
                      >
                        <div className="files-client-avatar">{tree.client.name.trim().charAt(0).toUpperCase() || "C"}</div>
                        <div className="files-picker-copy">
                          <div className="files-client-row">
                            <div className="files-client-name">{tree.client.name}</div>
                            <div className="files-client-folder-count">{tree.totalFolders}</div>
                          </div>
                          <div className="files-client-sub">
                            {tree.cases.length
                              ? `${tree.cases.length} processo${tree.cases.length > 1 ? "s" : ""} com subpastas`
                              : "Estrutura pronta para receber o primeiro processo"}
                          </div>
                          <div className="files-client-tags">
                            <span className="files-chip">{tree.kind === "PF" ? "Pessoa física" : "Pessoa jurídica"}</span>
                            {tree.client.document && <span className="files-chip muted">{tree.client.document}</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                    {!searchTerm.trim() && allClientTrees.length > clientSearchResults.length && (
                      <div className="files-picker-footer">Mostrando os primeiros 8 clientes. Digite para refinar.</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="files-new-btn"
            onClick={handleOpenUploadModal}
            disabled={!selectedClientTree}
            aria-label="Novo arquivo"
          >
            <span className="files-new-btn-plus" aria-hidden="true">
              +
            </span>
            <span>Novo</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>
      {error && !isClientSearchOpen && <div className="error">{error}</div>}

      <section className="files-workspace">
        <div className="files-surface files-overview-card">
          <div className="files-overview-main">
            <div className="eyebrow">Explorador de arquivos</div>
            <h2 className="files-overview-title">{selectedClientDetails ? selectedClientDetails.name : "Selecione um cliente"}</h2>
            {selectedClientTree && selectedClientDetails ? (
              <div className="files-overview-meta">
                {selectedClientDetails.phone !== "-" && <span className="files-overview-meta-item">{selectedClientDetails.phone}</span>}
                {selectedClientDetails.email !== "-" && <span className="files-overview-meta-item">{selectedClientDetails.email}</span>}
                {selectedClientDetails.city !== "-" && <span className="files-overview-meta-item">{selectedClientDetails.city}</span>}
                <span className="files-chip">{selectedClientTree.kind === "PF" ? "Pessoa física" : "Pessoa jurídica"}</span>
                <span className="files-chip">{selectedClientTree.cases.length} processo{selectedClientTree.cases.length === 1 ? "" : "s"}</span>
                <span className="files-chip">{documents.length} arquivo{documents.length === 1 ? "" : "s"}</span>
              </div>
            ) : (
              <>
                <div className="files-overview-sub">
                  Use a busca acima para localizar o cliente e abrir a estrutura de documentos sem uma lista lateral fixa.
                </div>
                <div className="files-client-tags">
                  <span className="files-chip">{allClientTrees.length} cliente{allClientTrees.length === 1 ? "" : "s"} com pasta</span>
                  <span className="files-chip">{linkedCaseCount} processo{linkedCaseCount === 1 ? "" : "s"}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {!selectedClientTree ? (
          <div className="files-surface files-empty-workspace">
            {isLoading
              ? "Carregando estrutura de pastas..."
              : allClientTrees.length === 0
                ? "Cadastre um cliente na aba Pessoas para gerar a primeira pasta."
                : "Busque um cliente e selecione-o na barra acima para visualizar a estrutura de arquivos."}
          </div>
        ) : (
          <div className="files-surface files-browser-panel">
            <div className="files-browser-top">
              <div>
                <div className="files-card-title">Arquivos</div>
                <div className="files-card-sub">Escolha entre as pastas principais do cliente ou as pastas de um processo específico.</div>
              </div>
              <div className="wallets-switch files-browser-switch" role="tablist" aria-label="Modo do explorador">
                <button
                  type="button"
                  className={`wallets-switch-btn ${browserMode === "client" ? "active" : ""}`}
                  onClick={() => setBrowserMode("client")}
                  aria-pressed={browserMode === "client"}
                >
                  Cliente
                </button>
                <button
                  type="button"
                  className={`wallets-switch-btn ${browserMode === "process" ? "active" : ""}`}
                  onClick={() => {
                    if (!selectedClientTree.cases.length) return;
                    setBrowserMode("process");
                  }}
                  aria-pressed={browserMode === "process"}
                  disabled={!selectedClientTree.cases.length}
                >
                  Processos
                </button>
              </div>
            </div>

            {browserMode === "process" && (
              <>
                {processCards.length === 0 ? (
                  <div className="files-empty">Este cliente ainda não possui processos vinculados.</div>
                ) : (
                  <>
                    <div className="files-process-search-wrap">
                      <div className="search-input files-process-search">
                        <input
                          placeholder="Buscar processo por número ou parte contrária"
                          value={processSearchTerm}
                          onChange={handleSearchProcess}
                          onFocus={() => setIsProcessSearchOpen(true)}
                          onBlur={() => window.setTimeout(() => setIsProcessSearchOpen(false), 120)}
                        />
                      </div>
                      {isProcessSearchOpen && (
                        <div className="files-client-picker">
                          {processSearchResults.length === 0 ? (
                            <div className="files-picker-empty">Nenhum processo encontrado para a busca informada.</div>
                          ) : (
                            <>
                              {processSearchResults.map((entry) => (
                                <button
                                  key={entry.caseItem.id}
                                  type="button"
                                  className={`files-picker-item ${selectedProcessId === entry.caseItem.id ? "active" : ""}`}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => handleSelectProcess(entry.caseItem.id)}
                                >
                                  <div className="files-picker-copy">
                                    <div className="files-client-row">
                                      <div className="files-client-name">{entry.label}</div>
                                      <div className="files-client-folder-count">{entry.totalDocuments}</div>
                                    </div>
                                    <div className="files-client-sub">{entry.subtitle}</div>
                                  </div>
                                </button>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedProcessCard && (
                      <div className="files-process-current">
                        <div className="files-process-current-title">{selectedProcessLabel}</div>
                        <div className="files-process-current-sub">{selectedProcessMeta}</div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {browserMode === "process" && processCards.length > 0 && !selectedProcessCard ? (
              <div className="files-empty">Selecione um processo para visualizar as pastas e os documentos.</div>
            ) : (
              <>
                <div className="files-panel-section">
                  <div className="files-card-head">
                    <div>
                      <div className="files-card-title">{browserPanelTitle}</div>
                      <div className="files-card-sub">{browserPanelSubtitle}</div>
                    </div>
                  </div>
                  <div className="files-folder-grid">
                    {activeFolderCards.map((folder) => (
                      <button
                        key={`${browserMode}-${folder.label}`}
                        type="button"
                        className={`files-folder-card ${folder.count > 0 ? "has-files" : ""} ${
                          browserMode === "client"
                            ? selectedFolderTarget?.scope === "client" && selectedFolderTarget.folderLabel === folder.label
                              ? "active"
                              : ""
                            : selectedFolderTarget?.scope === "case" &&
                                selectedProcessCard &&
                                selectedFolderTarget.caseId === selectedProcessCard.caseItem.id &&
                                selectedFolderTarget.folderLabel === folder.label
                              ? "active"
                              : ""
                        }`}
                        onClick={() => {
                          if (browserMode === "client") {
                            setSelectedFolderTarget({ scope: "client", folderLabel: folder.label });
                            return;
                          }
                          if (!selectedProcessCard) return;
                          setSelectedFolderTarget({ scope: "case", caseId: selectedProcessCard.caseItem.id, folderLabel: folder.label });
                        }}
                      >
                        <div className="files-folder-top">
                          <div className="files-folder-name">{folder.label}</div>
                          <div className="files-folder-count">{folder.count}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="files-panel-section files-browser-documents">
                  <div className="files-card-head">
                    <div>
                      <div className="files-card-title">{selectedFolderTitle}</div>
                      <div className="files-card-sub">{selectedFolderDescription}</div>
                    </div>
                    <div className="files-panel-badge">{selectedFolderDocuments.length}</div>
                  </div>

                  {documentsError && <div className="error">{documentsError}</div>}

                  {isLoadingDocuments ? (
                    <div className="files-empty">Carregando documentos...</div>
                  ) : selectedFolderDocuments.length === 0 ? (
                    <div className="files-empty">Nenhum documento enviado ainda para a pasta selecionada.</div>
                  ) : (
                    <div className="files-document-list">
                      {selectedFolderDocuments.map((record) => (
                        <div key={record.id} className="files-document-item">
                          <div className="files-document-main">
                            <div className="files-document-name">{record.original_name}</div>
                            <div className="files-document-meta">
                              <span>{record.case_id ? `${caseLabelById.get(record.case_id) || "Processo"} / ${record.folder_label}` : `${selectedClientTree.client.name} / ${record.folder_label}`}</span>
                              <span>{formatFileSize(record.size_bytes)}</span>
                              <span>{formatDateTimePtBr(record.created_at)}</span>
                            </div>
                          </div>
                          <div className="files-document-actions">
                            <button className="btn ghost small" type="button" onClick={() => handleDownloadStoredDocument(record)}>
                              Baixar
                            </button>
                            <button
                              className="btn ghost small danger"
                              type="button"
                              disabled={deletingDocumentId === record.id}
                              onClick={() => handleRequestDeleteStoredDocument(record)}
                            >
                              {deletingDocumentId === record.id ? "Removendo..." : "Excluir"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {documentMessage && (
        <div className="files-status-message" role="status" aria-live="polite">
          {documentMessage}
        </div>
      )}

      <ConfirmDeleteModal
        open={documentPendingDelete !== null}
        title="Excluir documento"
        message={
          documentPendingDelete
            ? `Deseja remover o documento ${documentPendingDelete.original_name}?`
            : ""
        }
        confirmLabel="Excluir documento"
        busy={deletingDocumentId !== null}
        errorMessage={deleteDocumentError}
        onCancel={() => {
          if (deletingDocumentId !== null) return;
          setDeleteDocumentError("");
          setDocumentPendingDelete(null);
        }}
        onConfirm={handleDeleteStoredDocument}
      />

      {selectedClientTree && (
        <FilesUploadModal
          open={showUploadModal}
          clientName={selectedClientTree.client.name}
          cases={selectedClientTree.cases}
          folderOptions={uploadFolderOptions}
          selectedCaseId={selectedUploadCaseId}
          selectedFolder={selectedUploadFolder}
          selectedFile={selectedUploadFile}
          inputKey={uploadInputKey}
          errorMessage={uploadError}
          saving={isUploadingDocument}
          onClose={handleCloseUploadModal}
          onCaseChange={setSelectedUploadCaseId}
          onFolderChange={setSelectedUploadFolder}
          onFileChange={handleSelectUploadFile}
          onSave={handleUploadDocument}
        />
      )}
    </div>
  );
}

function Finance() {
  const today = useMemo(() => new Date(), []);
  const [entries, setEntries] = useState<FinanceEntry[]>(seedFinanceEntries);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [entriesError, setEntriesError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [periodFilter, setPeriodFilter] = useState<FinancePeriodFilter>("this-month");
  const [entryTypeFilter, setEntryTypeFilter] = useState<FinanceEntryType | "todos">("todos");
  const [clientFilter, setClientFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<FinanceStatus | "todos">("todos");
  const [chartView, setChartView] = useState<FinanceChartView>("year");
  const [selectedChartYear, setSelectedChartYear] = useState(() => today.getFullYear());
  const [selectedChartMonth, setSelectedChartMonth] = useState(() => today.getMonth());
  const [chartDrilldown, setChartDrilldown] = useState<FinanceChartDrilldown | null>(null);
  const [hoveredChartItem, setHoveredChartItem] = useState<FinanceChartHoverState | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [activeFinanceEntry, setActiveFinanceEntry] = useState<FinanceEntry | null>(null);
  const [showDeleteFinanceConfirm, setShowDeleteFinanceConfirm] = useState(false);
  const [inlineMessage, setInlineMessage] = useState("");
  const [registeredClients, setRegisteredClients] = useState<ApiClient[]>([]);
  const [registeredCases, setRegisteredCases] = useState<ApiCase[]>([]);
  const [isLoadingRevenueLinks, setIsLoadingRevenueLinks] = useState(true);
  const [revenueLinksError, setRevenueLinksError] = useState("");
  const [isSavingRevenue, setIsSavingRevenue] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isSavingFinanceEntry, setIsSavingFinanceEntry] = useState(false);
  const [isDeletingFinanceEntry, setIsDeletingFinanceEntry] = useState(false);
  const [revenueForm, setRevenueForm] = useState<RevenueForm>(emptyRevenueForm);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm);
  const [financeSettlementForm, setFinanceSettlementForm] = useState<FinanceSettlementForm>(emptyFinanceSettlementForm);
  const overviewSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!inlineMessage) return;
    const timeout = window.setTimeout(() => setInlineMessage(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [inlineMessage]);

  useEffect(() => {
    setChartDrilldown(null);
    setHoveredChartItem(null);
  }, [chartView, selectedChartMonth, selectedChartYear]);

  useEffect(() => {
    const loadFinanceLinks = async () => {
      setIsLoadingRevenueLinks(true);
      setRevenueLinksError("");
      try {
        const [clients, cases] = await Promise.all([apiListClients(), apiListCases()]);
        setRegisteredClients(clients);
        setRegisteredCases(cases);
      } catch (err) {
        setRevenueLinksError(extractApiErrorMessage(err, "Não foi possível carregar pessoas e processos para vincular a receita."));
      } finally {
        setIsLoadingRevenueLinks(false);
      }
    };
    void loadFinanceLinks();
  }, []);

  useEffect(() => {
    const loadEntries = async () => {
      setIsLoadingEntries(true);
      setEntriesError("");
      try {
        const data = await apiListFinanceEntries();
        setEntries(data.map(toFinanceEntry));
      } catch (err) {
        setEntriesError(extractApiErrorMessage(err, "Não foi possível carregar os lançamentos financeiros da conta."));
      } finally {
        setIsLoadingEntries(false);
      }
    };
    void loadEntries();
  }, []);

  const revenueEntries = useMemo(() => entries.filter((entry) => entry.entryType === "receita"), [entries]);
  const expenseEntries = useMemo(() => entries.filter((entry) => entry.entryType === "despesa"), [entries]);
  const clientsById = useMemo(() => {
    return registeredClients.reduce<Record<number, ApiClient>>((acc, client) => {
      acc[client.id] = client;
      return acc;
    }, {});
  }, [registeredClients]);
  const sortedRevenueClients = useMemo(() => {
    return [...registeredClients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [registeredClients]);
  const filteredRevenueCases = useMemo(() => {
    const selectedClientId = Number(revenueForm.clientId);
    const scopedCases =
      selectedClientId > 0
        ? registeredCases.filter((item) => item.client_id === selectedClientId)
        : registeredCases;
    return [...scopedCases].sort((a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true, sensitivity: "base" }));
  }, [registeredCases, revenueForm.clientId]);
  const financeClientOptions = useMemo(() => {
    const unique = Array.from(new Set(entries.map((entry) => entry.client.trim()).filter(Boolean)));
    return unique.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [entries]);
  const currentMonthLabel = useMemo(
    () => new Date(selectedChartYear, selectedChartMonth, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    [selectedChartMonth, selectedChartYear]
  );
  const financeChartYearOptions = useMemo(() => {
    const entryYears = entries
      .map((entry) => toDateStart(entry.dueDate)?.getFullYear() ?? null)
      .filter((value): value is number => value !== null);
    const baseMinYear = entryYears.length ? Math.min(...entryYears) : today.getFullYear();
    const baseMaxYear = entryYears.length ? Math.max(...entryYears) : today.getFullYear();
    const minYear = Math.min(baseMinYear, today.getFullYear() - 2);
    const maxYear = Math.max(baseMaxYear, today.getFullYear() + 2);
    return Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  }, [entries, today]);

  const expectedRevenue = useMemo(
    () => revenueEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [revenueEntries]
  );
  const receivedRevenue = useMemo(
    () => revenueEntries.reduce((sum, entry) => sum + getFinanceSettledAmount(entry), 0),
    [revenueEntries]
  );
  const overdueRevenue = useMemo(
    () =>
      revenueEntries.reduce((sum, entry) => {
        if (getFinanceStatus(entry) === "Pago" || getFinanceStatus(entry) === "Parcial") return sum;
        return getFinanceStatus(entry) === "Vencido" ? sum + entry.amount : sum;
      }, 0),
    [revenueEntries]
  );
  const totalExpenses = useMemo(
    () => expenseEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [expenseEntries]
  );

  const dueThisWeekCount = useMemo(() => {
    return revenueEntries.filter((entry) => {
      if (getFinanceStatus(entry) === "Pago" || getFinanceStatus(entry) === "Parcial") return false;
      const days = daysFromToday(entry.dueDate);
      return days >= 0 && days <= 7;
    }).length;
  }, [revenueEntries]);

  const overdueClientsCount = useMemo(() => {
    const unique = new Set<string>();
    revenueEntries.forEach((entry) => {
      if (getFinanceStatus(entry) === "Pago" || getFinanceStatus(entry) === "Parcial") return;
      if (getFinanceStatus(entry) === "Vencido" && entry.client.trim()) {
        unique.add(entry.client.trim().toLowerCase());
      }
    });
    return unique.size;
  }, [revenueEntries]);

  const receiptRate = expectedRevenue > 0 ? Math.round((receivedRevenue / expectedRevenue) * 100) : 0;

  const annualChartData = useMemo<FinanceComparisonChartItem[]>(() => {
    const expectedByMonth = Array.from({ length: 12 }, () => 0);
    const receivedByMonth = Array.from({ length: 12 }, () => 0);
    const expenseByMonth = Array.from({ length: 12 }, () => 0);

    entries.forEach((entry) => {
      const dueDate = toDateStart(entry.dueDate);
      if (!dueDate || dueDate.getFullYear() !== selectedChartYear) return;
      const monthIndex = dueDate.getMonth();
      if (entry.entryType === "receita") {
        expectedByMonth[monthIndex] += entry.amount;
        receivedByMonth[monthIndex] += getFinanceSettledAmount(entry);
      } else {
        expenseByMonth[monthIndex] += entry.amount;
      }
    });

    return financeMonths.map((label, index) => ({
      key: label,
      label,
      tooltipLabel: `${financeMonthOptions[index]?.label || label} de ${selectedChartYear}`,
      expected: expectedByMonth[index],
      received: receivedByMonth[index],
      expense: expenseByMonth[index],
      result: receivedByMonth[index] - expenseByMonth[index],
      drilldown: {
        key: `year-${selectedChartYear}-${index}`,
        label: `${financeMonthOptions[index]?.label || label} de ${selectedChartYear}`,
        kind: "month",
        year: selectedChartYear,
        month: index
      }
    }));
  }, [entries, selectedChartYear]);
  const monthlyChartData = useMemo<FinanceComparisonChartItem[]>(() => {
    const daysInMonth = new Date(selectedChartYear, selectedChartMonth + 1, 0).getDate();
    const highlightedDays = new Set(
      daysInMonth <= 7 ? Array.from({ length: daysInMonth }, (_, index) => index + 1) : [1, 5, 10, 15, 20, 25, daysInMonth]
    );
    const expectedByDay = Array.from({ length: daysInMonth }, () => 0);
    const receivedByDay = Array.from({ length: daysInMonth }, () => 0);
    const expenseByDay = Array.from({ length: daysInMonth }, () => 0);

    entries.forEach((entry) => {
      const dueDate = toDateStart(entry.dueDate);
      if (!dueDate || dueDate.getFullYear() !== selectedChartYear || dueDate.getMonth() !== selectedChartMonth) return;
      const dayIndex = dueDate.getDate() - 1;
      if (entry.entryType === "receita") {
        expectedByDay[dayIndex] += entry.amount;
        receivedByDay[dayIndex] += getFinanceSettledAmount(entry);
      } else {
        expenseByDay[dayIndex] += entry.amount;
      }
    });

    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const expected = expectedByDay[index];
      const received = receivedByDay[index];
      const expense = expenseByDay[index];
      return {
        key: `day-${day}`,
        label: highlightedDays.has(day) ? String(day).padStart(2, "0") : "",
        tooltipLabel: `${String(day).padStart(2, "0")}/${String(selectedChartMonth + 1).padStart(2, "0")}/${selectedChartYear}`,
        expected,
        received,
        expense,
        result: received - expense,
        drilldown: {
          key: `month-${selectedChartYear}-${selectedChartMonth}-${day}`,
          label: `${String(day).padStart(2, "0")}/${String(selectedChartMonth + 1).padStart(2, "0")}/${selectedChartYear}`,
          kind: "day",
          year: selectedChartYear,
          month: selectedChartMonth,
          day
        }
      };
    });
  }, [entries, selectedChartMonth, selectedChartYear]);
  const annualResult = useMemo(
    () => annualChartData.reduce((sum, item) => sum + item.result, 0),
    [annualChartData]
  );
  const monthlyResult = useMemo(
    () => monthlyChartData.reduce((sum, item) => sum + item.result, 0),
    [monthlyChartData]
  );
  const comparisonChartData = chartView === "year" ? annualChartData : monthlyChartData;
  const comparisonChartTitle = chartView === "year" ? "Previsão Anual" : "Previsão Mensal";
  const comparisonChartCaption =
    chartView === "year"
      ? "Receita prevista, receita recebida, despesas e linha de resultado por mês."
      : `Receita prevista, receita recebida, despesas e linha de resultado por dia em ${currentMonthLabel}.`;
  const comparisonChartResultLabel = chartView === "year" ? "Resultado anual" : "Resultado do mês";
  const comparisonChartResult = chartView === "year" ? annualResult : monthlyResult;
  const comparisonChartScale = useMemo(() => {
    const values = comparisonChartData.flatMap((item) => [item.expected, item.received, item.expense, item.result]);
    return buildNiceChartScale(values, 5);
  }, [comparisonChartData]);
  const comparisonChartTicks = useMemo(() => {
    return [...comparisonChartScale.ticks]
      .reverse()
      .map((tick) => ({
        value: tick,
        label: formatCurrencyAxis(tick),
        top: `${((comparisonChartScale.max - tick) / comparisonChartScale.range) * 100}%`
      }));
  }, [comparisonChartScale]);
  const buildComparisonPoints = (values: number[]) =>
    values.map((value, index) => ({
      value,
      x: values.length === 1 ? 50 : ((index + 0.5) / values.length) * 100,
      y: ((comparisonChartScale.max - value) / comparisonChartScale.range) * 100
    }));
  const comparisonChartResultPoints = useMemo(
    () => buildComparisonPoints(comparisonChartData.map((item) => item.result)),
    [comparisonChartData, comparisonChartScale]
  );
  const comparisonChartResultLine = useMemo(
    () => buildSmoothChartPath(comparisonChartResultPoints),
    [comparisonChartResultPoints]
  );
  const comparisonChartGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${comparisonChartData.length}, minmax(${chartView === "year" ? 42 : 18}px, 1fr))`
    }),
    [chartView, comparisonChartData.length]
  );
  const comparisonChartCanvasStyle = useMemo(
    () => (chartView === "month" ? { minWidth: `${Math.max(860, comparisonChartData.length * 28 + 72)}px` } : undefined),
    [chartView, comparisonChartData.length]
  );
  const toComparisonBarStyle = (value: number) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    const startValue = Math.min(0, safeValue);
    const endValue = Math.max(0, safeValue);
    return {
      height: `${((endValue - startValue) / comparisonChartScale.range) * 100}%`,
      bottom: `${((startValue - comparisonChartScale.min) / comparisonChartScale.range) * 100}%`
    };
  };
  const hoveredChartTooltipLeft = hoveredChartItem
    ? `${comparisonChartData.length === 1 ? 50 : ((hoveredChartItem.index + 0.5) / comparisonChartData.length) * 100}%`
    : "50%";

  const handleSelectChartColumn = (item: FinanceComparisonChartItem) => {
    setPeriodFilter("all");
    setChartDrilldown((current) => (current?.key === item.drilldown.key ? null : item.drilldown));
    window.requestAnimationFrame(() => {
      overviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const filteredEntries = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const ordered = [...entries].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    if (!term) return ordered;
    return ordered.filter((entry) => {
      const paymentMethod =
        entry.paymentMethod && entry.paymentMethod !== ""
          ? paymentMethodLabels[entry.paymentMethod as Exclude<FinancePaymentMethod, "">]
          : "";
      const status = getFinanceStatus(entry);
      const haystack =
        `${entry.client} ${entry.category} ${entry.process} ${entry.entryType} ${entry.expenseType || ""} ${paymentMethod} ${status}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [entries, searchTerm]);

  const filteredOverviewEntries = useMemo(() => {
    const todayBase = new Date(today);
    todayBase.setHours(0, 0, 0, 0);
    return filteredEntries.filter((entry) => {
      const status = getFinanceStatus(entry);
      const dueDate = toDateStart(entry.dueDate);
      const matchesType = entryTypeFilter === "todos" || entry.entryType === entryTypeFilter;
      const matchesClient = clientFilter === "todos" || entry.client === clientFilter;
      const matchesStatus = statusFilter === "todos" || status === statusFilter;
      let matchesPeriod = true;

      if (chartDrilldown) {
        matchesPeriod = Boolean(
          dueDate &&
            dueDate.getFullYear() === chartDrilldown.year &&
            dueDate.getMonth() === chartDrilldown.month &&
            (chartDrilldown.kind === "month" || dueDate.getDate() === chartDrilldown.day)
        );
      } else if (periodFilter === "this-month") {
        matchesPeriod = Boolean(
          dueDate && dueDate.getFullYear() === todayBase.getFullYear() && dueDate.getMonth() === todayBase.getMonth()
        );
      } else if (periodFilter === "this-week") {
        const startOfWeek = new Date(todayBase);
        const day = startOfWeek.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        matchesPeriod = Boolean(dueDate && dueDate >= startOfWeek && dueDate <= endOfWeek);
      } else if (periodFilter === "overdue") {
        matchesPeriod = status === "Vencido";
      }

      return matchesType && matchesClient && matchesStatus && matchesPeriod;
    });
  }, [chartDrilldown, clientFilter, entryTypeFilter, filteredEntries, periodFilter, statusFilter, today]);

  const periodRevenue = useMemo(
    () =>
      filteredOverviewEntries.reduce((sum, entry) => {
        if (entry.entryType !== "receita") return sum;
        return sum + entry.amount;
      }, 0),
    [filteredOverviewEntries]
  );

  const periodExpense = useMemo(
    () =>
      filteredOverviewEntries.reduce((sum, entry) => {
        if (entry.entryType !== "despesa") return sum;
        return sum + entry.amount;
      }, 0),
    [filteredOverviewEntries]
  );

  const openRevenueModal = () => {
    setShowQuickMenu(false);
    setShowRevenueModal(true);
  };

  const openExpenseModal = () => {
    setShowQuickMenu(false);
    setShowExpenseModal(true);
  };

  const openContractHint = () => {
    setShowQuickMenu(false);
    setInlineMessage("Novo contrato ficará integrado ao módulo de Processos na próxima etapa.");
  };

  const openFinanceEntryModal = (entry: FinanceEntry) => {
    setEntriesError("");
    setActiveFinanceEntry(entry);
    setFinanceSettlementForm({
      paymentDate: entry.paymentDate || toIsoDateWithOffset(0),
      paymentMethod: entry.paymentMethod || "",
      paidAmount: formatCurrencyBRL(getFinanceSettledAmount(entry) || entry.amount)
    });
  };

  const closeFinanceEntryModal = () => {
    if (isSavingFinanceEntry || isDeletingFinanceEntry) return;
    setShowDeleteFinanceConfirm(false);
    setActiveFinanceEntry(null);
    setFinanceSettlementForm(emptyFinanceSettlementForm);
  };

  const handleSaveFinanceEntry = async () => {
    if (!activeFinanceEntry) return;
    const paidAmount = parseCurrencyBRL(financeSettlementForm.paidAmount);
    if (!financeSettlementForm.paymentDate || paidAmount <= 0) return;
    setIsSavingFinanceEntry(true);
    setEntriesError("");
    try {
      const updated = await apiUpdateFinanceEntry(activeFinanceEntry.id, {
        payment_date: financeSettlementForm.paymentDate,
        payment_method: financeSettlementForm.paymentMethod || undefined,
        paid_amount: paidAmount
      });
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? toFinanceEntry(updated) : entry)));
      setActiveFinanceEntry(null);
      setFinanceSettlementForm(emptyFinanceSettlementForm);
      setInlineMessage("Lançamento financeiro atualizado.");
    } catch (err) {
      setEntriesError(extractApiErrorMessage(err, "Não foi possível atualizar o lançamento financeiro."));
    } finally {
      setIsSavingFinanceEntry(false);
    }
  };

  const handleRequestDeleteFinanceEntry = () => {
    setEntriesError("");
    setShowDeleteFinanceConfirm(true);
  };

  const handleDeleteFinanceEntry = async () => {
    if (!activeFinanceEntry) return;
    setIsDeletingFinanceEntry(true);
    setEntriesError("");
    try {
      await apiDeleteFinanceEntry(activeFinanceEntry.id);
      setEntries((prev) => prev.filter((entry) => entry.id !== activeFinanceEntry.id));
      setShowDeleteFinanceConfirm(false);
      setActiveFinanceEntry(null);
      setFinanceSettlementForm(emptyFinanceSettlementForm);
      setInlineMessage("Lançamento financeiro excluído.");
    } catch (err) {
      setEntriesError(extractApiErrorMessage(err, "Não foi possível excluir o lançamento financeiro."));
    } finally {
      setIsDeletingFinanceEntry(false);
    }
  };

  const handleSaveRevenue = async () => {
    const amount = parseCurrencyBRL(revenueForm.amount);
    if (!revenueForm.category || amount <= 0) return;
    const selectedCase = registeredCases.find((item) => item.id === Number(revenueForm.caseId));
    const selectedClient =
      registeredClients.find((item) => item.id === Number(revenueForm.clientId)) ||
      registeredClients.find((item) => item.id === (selectedCase?.client_id ?? -1));
    setIsSavingRevenue(true);
    setEntriesError("");
    try {
      const created = await apiCreateFinanceEntry({
        entry_type: "receita",
        category: revenueForm.category,
        client_id: selectedClient?.id,
        case_id: selectedCase?.id,
        client_name: selectedClient?.name || undefined,
        case_number: selectedCase?.number || undefined,
        amount,
        due_date: revenueForm.dueDate || toIsoDateWithOffset(0),
        payment_date: revenueForm.paymentDate || undefined,
        payment_method: revenueForm.paymentMethod || undefined,
        attachment_name: revenueForm.attachmentName || undefined
      });
      setEntries((prev) => [toFinanceEntry(created), ...prev]);
      setRevenueForm(emptyRevenueForm);
      setShowRevenueModal(false);
      setInlineMessage("Receita salva na conta do escritório.");
    } catch (err) {
      setEntriesError(extractApiErrorMessage(err, "Não foi possível salvar a receita."));
    } finally {
      setIsSavingRevenue(false);
    }
  };

  const handleSaveExpense = async () => {
    const amount = parseCurrencyBRL(expenseForm.amount);
    const paidAmount = parseCurrencyBRL(expenseForm.paidAmount);
    if (!expenseForm.expenseType || !expenseForm.category || amount <= 0) return;
    const installments = Number(expenseForm.installments) || 1;
    setIsSavingExpense(true);
    setEntriesError("");
    try {
      const created = await apiCreateFinanceEntry({
        entry_type: "despesa",
        expense_type: expenseForm.expenseType,
        category: expenseForm.category,
        client_name: expenseForm.client.trim() || "Escritório",
        case_number: expenseForm.process.trim() || undefined,
        amount,
        due_date: expenseForm.dueDate || toIsoDateWithOffset(0),
        recurring: expenseForm.recurring,
        paid_amount: paidAmount > 0 ? paidAmount : undefined,
        installments,
        attachment_name: expenseForm.attachmentName || undefined
      });
      setEntries((prev) => [toFinanceEntry(created), ...prev]);
      setExpenseForm(emptyExpenseForm);
      setShowExpenseModal(false);
      setInlineMessage("Despesa salva na conta do escritório.");
    } catch (err) {
      setEntriesError(extractApiErrorMessage(err, "Não foi possível salvar a despesa."));
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleRevenueClientChange = (clientId: string) => {
    setRevenueForm((prev) => {
      const nextCaseId =
        clientId && prev.caseId
          ? registeredCases.some((item) => String(item.id) === prev.caseId && String(item.client_id ?? "") === clientId)
            ? prev.caseId
            : ""
          : prev.caseId;
      return {
        ...prev,
        clientId,
        caseId: nextCaseId
      };
    });
  };

  const handleRevenueCaseChange = (caseId: string) => {
    const selectedCase = registeredCases.find((item) => String(item.id) === caseId);
    setRevenueForm((prev) => ({
      ...prev,
      caseId,
      clientId: selectedCase?.client_id ? String(selectedCase.client_id) : prev.clientId
    }));
  };

  const handleExportEntries = () => {
    const header = ["Cliente", "Tipo", "Categoria", "Processo", "Vencimento", "Valor", "Status", "Forma de pagamento"];
    const rows = filteredOverviewEntries.map((entry) => [
      entry.client || "-",
      entry.entryType === "receita" ? "Receita" : `Despesa${entry.expenseType ? ` - ${entry.expenseType}` : ""}`,
      entry.category,
      entry.process || "-",
      formatDatePtBr(entry.dueDate),
      formatCurrencyBRL(entry.amount),
      getFinanceStatus(entry),
      entry.paymentMethod && entry.paymentMethod !== ""
        ? paymentMethodLabels[entry.paymentMethod as Exclude<FinancePaymentMethod, "">]
        : "-"
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `newlaw-financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const displayedEntries = filteredOverviewEntries.slice(0, 25);

  return (
    <div className="content-card page-card finance-page">
      <div className="finance-shell">
        <div className="page-header finance-header">
          <div>
            <div className="eyebrow">Financeiro</div>
          </div>
        </div>

        {inlineMessage && <div className="finance-inline-note">{inlineMessage}</div>}
        {entriesError && <div className="error">{entriesError}</div>}

        <div className="finance-kpi-grid">
          <article className="finance-kpi-card receita-prevista">
            <div className="finance-kpi-title">Receita Prevista (Mês)</div>
            <div className="finance-kpi-value">{formatCurrencyBRL(expectedRevenue)}</div>
            <div className="finance-kpi-sub">Com base nas parcelas contratadas</div>
            <button className="finance-kpi-action" type="button" onClick={openRevenueModal}>
              {dueThisWeekCount} vencem esta semana
            </button>
          </article>

          <article className="finance-kpi-card receita-recebida">
            <div className="finance-kpi-title">Receita Recebida (Mês)</div>
            <div className="finance-kpi-value">{formatCurrencyBRL(receivedRevenue)}</div>
            <div className="finance-kpi-sub">{receiptRate}% do previsto</div>
            <button className="finance-kpi-action" type="button" onClick={openRevenueModal}>
              Confirmar pagamento
            </button>
          </article>

          <article className="finance-kpi-card em-atraso">
            <div className="finance-kpi-title">Em Atraso</div>
            <div className="finance-kpi-value">{formatCurrencyBRL(overdueRevenue)}</div>
            <div className="finance-kpi-sub">{overdueClientsCount} cliente(s) inadimplente(s)</div>
            <button className="finance-kpi-action warning" type="button" onClick={() => setSearchTerm("vencido")}>
              Ver parcelas vencidas
            </button>
          </article>

          <article className="finance-kpi-card despesas">
            <div className="finance-kpi-title">Despesas (Mês)</div>
            <div className="finance-kpi-value">{formatCurrencyBRL(totalExpenses)}</div>
            <div className="finance-kpi-sub">Após este total pago</div>
            <button className="finance-kpi-action expense" type="button" onClick={openExpenseModal}>
              Lançar nova despesa
            </button>
          </article>
        </div>

        <div className="finance-charts-grid">
          <section className="finance-chart-card finance-chart-card-primary">
            <div className="finance-chart-head">
              <div>
                <div className="finance-chart-title">{comparisonChartTitle}</div>
                <div className="finance-chart-caption">{comparisonChartCaption}</div>
              </div>
              <div className="finance-chart-head-actions">
                <div className="finance-chart-meta">
                  <div className="finance-chart-toggle" aria-label="Selecionar período do gráfico">
                    {financeChartViewOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={chartView === option.value ? "active" : ""}
                        aria-pressed={chartView === option.value}
                        onClick={() => setChartView(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="finance-chart-period-controls">
                    {chartView === "month" && (
                      <div className="finance-chart-period-select finance-chart-period-select-month">
                        <select
                          aria-label="Selecionar mês do gráfico"
                          value={selectedChartMonth}
                          onChange={(event) => setSelectedChartMonth(Number(event.target.value))}
                        >
                          {financeMonthOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="finance-chart-period-select finance-chart-period-select-year">
                      <select
                        aria-label="Selecionar ano do gráfico"
                        value={selectedChartYear}
                        onChange={(event) => setSelectedChartYear(Number(event.target.value))}
                      >
                        {financeChartYearOptions.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="finance-chart-result finance-chart-result-strong">
                  {comparisonChartResultLabel}: <strong>{formatCurrencyBRL(comparisonChartResult)}</strong>
                </div>
              </div>
            </div>

            <div className="finance-annual-chart">
              <div className="finance-chart-scroll">
                <div className="finance-chart-canvas" style={comparisonChartCanvasStyle}>
                  <div className="finance-annual-axis">
                    {comparisonChartTicks.map((tick) => (
                      <div
                        key={tick.value}
                        className={`finance-annual-axis-row ${tick.value === 0 ? "zero" : ""}`}
                        style={{ top: tick.top }}
                      >
                        <span>{tick.label}</span>
                      </div>
                    ))}
                  </div>

                  <svg className="finance-chart-result-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {comparisonChartResultLine && (
                      <path
                        className="finance-chart-result-line"
                        d={comparisonChartResultLine}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </svg>

                  <div className="finance-chart-grid" style={comparisonChartGridStyle}>
                    {comparisonChartData.map((item, index) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`finance-chart-month ${chartDrilldown?.key === item.drilldown.key ? "active" : ""}`}
                        onClick={() => handleSelectChartColumn(item)}
                        onMouseEnter={() => setHoveredChartItem({ item, index })}
                        onMouseLeave={() => setHoveredChartItem((current) => (current?.item.key === item.key ? null : current))}
                        onFocus={() => setHoveredChartItem({ item, index })}
                        onBlur={() => setHoveredChartItem((current) => (current?.item.key === item.key ? null : current))}
                        aria-pressed={chartDrilldown?.key === item.drilldown.key}
                        aria-label={`${item.tooltipLabel}. Prevista ${formatCurrencyBRL(item.expected)}. Recebida ${formatCurrencyBRL(
                          item.received
                        )}. Despesas ${formatCurrencyBRL(item.expense)}. Resultado ${formatCurrencyBRL(item.result)}.`}
                      >
                        <div className="finance-chart-bars">
                          <span className="bar-wrap">
                            <span className="bar prevista" style={toComparisonBarStyle(item.expected)} />
                          </span>
                          <span className="bar-wrap">
                            <span className="bar recebida" style={toComparisonBarStyle(item.received)} />
                          </span>
                          <span className="bar-wrap">
                            <span className="bar despesa" style={toComparisonBarStyle(item.expense)} />
                          </span>
                        </div>
                        <div className="finance-chart-label">{item.label}</div>
                      </button>
                    ))}
                  </div>
                  {hoveredChartItem && (
                    <div className="finance-chart-tooltip-layer" aria-hidden="true">
                      <div className="finance-chart-tooltip" style={{ left: hoveredChartTooltipLeft }}>
                        <strong>{hoveredChartItem.item.tooltipLabel}</strong>
                        <span>Prevista: {formatCurrencyBRL(hoveredChartItem.item.expected)}</span>
                        <span>Recebida: {formatCurrencyBRL(hoveredChartItem.item.received)}</span>
                        <span>Despesas: {formatCurrencyBRL(hoveredChartItem.item.expense)}</span>
                        <span>Resultado: {formatCurrencyBRL(hoveredChartItem.item.result)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="finance-chart-legend">
              <span>
                <i className="legend-dot prevista" /> Receita prevista
              </span>
              <span>
                <i className="legend-dot recebida" /> Receita recebida
              </span>
              <span>
                <i className="legend-dot despesa" /> Despesas
              </span>
              <span>
                <i className="legend-line result" /> Linha de resultado
              </span>
            </div>
          </section>
        </div>

        <section ref={overviewSectionRef} className="finance-table-card">
          <div className="finance-table-head">
            <div>
              <div className="finance-table-title">Visão Geral</div>
              <div className="finance-table-sub">
                {isLoadingEntries
                  ? "Carregando lançamentos da conta..."
                  : `Exibindo ${Math.min(filteredOverviewEntries.length, 25)} de ${filteredOverviewEntries.length} lançamentos`}
              </div>
              {chartDrilldown && (
                <div className="finance-table-drilldown">
                  <span>Recorte do gráfico ativo: <strong>{chartDrilldown.label}</strong></span>
                  <button type="button" className="btn ghost small" onClick={() => setChartDrilldown(null)}>
                    Limpar recorte
                  </button>
                </div>
              )}
            </div>
            <div className="finance-overview-toolbar">
              <div className="finance-table-filters">
                <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as FinancePeriodFilter)}>
                  {financePeriodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      Período: {option.label}
                    </option>
                  ))}
                </select>
                <select value={entryTypeFilter} onChange={(event) => setEntryTypeFilter(event.target.value as FinanceEntryType | "todos")}>
                  <option value="todos">Tipo: Todos</option>
                  <option value="receita">Tipo: Receitas</option>
                  <option value="despesa">Tipo: Despesas</option>
                </select>
                <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
                  <option value="todos">Cliente: Todos</option>
                  {financeClientOptions.map((client) => (
                    <option key={client} value={client}>
                      Cliente: {client}
                    </option>
                  ))}
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FinanceStatus | "todos")}>
                  {financeStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      Status: {status === "todos" ? "Todos" : status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="finance-table-actions">
                <button className="btn secondary small" type="button" onClick={handleExportEntries}>
                  Exportar
                </button>
                <label className="finance-search-box" aria-label="Pesquisar lançamentos">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="6" />
                    <path d="M20 20l-4.2-4.2" />
                  </svg>
                  <input
                    placeholder="Pesquisar cliente, categoria ou processo"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="finance-table-summary">
            <span>Receita no período: {formatCurrencyBRL(periodRevenue)}</span>
            <span>Despesa no período: {formatCurrencyBRL(periodExpense)}</span>
            <span>Resultado: {formatCurrencyBRL(periodRevenue - periodExpense)}</span>
          </div>

          <div className="finance-table-wrap">
            <table className="table finance-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>Processo</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Forma de pagamento</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingEntries ? (
                  <tr>
                    <td colSpan={9}>Carregando lançamentos...</td>
                  </tr>
                ) : displayedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9}>Nenhum lançamento encontrado.</td>
                  </tr>
                ) : (
                  displayedEntries.map((entry) => {
                    const status = getFinanceStatus(entry);
                    const statusClass = status
                      .toLowerCase()
                      .replace(/\s+/g, "-")
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "");
                    const paymentLabel =
                      entry.paymentMethod && entry.paymentMethod !== ""
                        ? paymentMethodLabels[entry.paymentMethod as Exclude<FinancePaymentMethod, "">]
                        : "-";
                    return (
                      <tr
                        key={entry.id}
                        className="finance-table-row-actionable"
                        onDoubleClick={() => openFinanceEntryModal(entry)}
                        title="Clique duas vezes para editar o lançamento"
                      >
                        <td>{entry.client || "-"}</td>
                        <td>{entry.entryType === "receita" ? "Receita" : `Despesa${entry.expenseType ? ` · ${entry.expenseType}` : ""}`}</td>
                        <td>{entry.category}</td>
                        <td>{entry.process || "-"}</td>
                        <td>{formatDatePtBr(entry.dueDate)}</td>
                        <td>{formatCurrencyBRL(entry.amount)}</td>
                        <td>
                          <span className={`finance-status-badge ${statusClass}`}>{status}</span>
                        </td>
                        <td>{paymentLabel}</td>
                        <td>
                          <button
                            className="finance-row-action"
                            type="button"
                            onClick={() => openFinanceEntryModal(entry)}
                            aria-label="Abrir lançamento financeiro"
                            title="Abrir lançamento"
                          >
                            ...
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className={`finance-fab-shell ${showQuickMenu ? "open" : ""}`}>
        {showQuickMenu && (
          <div className="finance-fab-menu">
            <button type="button" onClick={openRevenueModal}>
              + Nova Receita
            </button>
            <button type="button" onClick={openExpenseModal}>
              + Nova Despesa
            </button>
            <button type="button" onClick={openContractHint}>
              + Novo Contrato
            </button>
          </div>
        )}
        <button
          type="button"
          className="finance-fab-main"
          onClick={() => setShowQuickMenu((prev) => !prev)}
          aria-label="Novo lançamento"
        >
          +
        </button>
      </div>

      {showRevenueModal && (
        <div className="modal-backdrop">
          <div className="modal-card finance-modal-card">
            <div className="modal-head">
              <h2 className="modal-title">Nova Receita</h2>
              <button
                className="icon-btn"
                type="button"
                onClick={() => {
                  if (isSavingRevenue) return;
                  setShowRevenueModal(false);
                  setRevenueForm(emptyRevenueForm);
                }}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            {revenueLinksError && <div className="error">{revenueLinksError}</div>}
            {entriesError && <div className="error">{entriesError}</div>}
            <div className="modal-grid finance-form-grid">
              <div className="field">
                <label>
                  Categoria <span className="required">*</span>
                </label>
                <select
                  value={revenueForm.category}
                  onChange={(event) => setRevenueForm((prev) => ({ ...prev, category: event.target.value }))}
                >
                  <option value="">Selecione</option>
                  {revenueCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Pessoa/cliente cadastrado</label>
                <select
                  value={revenueForm.clientId}
                  onChange={(event) => handleRevenueClientChange(event.target.value)}
                  disabled={isLoadingRevenueLinks}
                >
                  <option value="">{isLoadingRevenueLinks ? "Carregando..." : "Selecione"}</option>
                  {sortedRevenueClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {!isLoadingRevenueLinks && sortedRevenueClients.length === 0 && (
                  <div className="field-hint">Cadastre uma pessoa/cliente na aba Pessoas para vincular a receita.</div>
                )}
              </div>
              <div className="field">
                <label>Processo cadastrado</label>
                <select
                  value={revenueForm.caseId}
                  onChange={(event) => handleRevenueCaseChange(event.target.value)}
                  disabled={isLoadingRevenueLinks || filteredRevenueCases.length === 0}
                >
                  <option value="">
                    {isLoadingRevenueLinks
                      ? "Carregando..."
                      : filteredRevenueCases.length === 0
                        ? "Nenhum processo disponível"
                        : "Selecione"}
                  </option>
                  {filteredRevenueCases.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.number}
                      {item.client_id && clientsById[item.client_id] ? ` · ${clientsById[item.client_id].name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>
                  Valor <span className="required">*</span>
                </label>
                <input
                  value={revenueForm.amount}
                  onChange={(event) => setRevenueForm((prev) => ({ ...prev, amount: formatCurrencyInputBRL(event.target.value) }))}
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="field">
                <label>Vencimento</label>
                <input
                  type="date"
                  value={revenueForm.dueDate}
                  onChange={(event) => setRevenueForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Data do pagamento</label>
                <input
                  type="date"
                  value={revenueForm.paymentDate}
                  onChange={(event) => setRevenueForm((prev) => ({ ...prev, paymentDate: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Método</label>
                <select
                  value={revenueForm.paymentMethod}
                  onChange={(event) =>
                    setRevenueForm((prev) => ({ ...prev, paymentMethod: event.target.value as FinancePaymentMethod }))
                  }
                >
                  <option value="">Selecione</option>
                  {paymentMethodOptions.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field span-2">
                <label>Anexo</label>
                <input
                  type="file"
                  onChange={(event) =>
                    setRevenueForm((prev) => ({
                      ...prev,
                      attachmentName: event.target.files?.[0]?.name || ""
                    }))
                  }
                />
                {revenueForm.attachmentName && <div className="finance-attachment-name">{revenueForm.attachmentName}</div>}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  if (isSavingRevenue) return;
                  setShowRevenueModal(false);
                  setRevenueForm(emptyRevenueForm);
                }}
                disabled={isSavingRevenue}
              >
                Cancelar
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleSaveRevenue}
                disabled={!revenueForm.category || parseCurrencyBRL(revenueForm.amount) <= 0 || isSavingRevenue}
              >
                {isSavingRevenue ? "Salvando..." : "Salvar receita"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExpenseModal && (
        <div className="modal-backdrop">
          <div className="modal-card finance-modal-card">
            <div className="modal-head">
              <h2 className="modal-title">Nova Despesa</h2>
              <button
                className="icon-btn"
                type="button"
                onClick={() => {
                  if (isSavingExpense) return;
                  setShowExpenseModal(false);
                  setExpenseForm(emptyExpenseForm);
                }}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            {entriesError && <div className="error">{entriesError}</div>}
            <div className="modal-note">Campos obrigatórios: Tipo, Categoria e Valor.</div>
            <div className="modal-grid finance-form-grid">
              <div className="field">
                <label>
                  Tipo <span className="required">*</span>
                </label>
                <select
                  value={expenseForm.expenseType}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, expenseType: event.target.value }))}
                >
                  <option value="">Selecione</option>
                  {expenseTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>
                  Valor <span className="required">*</span>
                </label>
                <input
                  value={expenseForm.amount}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: formatCurrencyInputBRL(event.target.value) }))}
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="field span-2">
                <label>
                  Categoria <span className="required">*</span>
                </label>
                <select
                  value={expenseForm.category}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                >
                  <option value="">Selecione</option>
                  {expenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Vencimento</label>
                <input
                  type="date"
                  value={expenseForm.dueDate}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Recorrente</label>
                <select
                  value={expenseForm.recurring}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({ ...prev, recurring: event.target.value as FinanceRecurring }))
                  }
                >
                  {recurringOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Cliente/pessoa</label>
                <input
                  value={expenseForm.client}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, client: event.target.value }))}
                  placeholder="Campo pesquisável"
                />
              </div>
              <div className="field">
                <label>Processo</label>
                <input
                  value={expenseForm.process}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, process: event.target.value }))}
                  placeholder="Número do processo"
                />
              </div>
              <div className="field">
                <label>Valor pago</label>
                <input
                  value={expenseForm.paidAmount}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({ ...prev, paidAmount: formatCurrencyInputBRL(event.target.value) }))
                  }
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="field">
                <label>Parcelamento</label>
                <select
                  value={expenseForm.installments}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, installments: event.target.value }))}
                >
                  {Array.from({ length: 24 }).map((_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}x
                    </option>
                  ))}
                </select>
              </div>
              <div className="field span-2">
                <label>Anexo</label>
                <input
                  type="file"
                  onChange={(event) =>
                    setExpenseForm((prev) => ({
                      ...prev,
                      attachmentName: event.target.files?.[0]?.name || ""
                    }))
                  }
                />
                {expenseForm.attachmentName && <div className="finance-attachment-name">{expenseForm.attachmentName}</div>}
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  if (isSavingExpense) return;
                  setShowExpenseModal(false);
                  setExpenseForm(emptyExpenseForm);
                }}
                disabled={isSavingExpense}
              >
                Cancelar
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleSaveExpense}
                disabled={!expenseForm.expenseType || !expenseForm.category || parseCurrencyBRL(expenseForm.amount) <= 0 || isSavingExpense}
              >
                {isSavingExpense ? "Salvando..." : "Salvar despesa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeFinanceEntry && (
        <div className="modal-backdrop">
          <div className="modal-card finance-modal-card">
            <div className="modal-head">
              <h2 className="modal-title">
                {activeFinanceEntry.entryType === "receita" ? "Atualizar recebimento" : "Atualizar pagamento"}
              </h2>
              <button
                className="icon-btn"
                type="button"
                onClick={closeFinanceEntryModal}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            {entriesError && <div className="error">{entriesError}</div>}
            <div className="finance-entry-summary">
              <div>
                <strong>{activeFinanceEntry.client || "Sem cliente"}</strong>
                <span>{activeFinanceEntry.category}</span>
              </div>
              <div>
                <strong>{formatCurrencyBRL(activeFinanceEntry.amount)}</strong>
                <span>Vencimento {formatDatePtBr(activeFinanceEntry.dueDate)}</span>
              </div>
            </div>
            <div className="modal-grid finance-form-grid">
              <div className="field">
                <label>
                  Valor pago <span className="required">*</span>
                </label>
                <input
                  value={financeSettlementForm.paidAmount}
                  onChange={(event) =>
                    setFinanceSettlementForm((prev) => ({
                      ...prev,
                      paidAmount: formatCurrencyInputBRL(event.target.value)
                    }))
                  }
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="field">
                <label>
                  Data do pagamento <span className="required">*</span>
                </label>
                <input
                  type="date"
                  value={financeSettlementForm.paymentDate}
                  onChange={(event) =>
                    setFinanceSettlementForm((prev) => ({
                      ...prev,
                      paymentDate: event.target.value
                    }))
                  }
                />
              </div>
              <div className="field span-2">
                <label>Forma de pagamento</label>
                <select
                  value={financeSettlementForm.paymentMethod}
                  onChange={(event) =>
                    setFinanceSettlementForm((prev) => ({
                      ...prev,
                      paymentMethod: event.target.value as FinancePaymentMethod
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {paymentMethodOptions.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="btn ghost"
                type="button"
                onClick={closeFinanceEntryModal}
                disabled={isSavingFinanceEntry || isDeletingFinanceEntry}
              >
                Cancelar
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={handleRequestDeleteFinanceEntry}
                disabled={isSavingFinanceEntry || isDeletingFinanceEntry}
              >
                {isDeletingFinanceEntry ? "Excluindo..." : "Excluir"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleSaveFinanceEntry}
                disabled={
                  !financeSettlementForm.paymentDate ||
                  parseCurrencyBRL(financeSettlementForm.paidAmount) <= 0 ||
                  isSavingFinanceEntry ||
                  isDeletingFinanceEntry
                }
              >
                {isSavingFinanceEntry ? "Salvando..." : "Salvar atualização"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={showDeleteFinanceConfirm && activeFinanceEntry !== null}
        title="Excluir lançamento financeiro"
        message="Esse lançamento será removido do Financeiro para toda a equipe."
        confirmLabel="Excluir lançamento"
        busy={isDeletingFinanceEntry}
        errorMessage={entriesError}
        onCancel={() => {
          if (isDeletingFinanceEntry) return;
          setShowDeleteFinanceConfirm(false);
        }}
        onConfirm={handleDeleteFinanceEntry}
      />
    </div>
  );
}

type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const assistantQuickPrompts = [
  "Quais prazos vencem hoje?",
  "Me mostre as audiências da semana",
  "Como está o painel financeiro?",
  "Quero revisar um processo específico"
] as const;

const createAssistantMessage = (role: AssistantMessage["role"], text: string): AssistantMessage => ({
  id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  text
});

const buildAssistantWelcomeMessage = (userName?: string | null) => {
  const firstName = userName?.trim().split(/\s+/)[0];
  return firstName
    ? `Olá, ${firstName}. Sou o NewLaw AI. Posso organizar perguntas rápidas sobre prazos, agenda, publicações e processos sem tirar você da tela atual.`
    : "Olá. Sou o NewLaw AI. Posso organizar perguntas rápidas sobre prazos, agenda, publicações e processos sem tirar você da tela atual.";
};

const buildAssistantReply = (question: string) => {
  const normalized = question.trim().toLowerCase();
  if (!normalized) {
    return "Me diga o tema principal e eu organizo o próximo passo dentro do NEWLAW.";
  }
  if (normalized.includes("prazo") || normalized.includes("venc")) {
    return "Para prazos, eu priorizaria a Agenda e a Home semanal. Posso te orientar a localizar vencimentos do dia, destacar itens fatais e separar por processo ou responsável.";
  }
  if (normalized.includes("audi") || normalized.includes("sess")) {
    return "As audiências ficam mais claras na visão semanal da Home e na Agenda. Se você quiser, eu posso te guiar por data, tribunal ou responsável antes de abrir a tela certa.";
  }
  if (normalized.includes("publica") || normalized.includes("intima")) {
    return "Para publicações e intimações, o fluxo ideal é abrir Publicações, revisar os itens do dia e gerar tarefa ou prazo direto dali. Posso te orientar nesse passo a passo.";
  }
  if (normalized.includes("finance") || normalized.includes("receita") || normalized.includes("despesa")) {
    return "No Financeiro e no Dashboard, eu consigo te direcionar entre receita ativa, despesas, recebimentos previstos e evolução mensal. Se quiser, começamos pelos indicadores principais.";
  }
  if (normalized.includes("process") || normalized.includes("caso")) {
    return "Se você me passar o número do processo ou o cliente, eu organizo a busca e te direciono para andamentos, agenda e documentos relacionados.";
  }
  if (normalized.includes("cliente") || normalized.includes("pessoa")) {
    return "Para cliente, eu sugiro começar por Pessoas ou Processos. A partir dali dá para localizar contato, casos ativos, responsáveis e pendências abertas.";
  }
  return "Posso te apoiar com prazos, audiências, publicações, processos, clientes e indicadores do sistema. Me diga o foco principal e eu estruturo o próximo passo.";
};

function NewLawAssistantModal({
  open,
  onClose,
  userName
}: {
  open: boolean;
  onClose: () => void;
  userName?: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [createAssistantMessage("assistant", buildAssistantWelcomeMessage(userName))]);
  const [isTyping, setIsTyping] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const replyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  useEffect(
    () => () => {
      if (replyTimeoutRef.current) {
        window.clearTimeout(replyTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      transcriptRef.current?.scrollTo({
        top: transcriptRef.current.scrollHeight,
        behavior: "smooth"
      });
    }, 0);
  }, [isTyping, messages, open]);

  const handleSendMessage = (rawValue?: string) => {
    const value = (rawValue ?? draft).trim();
    if (!value || isTyping) return;
    if (replyTimeoutRef.current) {
      window.clearTimeout(replyTimeoutRef.current);
      replyTimeoutRef.current = null;
    }
    setMessages((current) => [...current, createAssistantMessage("user", value)]);
    setDraft("");
    setIsTyping(true);
    replyTimeoutRef.current = window.setTimeout(() => {
      setMessages((current) => [...current, createAssistantMessage("assistant", buildAssistantReply(value))]);
      setIsTyping(false);
      replyTimeoutRef.current = null;
    }, 420);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handleSendMessage();
  };

  if (!open) return null;

  return (
    <div className="assistant-backdrop" onClick={onClose}>
      <div className="assistant-popup" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="NewLaw AI">
        <div className="assistant-head">
          <div className="assistant-brand">
            <div className="assistant-brand-icon" aria-hidden="true">
              <svg className="assistant-brand-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.8 4.7L18 9.2l-4.2 1.5L12 16l-1.8-5.3L6 9.2l4.2-1.5L12 3z" />
                <path d="M19 13l.9 2.3L22 16l-2.1.7L19 19l-.9-2.3L16 16l2.1-.7L19 13z" />
              </svg>
            </div>
            <div className="assistant-brand-copy">
              <div className="assistant-brand-title">NewLaw AI</div>
              <div className="assistant-brand-subtitle">Assistente virtual do escritório em qualquer tela.</div>
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar assistente">
            X
          </button>
        </div>

        <div className="assistant-status-pill">Assistente virtual</div>

        <div className="assistant-transcript scroll-area" ref={transcriptRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`assistant-message ${message.role === "assistant" ? "assistant-message-assistant" : "assistant-message-user"}`}
            >
              <div className="assistant-message-label">{message.role === "assistant" ? "NewLaw AI" : "Você"}</div>
              <div className="assistant-message-bubble">{message.text}</div>
            </div>
          ))}

          {isTyping && (
            <div className="assistant-message assistant-message-assistant">
              <div className="assistant-message-label">NewLaw AI</div>
              <div className="assistant-message-bubble assistant-message-bubble-typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        <div className="assistant-prompts">
          {assistantQuickPrompts.map((prompt) => (
            <button key={prompt} className="assistant-prompt" type="button" onClick={() => handleSendMessage(prompt)} disabled={isTyping}>
              {prompt}
            </button>
          ))}
        </div>

        <form className="assistant-compose" onSubmit={handleSubmit}>
          <input
            aria-label="Pergunta para o NewLaw AI"
            placeholder="Pergunte sobre prazos, audiências, clientes ou processos..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="assistant-send" type="submit" disabled={!draft.trim() || isTyping} aria-label="Enviar pergunta">
            <svg className="assistant-send-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function Home({ user }: { user: AuthUser | null }) {
  const [clock, setClock] = useState(() => new Date());
  const [events, setEvents] = useState<AgendaItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<ApiTeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingTaskIds, setUpdatingTaskIds] = useState<number[]>([]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  const today = new Date(clock.getFullYear(), clock.getMonth(), clock.getDate());
  const todayKey = formatIsoDate(today);
  const weekStart = useMemo(() => {
    const start = new Date(today);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    return start;
  }, [todayKey]);
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [todayKey, weekStart]);
  const weekStartKey = formatIsoDate(weekStart);
  const weekEndKey = formatIsoDate(weekEnd);

  useEffect(() => {
    let cancelled = false;

    const loadHomeAgenda = async () => {
      setIsLoading(true);
      setError("");
      try {
        const agendaData = await apiListAgendaEvents({
          start: `${weekStartKey}T00:00:00`,
          end: `${weekEndKey}T23:59:59`
        });
        if (cancelled) return;
        setEvents(agendaData);
      } catch (err) {
        if (cancelled) return;
        setError(extractApiErrorMessage(err, "Não foi possível carregar os dados da Home."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadHomeAgenda();
    return () => {
      cancelled = true;
    };
  }, [weekEndKey, weekStartKey]);

  useEffect(() => {
    let cancelled = false;
    const loadTeamMembers = async () => {
      try {
        const data = await apiListTeamMembers();
        if (cancelled) return;
        setTeamMembers(data.filter((member) => member.is_active && member.email.trim()));
      } catch {
        if (cancelled) return;
        setTeamMembers([]);
      }
    };
    void loadTeamMembers();
    return () => {
      cancelled = true;
    };
  }, []);

  const titleCaseLabel = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase("pt-BR");
    return normalized ? `${normalized.charAt(0).toLocaleUpperCase("pt-BR")}${normalized.slice(1)}` : "";
  };

  const weekdayTitle = titleCaseLabel(today.toLocaleDateString("pt-BR", { weekday: "long" }));
  const currentDateLabel = today.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const currentTimeLabel = clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const assigneeNameLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    teamMembers.forEach((member) => {
      const email = member.email.trim().toLowerCase();
      const fullName = member.full_name.trim();
      if (email && fullName) lookup.set(email, fullName);
    });
    const currentUserEmail = user?.email?.trim().toLowerCase();
    const currentUserName = user?.name?.trim();
    if (currentUserEmail && currentUserName && !lookup.has(currentUserEmail)) {
      lookup.set(currentUserEmail, currentUserName);
    }
    return lookup;
  }, [teamMembers, user?.email, user?.name]);

  const internalWeekItems = useMemo(
    () =>
      events
        .filter((item) => item.source === "internal")
        .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime()),
    [events]
  );

  const isAgendaItemDone = (item: AgendaItem) => (item.status || "").trim().toLowerCase() === "concluido";
  const homeAssigneesLabel = (item: AgendaItem) => {
    const rawValue = item.assignees || item.assignee_name || "";
    if (!rawValue.trim()) return "";
    return rawValue
      .split(/[;,]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => assigneeNameLookup.get(part.toLowerCase()) || part)
      .join("; ");
  };
  const homeMetaLabel = (item: AgendaItem) => {
    const labels = [item.reference, homeAssigneesLabel(item), item.location].filter(Boolean);
    return labels.join(" · ");
  };

  const deadlinesToday = internalWeekItems.filter(
    (item) => item.event_type === "deadline" && getAgendaDateKey(item.starts_at) === todayKey
  );
  const fatalDeadlinesToday = deadlinesToday.filter((item) => !isAgendaItemDone(item));
  const hearingsWeek = internalWeekItems.filter((item) => item.event_type === "hearing");
  const deadlinesWeek = internalWeekItems.filter((item) => {
    const dateKey = getAgendaDateKey(item.starts_at);
    return item.event_type === "deadline" && dateKey > todayKey && dateKey <= weekEndKey;
  });
  const pendingDeadlinesWeek = deadlinesWeek.filter((item) => !isAgendaItemDone(item));
  const tasksToday = internalWeekItems
    .filter((item) => {
      const isTaskType =
        item.event_type === "meeting" ||
        item.event_type === "audit" ||
        (item.kind === "meeting" && item.event_type !== "hearing");
      return isTaskType && getAgendaDateKey(item.starts_at) === todayKey;
    })
    .sort((left, right) => Number(isAgendaItemDone(left)) - Number(isAgendaItemDone(right)));
  const pendingTasksToday = tasksToday.filter((item) => !isAgendaItemDone(item));

  const handleToggleHomeTask = async (item: AgendaItem) => {
    if (item.source !== "internal") return;
    const nextCompleted = !isAgendaItemDone(item);
    const previousStatus = item.status;
    setUpdatingTaskIds((prev) => (prev.includes(item.entity_id) ? prev : [...prev, item.entity_id]));
    setError("");
    setEvents((prev) =>
      prev.map((entry) =>
        entry.id === item.id ? { ...entry, status: nextCompleted ? "concluido" : "pendente" } : entry
      )
    );
    try {
      const updated = await apiUpdateAgendaDeadline(item.entity_id, { is_completed: nextCompleted });
      setEvents((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)));
    } catch (err) {
      setEvents((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, status: previousStatus } : entry))
      );
      setError(extractApiErrorMessage(err, "Não foi possível atualizar a tarefa."));
    } finally {
      setUpdatingTaskIds((prev) => prev.filter((entryId) => entryId !== item.entity_id));
    }
  };

  const weekDayItems = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        const dateKey = formatIsoDate(date);
        const items = internalWeekItems.filter((item) => getAgendaDateKey(item.starts_at) === dateKey);
        const hasDeadline = items.some((item) => item.event_type === "deadline");
        const hasHearing = items.some((item) => item.event_type === "hearing");
        const hasTask = items.some(
          (item) =>
            item.event_type === "meeting" ||
            item.event_type === "audit" ||
            (item.kind === "meeting" && item.event_type !== "hearing")
        );
        const tone = hasDeadline ? "red" : hasHearing ? "blue" : hasTask ? "green" : "muted";
        return {
          key: dateKey,
          label: weekDays[index],
          dayNumber: String(date.getDate()).padStart(2, "0"),
          count: items.length,
          tone,
          isToday: dateKey === todayKey
        };
      }),
    [internalWeekItems, todayKey, weekStartKey]
  );

  return (
    <div className="content-card page-card home-card">
      <div className="home-ops-board">
        <div className="home-ops-head">
          <div className="home-ops-date">
            <div className="home-ops-day">{today.getDate()}</div>
            <div className="home-ops-copy">
              <div className="home-ops-title">{weekdayTitle}</div>
              <div className="home-ops-subtitle">{currentDateLabel}</div>
            </div>
          </div>
          <div className="home-clock-pill">{currentTimeLabel}</div>
        </div>

        <div className="home-week-strip">
          <div className="home-week-label">Semana</div>
          {weekDayItems.map((item) => (
            <div key={item.key} className={`home-week-day ${item.isToday ? "active" : ""}`}>
              <span className="home-week-day-label">{item.label}</span>
              <strong>{item.dayNumber}</strong>
              <span className={`home-week-dot tone-${item.tone}`}>{item.count > 0 ? item.count : "•"}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {isLoading ? (
        <div className="home-loading">Carregando visão operacional...</div>
      ) : (
        <div className="home-focus-grid">
            <section className="home-focus-card">
              <div className="home-focus-head tone-red">
                <div className="home-focus-head-main">
                  <span className="home-focus-dot" />
                  <strong>Prazos Fatais</strong>
                </div>
                <span className="home-focus-count">{fatalDeadlinesToday.length}</span>
              </div>
              <div className="home-focus-list">
                {fatalDeadlinesToday.length > 0 ? (
                  fatalDeadlinesToday.map((item) => (
                    <div key={item.id} className="home-focus-item">
                      <div className="home-focus-main">
                        <div>
                          <div className="home-focus-title">{item.title}</div>
                          <div className="home-focus-meta">{homeMetaLabel(item) || "Prazo interno do escritório"}</div>
                        </div>
                      </div>
                      <div className="home-focus-side">{formatAgendaTime(item.starts_at, item.ends_at, item.is_all_day)}</div>
                    </div>
                  ))
                ) : (
                  <div className="home-focus-empty">Nenhum prazo fatal vencendo hoje.</div>
                )}
              </div>
            </section>

            <section className="home-focus-card">
              <div className="home-focus-head tone-blue">
                <div className="home-focus-head-main">
                  <span className="home-focus-dot" />
                  <strong>Audiências da Semana</strong>
                </div>
                <span className="home-focus-count">{hearingsWeek.length}</span>
              </div>
              <div className="home-focus-list">
                {hearingsWeek.length > 0 ? (
                  hearingsWeek.map((item) => (
                    <div key={item.id} className="home-focus-item">
                      <div className="home-focus-main">
                        <span className="home-focus-pill blue">{agendaEventTagLabel(item).slice(0, 3).toUpperCase()}</span>
                        <div>
                          <div className="home-focus-title">{item.title}</div>
                          <div className="home-focus-meta">{homeMetaLabel(item) || "Audiência vinculada à agenda"}</div>
                        </div>
                      </div>
                      <div className="home-focus-side">
                        {weekDays[new Date(item.starts_at).getDay() === 0 ? 6 : new Date(item.starts_at).getDay() - 1]} ·{" "}
                        {formatAgendaTime(item.starts_at, item.ends_at, item.is_all_day)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="home-focus-empty">Nenhuma audiência cadastrada nesta semana.</div>
                )}
              </div>
            </section>

            <section className="home-focus-card">
              <div className="home-focus-head tone-amber">
                <div className="home-focus-head-main">
                  <span className="home-focus-dot" />
                  <strong>Prazos da Semana</strong>
                </div>
                <span className="home-focus-count">{pendingDeadlinesWeek.length}</span>
              </div>
              <div className="home-focus-list">
                {pendingDeadlinesWeek.length > 0 ? (
                  pendingDeadlinesWeek.map((item) => (
                    <div key={item.id} className="home-focus-item">
                      <div className="home-focus-main">
                        <span className="home-focus-pill amber">
                          {weekDays[new Date(item.starts_at).getDay() === 0 ? 6 : new Date(item.starts_at).getDay() - 1]}
                        </span>
                        <div>
                          <div className="home-focus-title">{item.title}</div>
                          <div className="home-focus-meta">{homeMetaLabel(item) || "Prazo planejado para a semana"}</div>
                        </div>
                      </div>
                      <div className="home-focus-side">{formatBrazilDate(getAgendaDateKey(item.starts_at))}</div>
                    </div>
                  ))
                ) : (
                  <div className="home-focus-empty">Nenhum prazo adicional programado nesta semana.</div>
                )}
              </div>
            </section>

            <section className="home-focus-card">
              <div className="home-focus-head tone-green">
                <div className="home-focus-head-main">
                  <span className="home-focus-dot" />
                  <strong>Tarefas Pendentes</strong>
                </div>
                <span className="home-focus-count">{pendingTasksToday.length}</span>
              </div>
              <div className="home-focus-list">
                {tasksToday.length > 0 ? (
                  tasksToday.map((item) => {
                    const done = isAgendaItemDone(item);
                    const isUpdating = updatingTaskIds.includes(item.entity_id);
                    return (
                    <div key={item.id} className={`home-task-item ${done ? "done" : ""}`}>
                      <button
                        type="button"
                        className={`home-task-check ${done ? "done" : ""}`}
                        onClick={() => void handleToggleHomeTask(item)}
                        disabled={isUpdating}
                        aria-label={done ? `Desmarcar tarefa ${item.title}` : `Marcar tarefa ${item.title} como concluída`}
                        aria-pressed={done}
                      >
                        {done ? "✓" : ""}
                      </button>
                      <div className={`home-task-copy ${done ? "done" : ""}`}>
                        <div className="home-focus-title">{item.title}</div>
                        <div className="home-focus-meta">{homeMetaLabel(item) || "Tarefa operacional do dia"}</div>
                      </div>
                    </div>
                  );
                  })
                ) : (
                  <div className="home-focus-empty">Nenhuma tarefa cadastrada para hoje.</div>
                )}
              </div>
            </section>

          </div>
      )}
    </div>
  );
}

const dashboardPalette = ["#e1ba3b", "#54c3c1", "#5f95e6", "#ff6b6b", "#a256ed", "#37c978"];

const formatDashboardTrend = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "sem base";
  const rounded = value.toFixed(Math.abs(value) >= 10 ? 0 : 1).replace(".", ",");
  return `${value > 0 ? "+" : ""}${rounded}%`;
};

const buildDashboardConicGradient = (items: Array<{ value: number; color: string }>) => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return "conic-gradient(rgba(255,255,255,0.08) 0 100%)";
  let cursor = 0;
  const stops = items.map((item) => {
    const start = cursor;
    cursor += (item.value / total) * 100;
    return `${item.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
};

function Dashboard() {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [cases, setCases] = useState<ApiCase[]>([]);
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [members, setMembers] = useState<ApiTeamMember[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      setIsLoading(true);
      setError("");

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);

      const [financeResult, casesResult, clientsResult, teamResult, agendaResult] = await Promise.allSettled([
        apiListFinanceEntries(),
        apiListCases(),
        apiListClients(),
        apiListTeamMembers(),
        apiListAgendaEvents({ start: formatIsoDate(start), end: formatIsoDate(end) })
      ]);

      if (cancelled) return;

      const failedAreas: string[] = [];

      if (financeResult.status === "fulfilled") {
        setEntries(financeResult.value.map(toFinanceEntry));
      } else {
        setEntries([]);
        failedAreas.push("financeiro");
      }

      if (casesResult.status === "fulfilled") {
        setCases(casesResult.value);
      } else {
        setCases([]);
        failedAreas.push("processos");
      }

      if (clientsResult.status === "fulfilled") {
        setClients(clientsResult.value);
      } else {
        setClients([]);
        failedAreas.push("clientes");
      }

      if (teamResult.status === "fulfilled") {
        setMembers(teamResult.value);
      } else {
        setMembers([]);
        failedAreas.push("equipe");
      }

      if (agendaResult.status === "fulfilled") {
        setAgendaItems(agendaResult.value);
      } else {
        setAgendaItems([]);
        failedAreas.push("agenda");
      }

      if (failedAreas.length === 5) {
        setError("Não foi possível carregar os dados do dashboard.");
      } else if (failedAreas.length > 0) {
        setError(`Alguns blocos não puderam ser atualizados: ${failedAreas.join(", ")}.`);
      }

      setIsLoading(false);
    };

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const revenueEntries = useMemo(() => entries.filter((entry) => entry.entryType === "receita"), [entries]);
  const expectedRevenue = useMemo(
    () => revenueEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [revenueEntries]
  );
  const receivedRevenue = useMemo(
    () => revenueEntries.reduce((sum, entry) => sum + getFinanceSettledAmount(entry), 0),
    [revenueEntries]
  );
  const overdueRevenue = useMemo(
    () =>
      revenueEntries.reduce((sum, entry) => {
        return getFinanceStatus(entry) === "Vencido" ? sum + entry.amount : sum;
      }, 0),
    [revenueEntries]
  );
  const receiptRate = expectedRevenue > 0 ? Math.round((receivedRevenue / expectedRevenue) * 100) : 0;
  const casesById = useMemo(() => new Map(cases.map((item) => [item.id, item] as const)), [cases]);
  const casesByNumber = useMemo(
    () => new Map(cases.map((item) => [normalizeCaseDigits(item.number), item] as const)),
    [cases]
  );
  const normalizedCaseRows = useMemo(
    () =>
      cases.map((item) => ({
        status: normalizeCaseStatus(item.status),
        walletName: item.wallet_name?.trim() || item.wallet_nickname?.trim() || "Sem carteira",
        area: item.court?.trim() ? formatCourtOrRegion(item.court.trim()) : "Sem área"
      })),
    [cases]
  );
  const activeCases = normalizedCaseRows.filter((item) => item.status !== "Arquivado").length;
  const statusDistribution = useMemo(() => {
    const counts = new Map<string, number>([
      ["Ativo", 0],
      ["Em andamento", 0],
      ["Arquivado", 0]
    ]);
    normalizedCaseRows.forEach((item) => {
      counts.set(item.status, (counts.get(item.status) || 0) + 1);
    });
    return [
      { label: "Ativos", value: counts.get("Ativo") || 0, color: "#5f95e6" },
      { label: "Em andamento", value: counts.get("Em andamento") || 0, color: "#37c978" },
      { label: "Arquivados", value: counts.get("Arquivado") || 0, color: "#ffb020" }
    ];
  }, [normalizedCaseRows]);
  const totalStatusCases = statusDistribution.reduce((sum, item) => sum + item.value, 0);
  const donutGradient = useMemo(() => buildDashboardConicGradient(statusDistribution), [statusDistribution]);

  const activeMembers = members.filter((member) => member.is_active).length;
  const activeTeamsCount = new Set(
    members
      .filter((member) => member.is_active)
      .map((member) => member.team_name.trim())
      .filter(Boolean)
  ).size;
  const membersByTeam = useMemo(() => {
    const counts = new Map<string, number>();
    members.forEach((member) => {
      if (!member.is_active) return;
      const label = member.team_name.trim() || member.role_title.trim() || "Sem equipe";
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, value], index) => ({
        label,
        value,
        color: dashboardPalette[index % dashboardPalette.length]
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 6);
  }, [members]);
  const maxMembersByTeam = Math.max(...membersByTeam.map((item) => item.value), 1);

  const successByWallet = useMemo(() => {
    const buckets = new Map<string, { expected: number; received: number }>();
    revenueEntries.forEach((entry) => {
      const linkedCase =
        (entry.caseId ? casesById.get(entry.caseId) : undefined) ||
        casesByNumber.get(normalizeCaseDigits(entry.process));
      const walletLabel = linkedCase?.wallet_name?.trim() || linkedCase?.wallet_nickname?.trim() || "Sem carteira";
      const current = buckets.get(walletLabel) || { expected: 0, received: 0 };
      current.expected += entry.amount;
      current.received += getFinanceSettledAmount(entry);
      buckets.set(walletLabel, current);
    });
    const output = [...buckets.entries()]
      .filter(([, values]) => values.expected > 0)
      .map(([label, values], index) => ({
        label,
        rate: Math.round((values.received / values.expected) * 100),
        expected: values.expected,
        received: values.received,
        color: dashboardPalette[index % dashboardPalette.length]
      }))
      .sort((left, right) => right.rate - left.rate)
      .slice(0, 5);
    if (output.length > 0) return output;
    return [
      {
        label: "Geral",
        rate: receiptRate,
        expected: expectedRevenue,
        received: receivedRevenue,
        color: dashboardPalette[0]
      }
    ];
  }, [casesById, casesByNumber, expectedRevenue, receiptRate, receivedRevenue, revenueEntries]);

  const monthlyRevenueSeries = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: financeMonths[date.getMonth()],
        value: 0
      };
    });

    const indexByKey = new Map(buckets.map((item, index) => [item.key, index] as const));
    revenueEntries.forEach((entry) => {
      const settledAmount = getFinanceSettledAmount(entry);
      if (settledAmount <= 0) return;
      const reference = toDateStart(entry.paymentDate || entry.dueDate);
      if (!reference) return;
      const key = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}`;
      const bucketIndex = indexByKey.get(key);
      if (bucketIndex == null) return;
      buckets[bucketIndex].value += settledAmount;
    });

    return buckets;
  }, [revenueEntries]);
  const monthlyRevenueValues = monthlyRevenueSeries.map((item) => item.value);
  const monthlyRevenueScale = useMemo(() => buildNiceChartScale(monthlyRevenueValues, 5), [monthlyRevenueValues]);
  const monthlyRevenueTicks = useMemo(
    () =>
      [...monthlyRevenueScale.ticks].reverse().map((tick) => ({
        value: tick,
        label: formatCurrencyAxis(tick),
        top: `${((monthlyRevenueScale.max - tick) / monthlyRevenueScale.range) * 100}%`
      })),
    [monthlyRevenueScale]
  );
  const monthlyRevenuePoints = useMemo(
    () =>
      monthlyRevenueValues.map((value, index) => ({
        value,
        x: monthlyRevenueValues.length === 1 ? 50 : (index / (monthlyRevenueValues.length - 1)) * 100,
        y: ((monthlyRevenueScale.max - value) / monthlyRevenueScale.range) * 100
      })),
    [monthlyRevenueScale, monthlyRevenueValues]
  );
  const monthlyRevenueLine = useMemo(() => buildSmoothChartPath(monthlyRevenuePoints), [monthlyRevenuePoints]);
  const monthlyRevenueArea = useMemo(() => {
    if (!monthlyRevenuePoints.length) return "";
    const first = monthlyRevenuePoints[0];
    const last = monthlyRevenuePoints[monthlyRevenuePoints.length - 1];
    return `${monthlyRevenueLine} L ${last.x} 100 L ${first.x} 100 Z`;
  }, [monthlyRevenueLine, monthlyRevenuePoints]);
  const currentMonthRevenue = monthlyRevenueSeries[monthlyRevenueSeries.length - 1]?.value || 0;
  const previousMonthRevenue = monthlyRevenueSeries[monthlyRevenueSeries.length - 2]?.value || 0;
  const revenueTrend = previousMonthRevenue > 0 ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 : null;

  const criticalDeadlinesCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return agendaItems.filter((item) => {
      if (item.source !== "internal") return false;
      if (item.event_type !== "deadline" && item.event_type !== "hearing") return false;
      if ((item.status || "").toLowerCase() === "concluido") return false;
      const startsAt = new Date(item.starts_at);
      if (Number.isNaN(startsAt.getTime())) return false;
      const due = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate());
      const diff = Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      return diff >= 0 && diff <= 7;
    }).length;
  }, [agendaItems]);

  const paidClients = new Set(
    revenueEntries
      .filter((entry) => getFinanceSettledAmount(entry) > 0)
      .map((entry) => entry.client.trim().toLowerCase())
      .filter(Boolean)
  ).size;
  const averageTicket = paidClients > 0 ? receivedRevenue / paidClients : 0;
  const activeMemberShare = members.length > 0 ? Math.round((activeMembers / members.length) * 100) : 0;
  const indicators = [
    { label: "Receita prevista", value: formatCurrencyBRL(expectedRevenue), note: "Base de 12 meses" },
    { label: "Receita em atraso", value: formatCurrencyBRL(overdueRevenue), note: "Lançamentos vencidos" },
    { label: "Ticket médio", value: formatCurrencyBRL(averageTicket), note: "Por cliente pagante" },
    { label: "Equipe ativa", value: `${activeMemberShare}%`, note: `${activeMembers}/${members.length || 0} membros ativos` }
  ];

  const kpis = [
    {
      id: "revenue",
      icon: "R$",
      tone: "gold",
      value: formatCurrencyAxis(receivedRevenue),
      label: "Receita recebida",
      note: "Últimos 12 meses",
      trend: formatDashboardTrend(revenueTrend)
    },
    {
      id: "success",
      icon: "EX",
      tone: "green",
      value: `${receiptRate}%`,
      label: "Taxa de êxito",
      note: "Recebido sobre previsto",
      trend: `${formatCurrencyAxis(receivedRevenue)} de ${formatCurrencyAxis(expectedRevenue)}`
    },
    {
      id: "cases",
      icon: "PC",
      tone: "blue",
      value: String(activeCases),
      label: "Processos ativos",
      note: `${cases.length} cadastrados`,
      trend: `${statusDistribution[2]?.value || 0} arquivados`
    },
    {
      id: "deadlines",
      icon: "PR",
      tone: "red",
      value: String(criticalDeadlinesCount),
      label: "Prazos críticos",
      note: "Próximos 7 dias",
      trend: "Agenda interna"
    },
    {
      id: "team",
      icon: "EQ",
      tone: "violet",
      value: String(activeMembers),
      label: "Membros ativos",
      note: `${activeTeamsCount} equipes`,
      trend: `${members.length} cadastrados`
    },
    {
      id: "clients",
      icon: "CL",
      tone: "amber",
      value: String(clients.length),
      label: "Clientes cadastrados",
      note: `${paidClients} pagantes`,
      trend: `Ticket ${formatCurrencyAxis(averageTicket)}`
    }
  ];

  return (
    <div className="content-card page-card dashboard-page">
      <div className="page-header dashboard-header">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h1 className="page-title">Indicadores do escritório</h1>
          <div className="page-subtitle">
            Receita, equipe, status do acervo e sinais operacionais em um painel consolidado.
          </div>
        </div>
        <div className="pill">Operacional</div>
      </div>

      {error && <div className="error">{error}</div>}

      {isLoading ? (
        <div className="publication-empty">Carregando indicadores...</div>
      ) : (
        <>
          <div className="dashboard-kpi-grid">
            {kpis.map((item) => (
              <article key={item.id} className={`dashboard-kpi-card tone-${item.tone}`}>
                <div className="dashboard-kpi-head">
                  <span className="dashboard-kpi-icon">{item.icon}</span>
                  <span className="dashboard-kpi-trend">{item.trend}</span>
                </div>
                <div className="dashboard-kpi-value">{item.value}</div>
                <div className="dashboard-kpi-label">{item.label}</div>
                <div className="dashboard-kpi-note">{item.note}</div>
              </article>
            ))}
          </div>

          <div className="dashboard-main-grid">
            <section className="dashboard-panel dashboard-panel-wide">
              <div className="dashboard-panel-head">
                <div>
                  <div className="dashboard-panel-title">Evolução mensal de receita</div>
                  <div className="dashboard-panel-caption">Receitas efetivamente recebidas nos últimos 12 meses.</div>
                </div>
                <div className="dashboard-panel-highlight">
                  <strong>{formatCurrencyBRL(currentMonthRevenue)}</strong>
                  <span>mês atual</span>
                </div>
              </div>

              {monthlyRevenueSeries.some((item) => item.value > 0) ? (
                <div className="dashboard-line-shell">
                  <div className="dashboard-line-yaxis" aria-hidden="true">
                    {monthlyRevenueTicks.map((tick) => (
                      <span key={tick.value} style={{ top: tick.top }}>
                        {tick.label}
                      </span>
                    ))}
                  </div>
                  <div className="dashboard-line-plot">
                    <div className="dashboard-line-area">
                      {monthlyRevenueTicks.map((tick) => (
                        <div key={tick.value} className="dashboard-line-gridline" style={{ top: tick.top }} />
                      ))}
                      <svg className="dashboard-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        <defs>
                          <linearGradient id="dashboardRevenueFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(225, 186, 59, 0.34)" />
                            <stop offset="100%" stopColor="rgba(225, 186, 59, 0.02)" />
                          </linearGradient>
                        </defs>
                        {monthlyRevenueArea && <path d={monthlyRevenueArea} fill="url(#dashboardRevenueFill)" />}
                        {monthlyRevenueLine && <path d={monthlyRevenueLine} className="dashboard-line-path" />}
                        {monthlyRevenuePoints.map((point) => (
                          <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="1.8" className="dashboard-line-point" />
                        ))}
                      </svg>
                    </div>
                    <div className="dashboard-line-months">
                      {monthlyRevenueSeries.map((item) => (
                        <span key={item.key}>{item.label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="dashboard-empty">Cadastre receitas para visualizar a evolução mensal.</div>
              )}
            </section>

            <section className="dashboard-panel">
              <div className="dashboard-panel-head">
                <div>
                  <div className="dashboard-panel-title">Êxito por carteira</div>
                  <div className="dashboard-panel-caption">Percentual de recebimento por carteira vinculada aos lançamentos.</div>
                </div>
              </div>
              <div className="dashboard-bar-list">
                {successByWallet.map((item) => (
                  <div key={item.label} className="dashboard-bar-item">
                    <div className="dashboard-bar-head">
                      <span>{item.label}</span>
                      <strong>{item.rate}%</strong>
                    </div>
                    <div className="dashboard-bar-track">
                      <div
                        className="dashboard-bar-fill"
                        style={{ width: `${Math.min(item.rate, 100)}%`, background: item.color }}
                      />
                    </div>
                    <div className="dashboard-bar-note">
                      {formatCurrencyAxis(item.received)} recebidos de {formatCurrencyAxis(item.expected)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="dashboard-secondary-grid">
            <section className="dashboard-panel">
              <div className="dashboard-panel-head">
                <div>
                  <div className="dashboard-panel-title">Processos por status</div>
                  <div className="dashboard-panel-caption">Distribuição atual do acervo processual.</div>
                </div>
              </div>

              {totalStatusCases > 0 ? (
                <div className="dashboard-donut-shell">
                  <div className="dashboard-donut-chart" style={{ background: donutGradient }}>
                    <div className="dashboard-donut-hole">
                      <strong>{activeCases}</strong>
                      <span>ativos</span>
                    </div>
                  </div>
                  <div className="dashboard-donut-legend">
                    {statusDistribution.map((item) => (
                      <div key={item.label} className="dashboard-donut-legend-item">
                        <span className="dashboard-donut-color" style={{ background: item.color }} />
                        <div>
                          <strong>{item.label}</strong>
                          <span>
                            {item.value} processo(s) · {Math.round((item.value / totalStatusCases) * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="dashboard-empty">Cadastre processos para acompanhar a distribuição por status.</div>
              )}
            </section>

            <section className="dashboard-panel dashboard-panel-wide">
              <div className="dashboard-panel-head">
                <div>
                  <div className="dashboard-panel-title">Membros da equipe</div>
                  <div className="dashboard-panel-caption">Distribuição de usuários ativos por equipe ou núcleo.</div>
                </div>
              </div>

              {membersByTeam.length > 0 ? (
                <div className="dashboard-bar-list">
                  {membersByTeam.map((item) => (
                    <div key={item.label} className="dashboard-bar-item">
                      <div className="dashboard-bar-head">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                      <div className="dashboard-bar-track">
                        <div
                          className="dashboard-bar-fill"
                          style={{ width: `${(item.value / maxMembersByTeam) * 100}%`, background: item.color }}
                        />
                      </div>
                      <div className="dashboard-bar-note">{item.value} membro(s) ativo(s)</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dashboard-empty">Cadastre membros para visualizar a composição da equipe.</div>
              )}
            </section>
          </div>

          <section className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <div className="dashboard-panel-title">Indicadores rápidos</div>
                <div className="dashboard-panel-caption">Sinais complementares para leitura executiva do escritório.</div>
              </div>
            </div>
            <div className="dashboard-indicators-grid">
              {indicators.map((item) => (
                <div key={item.label} className="dashboard-indicator-card">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.note}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatBrazilDate = (value: string) => parseLocalDate(value).toLocaleDateString("pt-BR");
const splitStoredOab = (value: string) => {
  const compact = value.trim().toUpperCase().replace(/\s+/g, "");
  const digits = compact.replace(/\D/g, "").slice(0, 6);
  const ufMatch = compact.match(/([A-Z]{2})$/);
  return {
    number: digits,
    uf: ufMatch?.[1] ?? ""
  };
};

type PublicationActionMode = "task" | "deadline" | "register";

type PublicationTaskFormState = {
  title: string;
  details: string;
  dueDate: string;
  responsibleEmails: string[];
};

type PublicationDeadlinePriority = "low" | "medium" | "high";
type PublicationDeadlineReminder = "1" | "3" | "7";

type PublicationDeadlineFormState = {
  action: string;
  termDays: string;
  dueDate: string;
  responsibleEmail: string;
  priority: PublicationDeadlinePriority;
  reminderDays: PublicationDeadlineReminder;
  observations: string;
};

type PublicationSummaryFilterKey =
  | "pending_analysis"
  | "open_deadlines"
  | "due_today"
  | "due_tomorrow"
  | "due_within_five_days"
  | "expired_deadlines";

type PublicationFallbackContextRecord = PublicationContextItem;

const publicationSourcePrefix = "djen_cnj";
const publicationFallbackStoragePrefix = "newlaw.publication-handling";

const buildPublicationSourceKey = (publication: TodayPublicationItem) => {
  const identifier = (publication.hash || String(publication.id || "")).trim();
  return `${publicationSourcePrefix}:${identifier}`;
};

const getPublicationFallbackStorageKey = (user: AuthUser | null) => {
  const identity =
    user?.organization_id != null
      ? `org-${user.organization_id}`
      : user?.id != null
        ? `user-${user.id}`
        : user?.email?.trim().toLowerCase() || "anonymous";
  return `${publicationFallbackStoragePrefix}:${identity}`;
};

const loadPublicationFallbackContextMap = (user: AuthUser | null): Record<string, PublicationFallbackContextRecord> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(getPublicationFallbackStorageKey(user));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PublicationFallbackContextRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const savePublicationFallbackContextMap = (
  user: AuthUser | null,
  value: Record<string, PublicationFallbackContextRecord>
) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getPublicationFallbackStorageKey(user), JSON.stringify(value));
};

const normalizeCaseDigits = (value?: string | null) => (value || "").replace(/\D/g, "");

const buildPublicationReference = (processNumber?: string | null) => {
  const normalized = processNumber ? formatCaseNumber(processNumber) : "";
  return normalized ? `[Publicação] Processo ${normalized}` : "[Publicação]";
};

const getAgendaDateKey = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return formatIsoDate(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
};

const normalizeLooseText = (value?: string | null) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const publicationClaimantRoleTokens = new Set(
  [
    "autor",
    "autora",
    "requerente",
    "apelante",
    "agravante",
    "recorrente",
    "embargante",
    "exequente",
    "impetrante",
    "inventariante",
    "demandante",
    "promovente",
    "interessado",
    "interessada"
  ].map((label) => normalizeLooseText(label).replace(/[^a-z]/g, ""))
);

const publicationDefendantRoleTokens = new Set(
  [
    "reu",
    "réu",
    "requerido",
    "requerida",
    "apelado",
    "apelada",
    "agravado",
    "agravada",
    "recorrido",
    "recorrida",
    "embargado",
    "embargada",
    "executado",
    "executada",
    "impetrado",
    "impetrada",
    "demandado",
    "demandada",
    "promovido",
    "promovida"
  ].map((label) => normalizeLooseText(label).replace(/[^a-z]/g, ""))
);

const publicationRolePatternSource = [
  "AUTORA?",
  "R(?:É|E)U",
  "REQUERENTE",
  "REQUERID[OA]",
  "APELANTE",
  "APELAD[OA]",
  "AGRAVANTE",
  "AGRAVAD[OA]",
  "RECORRENTE",
  "RECORRID[OA]",
  "EMBARGANTE",
  "EMBARGAD[OA]",
  "EXEQUENTE",
  "EXECUTAD[OA]",
  "IMPETRANTE",
  "IMPETRAD[OA]",
  "INVENTARIANTE",
  "INTERESSAD[OA]",
  "DEMANDANTE",
  "DEMANDAD[OA]",
  "PROMOVENTE",
  "PROMOVID[OA]"
].join("|");

const publicationNarrativeBoundaryPatternSource = [
  "DESPACHO",
  "DECIS[AÃ]O",
  "SENTEN[CÇ]A",
  "AC[OÓ]RD[AÃ]O",
  "CERTID[AÃ]O",
  "INTIMA[CÇ][AÃ]O",
  "INTIMEM-SE",
  "PUBLIQUE-SE",
  "CUMPRA-SE",
  "SEM\\s+PREJU[IÍ]ZO",
  "VISTOS"
].join("|");

const publicationCompanyNameHints = [
  "LTDA",
  "S/A",
  "SA",
  "EIRELI",
  "ME",
  "MEI",
  "EPP",
  "EMPRESA",
  "COMERCIO",
  "COMÉRCIO",
  "INDUSTRIA",
  "INDÚSTRIA",
  "COOPERATIVA",
  "BANCO",
  "CONDOMINIO",
  "CONDOMÍNIO",
  "ASSOCIACAO",
  "ASSOCIAÇÃO",
  "FUNDACAO",
  "FUNDAÇÃO",
  "INSTITUTO",
  "HOLDING"
];

const normalizePublicationRoleToken = (value: string) => normalizeLooseText(value).replace(/[^a-z]/g, "");

const publicationPartyCapturePattern = new RegExp(
  `\\b(${publicationRolePatternSource})\\s*:\\s*([\\s\\S]*?)(?=\\b(?:ADVOGAD[OA]\\s+DO\\(A\\)\\s+)?(?:${publicationRolePatternSource})\\s*:|\\b(?:${publicationNarrativeBoundaryPatternSource})\\b|$)`,
  "gi"
);

const publicationLawyerCapturePattern = new RegExp(
  `ADVOGAD[OA]\\s+DO\\(A\\)\\s+(${publicationRolePatternSource})\\s*:\\s*([\\s\\S]*?)(?=\\bADVOGAD[OA]\\s+DO\\(A\\)\\s+(?:${publicationRolePatternSource})\\s*:|\\b(?:${publicationRolePatternSource})\\s*:|\\b(?:${publicationNarrativeBoundaryPatternSource})\\b|$)`,
  "gi"
);

const stripPublicationParticipantDetails = (value: string) =>
  value
    .replace(/\((?:[^)]*(?:oab|cpf|cnpj|represent)[^)]*)\)/gi, "")
    .replace(/\b(?:cpf|cnpj)\s*[:\-]?\s*\d[\d./-]*/gi, "")
    .replace(/\b(?:despacho|decis[aã]o|senten[cç]a|ac[oó]rd[aã]o|certid[aã]o|intima[cç][aã]o|intimem-se|publique-se|cumpra-se|sem preju[ií]zo|vistos)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "")
    .trim();

const extractPublicationDocumentInfo = (value: string): { formatted: string; kind: ClientKind | null } => {
  const cnpjMatch = value.match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}-?\d{2}\b/);
  if (cnpjMatch) {
    const digits = cnpjMatch[0].replace(/\D/g, "");
    if (isValidCnpj(digits)) {
      return { formatted: formatCnpj(digits), kind: "PJ" };
    }
  }
  const cpfMatch = value.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}-?\d{2}\b/);
  if (cpfMatch) {
    const digits = cpfMatch[0].replace(/\D/g, "");
    if (isValidCpf(digits)) {
      return { formatted: formatCpf(digits), kind: "PF" };
    }
  }
  return { formatted: "", kind: null };
};

const stripPublicationDocumentInfo = (value: string) =>
  value
    .replace(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}-?\d{2}\b/g, "")
    .replace(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}-?\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "")
    .trim();

const inferPublicationClientKind = (name: string, document: string) => {
  const resolved = resolveClientKind(document);
  if (document.replace(/\D/g, "").length > 0) return resolved;
  const normalizedName = normalizeLooseText(name);
  return publicationCompanyNameHints.some((hint) => normalizedName.includes(normalizeLooseText(hint))) ? "PJ" : "PF";
};

const formatPublicationClientName = (value: string, kind: ClientKind) => {
  const sanitized = value
    .replace(/\s+/g, " ")
    .replace(kind === "PF" ? /[^A-Za-zÀ-ÿ\s]/g : /[^A-Za-zÀ-ÿ0-9\s.&/()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.toUpperCase();
};

const extractPublicationPartySuggestions = (publication: TodayPublicationItem, user: AuthUser | null) => {
  const text = [publication.summary, publication.title].filter(Boolean).join(";\n");
  const claimants: string[] = [];
  const defendants: string[] = [];
  const others: string[] = [];
  const seen = new Set<string>();
  const currentOab = splitStoredOab(user?.oab || "");
  const normalizedUserName = normalizeLooseText(user?.name || "");
  let representedSide: "claimant" | "defendant" | null = null;

  for (const match of text.matchAll(new RegExp(publicationPartyCapturePattern.source, publicationPartyCapturePattern.flags))) {
    const matchIndex = match.index ?? 0;
    const prefixExcerpt = normalizeLooseText(text.slice(Math.max(0, matchIndex - 24), matchIndex));
    if (prefixExcerpt.includes("advogado do(a)") || prefixExcerpt.includes("advogada do(a)")) continue;
    const roleToken = normalizePublicationRoleToken(match[1] || "");
    const partyValue = stripPublicationParticipantDetails(match[2] || "");
    const dedupeKey = normalizeLooseText(`${roleToken}:${partyValue}`);
    if (!partyValue || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (publicationClaimantRoleTokens.has(roleToken)) {
      claimants.push(partyValue);
      continue;
    }
    if (publicationDefendantRoleTokens.has(roleToken)) {
      defendants.push(partyValue);
      continue;
    }
    others.push(partyValue);
  }

  for (const match of text.matchAll(new RegExp(publicationLawyerCapturePattern.source, publicationLawyerCapturePattern.flags))) {
    const roleToken = normalizePublicationRoleToken(match[1] || "");
    const lawyerValue = normalizeLooseText(match[2] || "");
    const oabMatch = currentOab.number
      ? lawyerValue.includes(currentOab.number) && (!currentOab.uf || lawyerValue.includes(currentOab.uf.toLowerCase()))
      : false;
    const nameMatch = normalizedUserName ? lawyerValue.includes(normalizedUserName) : false;
    if (!oabMatch && !nameMatch) continue;
    if (publicationClaimantRoleTokens.has(roleToken)) {
      representedSide = "claimant";
      break;
    }
    if (publicationDefendantRoleTokens.has(roleToken)) {
      representedSide = "defendant";
      break;
    }
  }

  const preferredParty =
    representedSide === "defendant"
      ? defendants[0] || claimants[0] || others[0] || ""
      : claimants[0] || defendants[0] || others[0] || "";
  const documentInfo = extractPublicationDocumentInfo(preferredParty);
  const cleanClientName = stripPublicationDocumentInfo(preferredParty);
  const clientKind = inferPublicationClientKind(cleanClientName, documentInfo.formatted);
  const oppositeSide =
    representedSide === "defendant" ? claimants : defendants.length ? defendants : claimants.slice(1);
  const counterpartyRaw = oppositeSide.find((party) => normalizeLooseText(party) !== normalizeLooseText(preferredParty)) || "";
  const counterpartyKind = inferPublicationClientKind(counterpartyRaw, "");

  return {
    clientName: formatPublicationClientName(cleanClientName, clientKind),
    clientDocument: documentInfo.formatted,
    clientKind,
    counterparty: formatPublicationClientName(stripPublicationDocumentInfo(counterpartyRaw), counterpartyKind)
  };
};

const extractSuggestedPublicationCourt = (publication: TodayPublicationItem) => {
  const haystack = [publication.summary, publication.court_name].filter(Boolean).join("; ");
  const patterns = [
    /\b(\d+ª?\s+vara[^;,.]+)/i,
    /\b(vara[^;,.]+)/i,
    /\b(juizado[^;,.]+)/i,
    /\b(c[aâ]mara[^;,.]+)/i,
    /\b(turma[^;,.]+)/i
  ];
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) {
      const normalized = match[1].replace(/\s+de\s+[^;,.]+$/i, "").trim();
      return formatCourtOrRegion(normalized).trim();
    }
  }
  const fallback = (publication.court_name || "").trim();
  return fallback ? formatCourtOrRegion(fallback.replace(/\s+de\s+[^;,.]+$/i, "").trim()) : "";
};

const extractSuggestedPublicationRegion = (publication: TodayPublicationItem) => {
  const haystack = [publication.summary, publication.court_name].filter(Boolean).join("; ");
  const patterns = [
    /\bforo\s+de\s+([^;,.]+)/i,
    /\bcomarca\s+de\s+([^;,.]+)/i,
    /\bsubsec[aã]o\s+judici[aá]ria\s+de\s+([^;,.]+)/i,
    /\bsec[aã]o\s+judici[aá]ria\s+de\s+([^;,.]+)/i
  ];
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) return formatCourtOrRegion(match[1]).trim();
  }
  const courtName = (publication.court_name || "").trim();
  const trailingLocationMatch = courtName.match(/\s+de\s+([^;,.]+)$/i);
  if (trailingLocationMatch?.[1]) return formatCourtOrRegion(trailingLocationMatch[1]).trim();
  return "";
};

const publicationDeadlineKeywordHints = [
  "prazo",
  "vencimento",
  "vence",
  "manifest",
  "contest",
  "impugn",
  "contrarrazo",
  "contrarazo",
  "apresente",
  "apresentar",
  "comprove",
  "recolha",
  "regularize",
  "emende",
  "cumpra",
  "responda"
];

const publicationDeadlinePriorityOptions: { value: PublicationDeadlinePriority; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" }
];

const publicationDeadlinePriorityLabels: Record<PublicationDeadlinePriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta"
};

const publicationDeadlineReminderOptions: { value: PublicationDeadlineReminder; label: string }[] = [
  { value: "1", label: "1 dia" },
  { value: "3", label: "3 dias" },
  { value: "7", label: "7 dias" }
];

const publicationDeadlineReminderLabels: Record<PublicationDeadlineReminder, string> = {
  "1": "1 dia antes",
  "3": "3 dias antes",
  "7": "7 dias antes"
};

const buildValidIsoDate = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(year, month - 1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return null;
  }
  return formatIsoDate(candidate);
};

const normalizePublicationDateMatch = (match: RegExpExecArray) => {
  if (match[1] && match[2] && match[3]) {
    const parsedYear = Number(match[3]);
    const year = match[3].length === 2 ? 2000 + parsedYear : parsedYear;
    return buildValidIsoDate(year, Number(match[2]), Number(match[1]));
  }
  if (match[4] && match[5] && match[6]) {
    return buildValidIsoDate(Number(match[4]), Number(match[5]), Number(match[6]));
  }
  return null;
};

const extractSuggestedPublicationDueDate = (publication: TodayPublicationItem) => {
  const haystack = [publication.title, publication.summary, publication.communication_type, publication.court_name]
    .filter(Boolean)
    .join(" ");
  if (!haystack.trim()) return null;

  const explicitDatePattern = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;

  for (const match of haystack.matchAll(explicitDatePattern)) {
    const index = match.index ?? 0;
    const excerptStart = Math.max(0, index - 72);
    const excerptEnd = Math.min(haystack.length, index + match[0].length + 72);
    const excerpt = normalizeLooseText(haystack.slice(excerptStart, excerptEnd));
    const hasDeadlineHint = publicationDeadlineKeywordHints.some((keyword) => excerpt.includes(keyword));
    if (!hasDeadlineHint) continue;
    const isoDate = normalizePublicationDateMatch(match);
    if (isoDate) return isoDate;
  }

  return null;
};

const extractSuggestedPublicationTermDays = (publication: TodayPublicationItem) => {
  const haystack = normalizeLooseText(
    [publication.title, publication.summary, publication.communication_type, publication.court_name]
      .filter(Boolean)
      .join(" ")
  );
  if (!haystack.trim()) return "";

  for (const match of haystack.matchAll(/\b(\d{1,3})\s*dias?\b/g)) {
    const index = match.index ?? 0;
    const excerptStart = Math.max(0, index - 72);
    const excerptEnd = Math.min(haystack.length, index + match[0].length + 72);
    const excerpt = haystack.slice(excerptStart, excerptEnd);
    const hasDeadlineHint = publicationDeadlineKeywordHints.some((keyword) => excerpt.includes(keyword));
    if (hasDeadlineHint) return match[1];
  }

  return "";
};

const formatPublicationDeadlineTermLabel = (termDays: string) => {
  const numeric = Number(termDays);
  if (!Number.isFinite(numeric) || numeric <= 0) return termDays.trim();
  return `${numeric} dia${numeric === 1 ? "" : "s"}`;
};

const buildPublicationDeadlineTaskTitle = (form: PublicationDeadlineFormState) => {
  const action = form.action.trim();
  if (action) return action;
  const termLabel = formatPublicationDeadlineTermLabel(form.termDays);
  return termLabel ? `Prazo ${termLabel}` : "Prazo";
};

const buildPublicationDeadlineTaskDetails = (form: PublicationDeadlineFormState) => {
  const lines = [
    `Prazo: ${formatPublicationDeadlineTermLabel(form.termDays)}`,
    `Prioridade: ${publicationDeadlinePriorityLabels[form.priority]}`,
    `Lembrete: ${publicationDeadlineReminderLabels[form.reminderDays]}`
  ];
  if (form.observations.trim()) {
    lines.push(`Observações: ${form.observations.trim()}`);
  }
  return lines.join("\n");
};

const isPublicationAgendaEvent = (item: AgendaItem) =>
  item.created_via === "publication" || Boolean(item.publication_source_key) || (item.reference || "").startsWith("[Publicação]");

const getPublicationHandlingLabel = (status?: PublicationHandlingStatus | null) => {
  if (status === "task_created") return "Providência registrada";
  if (status === "read_no_action") return "Lida sem providências";
  return "";
};

const getPublicationAgendaReferenceLabel = (item: AgendaItem) => {
  const reference = (item.reference || "").replace(/^\[Publicação\]\s*/, "").trim();
  if (item.publication_process_number) return `Processo ${item.publication_process_number}`;
  return reference || "Publicação";
};

const isPublicationApiUnavailableError = (err: unknown) => {
  const status = (err as { response?: { status?: number } }).response?.status;
  return status === 404 || status === 405;
};

function PublicationTaskModal({
  open,
  publication,
  context,
  user,
  form,
  busy,
  errorMessage,
  onClose,
  onSubmit,
  onChangeField,
  onToggleResponsible
}: {
  open: boolean;
  publication: TodayPublicationItem | null;
  context: PublicationContextItem | null;
  user: AuthUser | null;
  form: PublicationTaskFormState;
  busy: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChangeField: (field: keyof PublicationTaskFormState, value: string) => void;
  onToggleResponsible: (email: string) => void;
}) {
  if (!open || !publication) return null;

  const currentUserEmail = user?.email?.trim().toLowerCase() || "";
  const additionalResponsibles = (context?.allowed_responsibles || []).filter(
    (item) => item.email.trim().toLowerCase() !== currentUserEmail
  );

  return (
    <div className="modal-backdrop">
      <div className="modal-card publication-task-modal-card">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Gerar tarefa</h2>
            <div className="publication-meta">
              {publication.process_number ? `Processo ${publication.process_number}` : "Processo não identificado"}
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar" disabled={busy}>
            ×
          </button>
        </div>

        {errorMessage && <div className="error">{errorMessage}</div>}

        <form onSubmit={onSubmit}>
          <div className="modal-grid publication-task-grid">
            <div className="field">
              <label>Título *</label>
              <input value={form.title} onChange={(event) => onChangeField("title", event.target.value)} />
            </div>
            <div className="field">
              <label>Data de entrega *</label>
              <input type="date" value={form.dueDate} onChange={(event) => onChangeField("dueDate", event.target.value)} />
            </div>
            <div className="field span-2">
              <label>Detalhamento</label>
              <textarea
                value={form.details}
                onChange={(event) => onChangeField("details", event.target.value)}
                placeholder="Descreva o que precisa ser feito."
              />
            </div>
            <div className="field span-2">
              <label>Responsáveis</label>
              <div className="publication-task-assignees-note">
                Seu login será incluído automaticamente: <strong>{user?.name || user?.email || "Usuário atual"}</strong>
              </div>
              {context?.wallet_name && <div className="publication-meta">Carteira vinculada: {context.wallet_name}</div>}
              {context?.allow_additional_responsibles && additionalResponsibles.length > 0 ? (
                <div className="publication-task-assignee-list">
                  {additionalResponsibles.map((responsible) => {
                    const checked = form.responsibleEmails.includes(responsible.email);
                    return (
                      <label key={responsible.email} className="publication-task-assignee-option">
                        <input type="checkbox" checked={checked} onChange={() => onToggleResponsible(responsible.email)} />
                        <div>
                          <div className="publication-task-assignee-name">{responsible.name}</div>
                          <div className="publication-task-assignee-email">{responsible.email}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="publication-task-assignees-note">
                  Sem outros responsáveis disponíveis para esta publicação. A tarefa será criada apenas no seu calendário.
                </div>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button className="btn" type="submit" disabled={!form.title.trim() || !form.dueDate || busy}>
              {busy ? "Gerando..." : "Salvar tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PublicationDeadlineModal({
  open,
  publication,
  user,
  form,
  officeResponsibleOptions,
  busy,
  errorMessage,
  onClose,
  onSubmit,
  onChangeField
}: {
  open: boolean;
  publication: TodayPublicationItem | null;
  user: AuthUser | null;
  form: PublicationDeadlineFormState;
  officeResponsibleOptions: Array<{ value: string; label: string; note: string }>;
  busy: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onChangeField: <K extends keyof PublicationDeadlineFormState>(field: K, value: PublicationDeadlineFormState[K]) => void;
}) {
  if (!open || !publication) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card publication-task-modal-card">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Gerar prazo</h2>
            <div className="publication-meta">
              {publication.process_number ? `Processo ${publication.process_number}` : "Processo não identificado"}
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar" disabled={busy}>
            ×
          </button>
        </div>

        {errorMessage && <div className="error">{errorMessage}</div>}

        <form onSubmit={onSubmit}>
          <div className="modal-grid publication-task-grid">
            <div className="field span-2">
              <label>Providência *</label>
              <textarea
                className="publication-deadline-providence"
                value={form.action}
                onChange={(event) => onChangeField("action", event.target.value)}
                placeholder="Descreva o que precisa ser feito para cumprir este prazo"
              />
            </div>
            <div className="field">
              <label>Prazo *</label>
              <div className="input-with-hint">
                <input
                  inputMode="numeric"
                  value={form.termDays}
                  onChange={(event) => onChangeField("termDays", event.target.value.replace(/\D/g, ""))}
                  placeholder="Apenas números"
                />
                <span className="hint">dias</span>
              </div>
            </div>
            <div className="field">
              <label>Data de entrega *</label>
              <input type="date" value={form.dueDate} onChange={(event) => onChangeField("dueDate", event.target.value)} />
            </div>
            <div className="field">
              <label>Responsável</label>
              <select value={form.responsibleEmail} onChange={(event) => onChangeField("responsibleEmail", event.target.value)}>
                {officeResponsibleOptions.map((option) => (
                  <option key={`${option.value || "self"}-${option.note}`} value={option.value}>
                    {option.note ? `${option.label} · ${option.note}` : option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Prioridade</label>
              <div className="publication-choice-group" role="group" aria-label="Prioridade">
                {publicationDeadlinePriorityOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`publication-choice-btn ${form.priority === option.value ? "active" : ""}`}
                    onClick={() => onChangeField("priority", option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field span-2">
              <label>Lembretes</label>
              <div className="publication-choice-group" role="group" aria-label="Lembretes">
                {publicationDeadlineReminderOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`publication-choice-btn ${form.reminderDays === option.value ? "active" : ""}`}
                    onClick={() => onChangeField("reminderDays", option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field span-2">
              <label>Observações</label>
              <textarea
                value={form.observations}
                onChange={(event) => onChangeField("observations", event.target.value)}
                placeholder="Adicione observações complementares"
              />
            </div>
          </div>

          <div className="modal-actions">
            <button className="btn ghost" type="button" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button className="btn" type="submit" disabled={!form.action.trim() || !form.termDays || !form.dueDate || busy}>
              {busy ? "Gerando..." : "Salvar prazo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Publications({ user }: { user: AuthUser | null }) {
  const [todayPublicationResult, setTodayPublicationResult] = useState<TodayPublicationsResponse | null>(null);
  const [publicationContextMap, setPublicationContextMap] = useState<Record<string, PublicationContextItem>>({});
  const [isLoadingTodayPublications, setIsLoadingTodayPublications] = useState(false);
  const [isLoadingPublicationContext, setIsLoadingPublicationContext] = useState(false);
  const [todayPublicationsError, setTodayPublicationsError] = useState("");
  const [todayPublicationsInlineMessage, setTodayPublicationsInlineMessage] = useState("");
  const [selectedPublicationDate, setSelectedPublicationDate] = useState(() => formatIsoDate(new Date()));
  const [publicationAgendaItems, setPublicationAgendaItems] = useState<AgendaItem[]>([]);
  const [isLoadingPublicationAgenda, setIsLoadingPublicationAgenda] = useState(false);
  const [publicationAgendaError, setPublicationAgendaError] = useState("");
  const [activePublication, setActivePublication] = useState<TodayPublicationItem | null>(null);
  const [activePublicationAction, setActivePublicationAction] = useState<PublicationActionMode | null>(null);
  const [activePublicationSummaryFilter, setActivePublicationSummaryFilter] = useState<PublicationSummaryFilterKey | null>(null);
  const [publicationOfficeMembers, setPublicationOfficeMembers] = useState<ApiTeamMember[]>([]);
  const [publicationWallets, setPublicationWallets] = useState<ApiWallet[]>([]);
  const [publicationTaskForm, setPublicationTaskForm] = useState<PublicationTaskFormState>({
    title: "",
    details: "",
    dueDate: formatIsoDate(new Date()),
    responsibleEmails: []
  });
  const [publicationDeadlineForm, setPublicationDeadlineForm] = useState<PublicationDeadlineFormState>({
    action: "",
    termDays: "",
    dueDate: "",
    responsibleEmail: "",
    priority: "medium",
    reminderDays: "3",
    observations: ""
  });
  const [publicationActionError, setPublicationActionError] = useState("");
  const [publicationRegistrationClientForm, setPublicationRegistrationClientForm] = useState<ClientForm>(emptyClientForm);
  const [publicationRegistrationCaseForm, setPublicationRegistrationCaseForm] = useState<CaseForm>(emptyCaseForm);
  const [publicationRegistrationClient, setPublicationRegistrationClient] = useState<ApiClient | null>(null);
  const [publicationRegistrationCepError, setPublicationRegistrationCepError] = useState("");
  const [publicationRegistrationClientError, setPublicationRegistrationClientError] = useState("");
  const [publicationRegistrationCaseError, setPublicationRegistrationCaseError] = useState("");
  const [isSavingPublicationRegistrationClient, setIsSavingPublicationRegistrationClient] = useState(false);
  const [isSavingPublicationRegistrationCase, setIsSavingPublicationRegistrationCase] = useState(false);
  const [processingPublicationSourceKey, setProcessingPublicationSourceKey] = useState("");
  const publicationResultsRef = useRef<HTMLDivElement | null>(null);
  const storedSessionOab = loadAuthSession()?.user?.oab || "";
  const currentPublicationOab = splitStoredOab(user?.oab || storedSessionOab);
  const hasCurrentPublicationOab = currentPublicationOab.number.length === 6 && Boolean(currentPublicationOab.uf);

  const buildPublicationContextFallback = async (items: TodayPublicationItem[]) => {
    const storedMap = loadPublicationFallbackContextMap(user);
    if (items.length === 0) return {};

    const [cases, wallets] = await Promise.all([apiListCases(), apiListWallets().catch(() => [])]);
    const walletMap = new Map<number, ApiWallet>();
    wallets.forEach((wallet) => walletMap.set(wallet.id, wallet));

    return items.reduce<Record<string, PublicationContextItem>>((acc, publication) => {
      const sourceKey = buildPublicationSourceKey(publication);
      const matchedCase =
        cases.find((entry) => normalizeCaseDigits(entry.number) === normalizeCaseDigits(publication.process_number)) || null;
      const wallet = matchedCase?.wallet_id ? walletMap.get(matchedCase.wallet_id) || null : null;
      const allowedResponsibles =
        wallet?.team_members
          ?.filter((member) => member.is_active)
          .map((member) => ({
            name: member.full_name,
            email: member.email.trim().toLowerCase()
          })) || [];

      let warning = "";
      if (!matchedCase) {
        warning = "Processo não cadastrado. Você pode gerar apenas um evento no seu calendário.";
      } else if (!wallet) {
        warning = "Processo cadastrado sem carteira vinculada. A tarefa ficará apenas no seu calendário.";
      } else if (allowedResponsibles.length === 0) {
        warning = "Nenhum outro responsável com acesso à carteira possui login ativo.";
      }

      const stored = storedMap[sourceKey];
      acc[sourceKey] = {
        source_key: sourceKey,
        status: stored?.status,
        handled_at: stored?.handled_at,
        has_registered_case: Boolean(matchedCase),
        case_id: matchedCase?.id ?? null,
        case_number: matchedCase?.number || publication.process_number || null,
        wallet_id: wallet?.id ?? null,
        wallet_name: wallet?.name || null,
        allow_additional_responsibles: Boolean(wallet && allowedResponsibles.length > 0),
        allowed_responsibles: allowedResponsibles,
        warning
      };
      return acc;
    }, {});
  };

  const persistPublicationFallbackContext = (sourceKey: string, nextContext: PublicationContextItem) => {
    const current = loadPublicationFallbackContextMap(user);
    current[sourceKey] = nextContext;
    savePublicationFallbackContextMap(user, current);
  };

  const loadPublicationAgenda = async () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90);
    setIsLoadingPublicationAgenda(true);
    setPublicationAgendaError("");
    try {
      const data = await apiListAgendaEvents({
        start: `${formatIsoDate(start)}T00:00:00`,
        end: `${formatIsoDate(end)}T23:59:59`
      });
      setPublicationAgendaItems(data);
    } catch (err) {
      setPublicationAgendaError(extractApiErrorMessage(err, "Não foi possível carregar os indicadores de publicações."));
    } finally {
      setIsLoadingPublicationAgenda(false);
    }
  };

  useEffect(() => {
    void loadPublicationAgenda();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPublicationOfficeMembers = async () => {
      try {
        const data = await apiListTeamMembers();
        if (cancelled) return;
        setPublicationOfficeMembers(
          data
            .filter((member) => member.is_active && member.email.trim())
            .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR", { sensitivity: "base" }))
        );
      } catch {
        if (cancelled) return;
        setPublicationOfficeMembers([]);
      }
    };
    void loadPublicationOfficeMembers();
    return () => {
      cancelled = true;
    };
  }, []);

  const publicationOfficeResponsibleOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string; note: string }> = [];

    publicationOfficeMembers.forEach((member) => {
      const email = member.email.trim().toLowerCase();
      if (!email || seen.has(email)) return;
      seen.add(email);
      options.push({
        value: email,
        label: member.full_name,
        note: member.email
      });
    });

    const currentUserEmail = user?.email?.trim().toLowerCase() || "";
    if (currentUserEmail && !seen.has(currentUserEmail)) {
      options.unshift({
        value: currentUserEmail,
        label: user?.name || currentUserEmail,
        note: user?.email || currentUserEmail
      });
    }

    if (!options.length) {
      options.push({
        value: currentUserEmail,
        label: user?.name || "Usuário atual",
        note: user?.email || ""
      });
    }

    return options;
  }, [publicationOfficeMembers, user]);

  const ensurePublicationWalletsLoaded = async () => {
    if (publicationWallets.length > 0) return publicationWallets;
    const data = await apiListWallets();
    setPublicationWallets(data);
    return data;
  };

  const resetPublicationRegistrationState = () => {
    setPublicationRegistrationClientForm(emptyClientForm);
    setPublicationRegistrationCaseForm(emptyCaseForm);
    setPublicationRegistrationClient(null);
    setPublicationRegistrationCepError("");
    setPublicationRegistrationClientError("");
    setPublicationRegistrationCaseError("");
    setIsSavingPublicationRegistrationClient(false);
    setIsSavingPublicationRegistrationCase(false);
  };

  const refreshPublicationContextItem = async (publication: TodayPublicationItem) => {
    const sourceKey = buildPublicationSourceKey(publication);
    try {
      const response = await apiGetPublicationContext({
        items: [{ source_key: sourceKey, process_number: publication.process_number }]
      });
      const nextContext = response.items[0] || null;
      if (nextContext) {
        mergePublicationContext(sourceKey, nextContext);
        persistPublicationFallbackContext(sourceKey, nextContext);
        return nextContext;
      }
    } catch {
      // Fallback handled below.
    }

    try {
      const fallbackContext = (await buildPublicationContextFallback([publication]))[sourceKey] || null;
      if (fallbackContext) {
        mergePublicationContext(sourceKey, fallbackContext);
        persistPublicationFallbackContext(sourceKey, fallbackContext);
      }
      return fallbackContext;
    } catch {
      return null;
    }
  };

  const handlePublicationSearchDateChange = (value: string) => {
    if (!value) return;
    setSelectedPublicationDate(value);
    setTodayPublicationsError("");
    setTodayPublicationsInlineMessage("");
  };

  const handleLoadTodayPublications = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setIsLoadingTodayPublications(true);
    setTodayPublicationsError("");
    setTodayPublicationsInlineMessage("");
    setPublicationActionError("");
    try {
      if (!hasCurrentPublicationOab) {
        throw new Error("OAB não cadastrada no seu membro da equipe. Cadastre a OAB para consultar publicações.");
      }
      const data = await apiGetTodayPublications(selectedPublicationDate);
      if (data.oab) {
        const session = loadAuthSession();
        if (session?.user && session.user.oab !== data.oab) {
          saveAuthSession({
            ...session,
            user: {
              ...session.user,
              oab: data.oab
            }
          });
        }
      }
      const formattedDate = formatBrazilDate(data.publication_date);
      setTodayPublicationResult(data);
      if (data.items.length > 0) {
        setIsLoadingPublicationContext(true);
        try {
          const contextResponse = await apiGetPublicationContext({
            items: data.items.map((publication) => ({
              source_key: buildPublicationSourceKey(publication),
              process_number: publication.process_number
            }))
          });
          const storedContextMap = loadPublicationFallbackContextMap(user);
          setPublicationContextMap(
            contextResponse.items.reduce<Record<string, PublicationContextItem>>((acc, item) => {
              const stored = storedContextMap[item.source_key];
              acc[item.source_key] = item;
              if (stored?.status) {
                acc[item.source_key] = {
                  ...item,
                  status: stored.status,
                  handled_at: stored.handled_at
                };
              }
              return acc;
            }, {})
          );
        } catch (err) {
          if (isPublicationApiUnavailableError(err)) {
            setPublicationContextMap(await buildPublicationContextFallback(data.items));
          } else {
            setPublicationContextMap({});
          }
        } finally {
          setIsLoadingPublicationContext(false);
        }
      } else {
        setPublicationContextMap({});
      }
      setTodayPublicationsInlineMessage(
        data.count > 0
          ? `${data.count} publicação(ões) encontrada(s) em ${formattedDate} para ${data.oab}.`
          : `Nenhuma publicação encontrada em ${formattedDate} para ${data.oab}.`
      );
    } catch (err) {
      setPublicationContextMap({});
      setTodayPublicationsError(extractApiErrorMessage(err, "Não foi possível carregar as publicações da data selecionada."));
    } finally {
      setIsLoadingPublicationContext(false);
      setIsLoadingTodayPublications(false);
    }
  };

  const openPublicationActionModal = (publication: TodayPublicationItem, mode: PublicationActionMode) => {
    setActivePublication(publication);
    setActivePublicationAction(mode);
    setPublicationActionError("");
    setTodayPublicationsError("");
    setTodayPublicationsInlineMessage("");
    if (mode === "task") {
      setPublicationTaskForm({
        title: publication.process_number ? `Providência do processo ${publication.process_number}` : "Providência da publicação",
        details: "",
        dueDate: selectedPublicationDate,
        responsibleEmails: []
      });
      return;
    }
    if (mode === "register") {
      const partySuggestions = extractPublicationPartySuggestions(publication, user);
      resetPublicationRegistrationState();
      setPublicationRegistrationClientForm({
        ...emptyClientForm,
        kind: partySuggestions.clientKind,
        name: partySuggestions.clientName,
        cpf: partySuggestions.clientKind === "PF" ? partySuggestions.clientDocument : "",
        cnpj: partySuggestions.clientKind === "PJ" ? partySuggestions.clientDocument : ""
      });
      setPublicationRegistrationCaseForm({
        ...emptyCaseForm,
        process: publication.process_number ? formatCaseNumber(publication.process_number) : "",
        court: extractSuggestedPublicationCourt(publication),
        region: extractSuggestedPublicationRegion(publication),
        counterparty: partySuggestions.counterparty
      });
      void ensurePublicationWalletsLoaded().catch((err) => {
        setPublicationRegistrationCaseError(extractApiErrorMessage(err, "Não foi possível carregar as carteiras do escritório."));
      });
      return;
    }
    setPublicationDeadlineForm({
      action: "",
      termDays: extractSuggestedPublicationTermDays(publication),
      dueDate: extractSuggestedPublicationDueDate(publication) || "",
      responsibleEmail: publicationOfficeResponsibleOptions[0]?.value || user?.email?.trim().toLowerCase() || "",
      priority: "medium",
      reminderDays: "3",
      observations: ""
    });
  };

  const closePublicationActionModal = () => {
    if (processingPublicationSourceKey || isSavingPublicationRegistrationClient || isSavingPublicationRegistrationCase) return;
    setActivePublication(null);
    setActivePublicationAction(null);
    setPublicationActionError("");
    resetPublicationRegistrationState();
  };

  const handleTogglePublicationResponsible = (email: string) => {
    setPublicationTaskForm((prev) => ({
      ...prev,
      responsibleEmails: prev.responsibleEmails.includes(email)
        ? prev.responsibleEmails.filter((item) => item !== email)
        : [...prev.responsibleEmails, email]
    }));
  };

  const handlePublicationTaskFormField = (field: keyof PublicationTaskFormState, value: string) => {
    setPublicationTaskForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePublicationDeadlineFormField = <K extends keyof PublicationDeadlineFormState>(
    field: K,
    value: PublicationDeadlineFormState[K]
  ) => {
    setPublicationDeadlineForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePublicationRegistrationClientFormField = (field: keyof ClientForm, value: ClientForm[keyof ClientForm]) => {
    if (field === "cep") setPublicationRegistrationCepError("");
    if (publicationRegistrationClientError) setPublicationRegistrationClientError("");
    setPublicationRegistrationClientForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePublicationRegistrationCaseFormField = (field: keyof CaseForm, value: string) => {
    if (publicationRegistrationCaseError) setPublicationRegistrationCaseError("");
    setPublicationRegistrationCaseForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLookupPublicationRegistrationCep = async (cepDigits: string) => {
    if (cepDigits.length !== 8) return;
    setPublicationRegistrationCepError("");
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data = await resp.json();
      if (!data || data.erro) {
        setPublicationRegistrationCepError("CEP não encontrado.");
        return;
      }
      setPublicationRegistrationClientForm((prev) => ({
        ...prev,
        cep: `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`,
        address: data.logradouro || prev.address,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state
      }));
    } catch {
      setPublicationRegistrationCepError("Falha ao buscar CEP.");
    }
  };

  const handleSavePublicationRegistrationClient = async () => {
    const validationMessage = getClientFormValidationMessage(publicationRegistrationClientForm);
    if (validationMessage) {
      setPublicationRegistrationClientError(validationMessage);
      return;
    }
    const payload = buildClientPayload(publicationRegistrationClientForm);
    const document = (payload.document || "").trim();
    if (!publicationRegistrationClientForm.name.trim() || !document) return;

    setIsSavingPublicationRegistrationClient(true);
    setPublicationRegistrationClientError("");
    try {
      const created = await apiCreateClient(payload);
      setPublicationRegistrationClient(created);
      try {
        await ensurePublicationWalletsLoaded();
      } catch (err) {
        setPublicationRegistrationCaseError(extractApiErrorMessage(err, "Não foi possível carregar as carteiras do escritório."));
      }
    } catch (err) {
      setPublicationRegistrationClientError(extractApiErrorMessage(err, "Não foi possível salvar o cliente na API."));
    } finally {
      setIsSavingPublicationRegistrationClient(false);
    }
  };

  const handleSavePublicationRegistrationCase = async () => {
    if (!activePublication || !publicationRegistrationClient) return;
    const validationMessage = getCaseFormValidationMessage(publicationRegistrationCaseForm);
    if (validationMessage) {
      setPublicationRegistrationCaseError(validationMessage);
      return;
    }

    setIsSavingPublicationRegistrationCase(true);
    setPublicationRegistrationCaseError("");
    try {
      const counterparty = formatCounterparty(publicationRegistrationCaseForm.counterparty).trim() || "Parte contrária";
      const formattedProcess = formatCaseNumber(publicationRegistrationCaseForm.process);
      const created = await apiCreateCase({
        number: formattedProcess,
        title: `${publicationRegistrationClient.name} x ${counterparty}`,
        client_id: publicationRegistrationClient.id,
        wallet_id: publicationRegistrationCaseForm.walletId ? Number(publicationRegistrationCaseForm.walletId) : undefined,
        status: "aberto",
        forum: formatCourtOrRegion(publicationRegistrationCaseForm.region).trim() || undefined,
        court: formatCourtOrRegion(publicationRegistrationCaseForm.court).trim() || undefined
      });

      const sourceKey = buildPublicationSourceKey(activePublication);
      const selectedWallet = publicationWallets.find((wallet) => wallet.id === created.wallet_id) || null;
      const allowedResponsibles =
        selectedWallet?.team_members
          ?.filter((member) => member.is_active)
          .map((member) => ({
            name: member.full_name,
            email: member.email.trim().toLowerCase()
          })) || [];
      const nextContext: PublicationContextItem = {
        source_key: sourceKey,
        status: publicationContextMap[sourceKey]?.status,
        handled_at: publicationContextMap[sourceKey]?.handled_at,
        has_registered_case: true,
        case_id: created.id,
        case_number: created.number || activePublication.process_number || null,
        wallet_id: created.wallet_id ?? selectedWallet?.id ?? null,
        wallet_name: created.wallet_name || selectedWallet?.name || null,
        allow_additional_responsibles: Boolean((created.wallet_id ?? selectedWallet?.id) && allowedResponsibles.length > 0),
        allowed_responsibles: allowedResponsibles,
        warning: allowedResponsibles.length === 0 ? "Nenhum outro responsável com acesso à carteira possui login ativo." : ""
      };

      mergePublicationContext(sourceKey, nextContext);
      persistPublicationFallbackContext(sourceKey, nextContext);
      void refreshPublicationContextItem(activePublication);
      setTodayPublicationsInlineMessage("Cliente e processo cadastrados com sucesso a partir da publicação.");
      setActivePublication(null);
      setActivePublicationAction(null);
      resetPublicationRegistrationState();
    } catch (err) {
      setPublicationRegistrationCaseError(extractApiErrorMessage(err, "Não foi possível salvar o processo na API."));
    } finally {
      setIsSavingPublicationRegistrationCase(false);
    }
  };

  const mergePublicationContext = (sourceKey: string, patch: Partial<PublicationContextItem>) => {
    setPublicationContextMap((prev) => {
      const current = prev[sourceKey];
      return {
        ...prev,
        [sourceKey]: {
          source_key: sourceKey,
          status: current?.status,
          handled_at: current?.handled_at,
          has_registered_case: current?.has_registered_case ?? false,
          case_id: current?.case_id ?? null,
          case_number: current?.case_number ?? null,
          wallet_id: current?.wallet_id ?? null,
          wallet_name: current?.wallet_name ?? null,
          allow_additional_responsibles: current?.allow_additional_responsibles ?? false,
          allowed_responsibles: current?.allowed_responsibles ?? [],
          warning: current?.warning ?? null,
          ...patch
        }
      };
    });
  };

  const mergePublicationStatus = (sourceKey: string, status: PublicationHandlingStatus, handledAt: string) => {
    mergePublicationContext(sourceKey, {
      status,
      handled_at: handledAt
    });
  };

  const submitPublicationGeneratedAction = async ({
    taskTitle,
    taskDetails,
    dueDate,
    responsibleEmails,
    includeActorResponsible = true,
    allowOfficeWideResponsibles = false,
    successMessage,
    failureMessage
  }: {
    taskTitle: string;
    taskDetails?: string;
    dueDate: string;
    responsibleEmails: string[];
    includeActorResponsible?: boolean;
    allowOfficeWideResponsibles?: boolean;
    successMessage: string;
    failureMessage: string;
  }) => {
    if (!activePublication || !activePublicationAction) return;
    const sourceKey = buildPublicationSourceKey(activePublication);
    setProcessingPublicationSourceKey(sourceKey);
    setPublicationActionError("");
    setTodayPublicationsError("");
    try {
      const result = await apiHandlePublication({
        source_key: sourceKey,
        publication_title: activePublication.title,
        publication_date: activePublication.publication_date,
        process_number: activePublication.process_number || undefined,
        detail_url: activePublication.detail_url,
        summary: activePublication.summary || undefined,
        action: "task_created",
        task_title: taskTitle,
        task_details: taskDetails,
        due_date: dueDate,
        responsible_emails: responsibleEmails,
        include_actor_responsible: includeActorResponsible,
        allow_office_wide_responsibles: allowOfficeWideResponsibles
      });
      mergePublicationStatus(sourceKey, result.status, result.handled_at);
      setTodayPublicationsInlineMessage(successMessage);
      setActivePublication(null);
      setActivePublicationAction(null);
      await loadPublicationAgenda();
    } catch (err) {
      if (isPublicationApiUnavailableError(err)) {
        try {
          const fallbackContext =
            publicationContextMap[sourceKey] ||
            (await buildPublicationContextFallback([activePublication]))[sourceKey] || {
              source_key: sourceKey,
              has_registered_case: false,
              allow_additional_responsibles: false,
              allowed_responsibles: []
            };

          const responsibleMap = new Map(
            (fallbackContext.allowed_responsibles || []).map((item) => [item.email.trim().toLowerCase(), item.name])
          );
          const selectedEmails = responsibleEmails.map((item) => item.trim().toLowerCase()).filter(Boolean);

          if (!fallbackContext.has_registered_case && selectedEmails.length > 0) {
            throw new Error("Processo não cadastrado. Não é possível adicionar outros responsáveis.");
          }

          const invalidEmail = selectedEmails.find((email) => !responsibleMap.has(email));
          if (invalidEmail) {
            throw new Error("Os responsáveis adicionais precisam ter acesso à carteira do processo.");
          }

          const assigneeLabels = [user?.name || user?.email || "Usuário atual", ...selectedEmails.map((email) => responsibleMap.get(email) || email)];
          await apiCreateAgendaDeadline({
            title: taskTitle,
            due_date: dueDate,
            reference: buildPublicationReference(activePublication.process_number),
            notes: taskDetails,
            event_type: "deadline",
            assignees: assigneeLabels.join("; "),
            is_all_day: true
          });

          const handledAt = new Date().toISOString();
          const nextContext: PublicationContextItem = {
            ...fallbackContext,
            source_key: sourceKey,
            status: "task_created",
            handled_at: handledAt
          };
          persistPublicationFallbackContext(sourceKey, nextContext);
          mergePublicationContext(sourceKey, nextContext);
          setTodayPublicationsInlineMessage(successMessage);
          setActivePublication(null);
          setActivePublicationAction(null);
          await loadPublicationAgenda();
        } catch (fallbackErr) {
          setPublicationActionError(extractApiErrorMessage(fallbackErr, failureMessage));
        }
      } else {
        setPublicationActionError(extractApiErrorMessage(err, failureMessage));
      }
    } finally {
      setProcessingPublicationSourceKey("");
    }
  };

  const handleSubmitPublicationTask = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitPublicationGeneratedAction({
      taskTitle: publicationTaskForm.title.trim(),
      taskDetails: publicationTaskForm.details.trim() || undefined,
      dueDate: publicationTaskForm.dueDate,
      responsibleEmails: publicationTaskForm.responsibleEmails,
      includeActorResponsible: true,
      allowOfficeWideResponsibles: false,
      successMessage: "Tarefa criada com sucesso a partir da publicação.",
      failureMessage: "Não foi possível gerar a tarefa da publicação."
    });
  };

  const handleSubmitPublicationDeadline = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedResponsible = publicationDeadlineForm.responsibleEmail.trim().toLowerCase();
    await submitPublicationGeneratedAction({
      taskTitle: buildPublicationDeadlineTaskTitle(publicationDeadlineForm),
      taskDetails: buildPublicationDeadlineTaskDetails(publicationDeadlineForm),
      dueDate: publicationDeadlineForm.dueDate,
      responsibleEmails: selectedResponsible ? [selectedResponsible] : [],
      includeActorResponsible: false,
      allowOfficeWideResponsibles: true,
      successMessage: "Prazo criado com sucesso a partir da publicação.",
      failureMessage: "Não foi possível gerar o prazo da publicação."
    });
  };

  const handleMarkPublicationAsRead = async (publication: TodayPublicationItem) => {
    const sourceKey = buildPublicationSourceKey(publication);
    setProcessingPublicationSourceKey(sourceKey);
    setTodayPublicationsError("");
    setTodayPublicationsInlineMessage("");
    try {
      const result = await apiHandlePublication({
        source_key: sourceKey,
        publication_title: publication.title,
        publication_date: publication.publication_date,
        process_number: publication.process_number || undefined,
        detail_url: publication.detail_url,
        summary: publication.summary || undefined,
        action: "read_no_action"
      });
      mergePublicationStatus(sourceKey, result.status, result.handled_at);
      setTodayPublicationsInlineMessage(result.message);
    } catch (err) {
      if (isPublicationApiUnavailableError(err)) {
        try {
          const fallbackContext =
            publicationContextMap[sourceKey] ||
            (await buildPublicationContextFallback([publication]))[sourceKey] || {
              source_key: sourceKey,
              has_registered_case: false,
              allow_additional_responsibles: false,
              allowed_responsibles: []
            };
          const handledAt = new Date().toISOString();
          const nextContext: PublicationContextItem = {
            ...fallbackContext,
            source_key: sourceKey,
            status: "read_no_action",
            handled_at: handledAt
          };
          persistPublicationFallbackContext(sourceKey, nextContext);
          mergePublicationContext(sourceKey, nextContext);
          setTodayPublicationsInlineMessage("Publicação marcada como lida sem providências.");
        } catch (fallbackErr) {
          setTodayPublicationsError(extractApiErrorMessage(fallbackErr, "Não foi possível registrar a leitura da publicação."));
        }
      } else {
        setTodayPublicationsError(extractApiErrorMessage(err, "Não foi possível registrar a leitura da publicação."));
      }
    } finally {
      setProcessingPublicationSourceKey("");
    }
  };

  const activePublicationContext = activePublication ? publicationContextMap[buildPublicationSourceKey(activePublication)] || null : null;
  const todayKey = formatIsoDate(new Date());
  const tomorrowKey = formatIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1));
  const fiveDaysKey = formatIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 5));
  const publicationDeadlineItems = useMemo(
    () => publicationAgendaItems.filter((item) => item.kind === "deadline" && isPublicationAgendaEvent(item)),
    [publicationAgendaItems]
  );
  const publicationDeadlinesBySourceKey = useMemo(() => {
    return publicationDeadlineItems.reduce<Record<string, AgendaItem[]>>((acc, item) => {
      const sourceKey = item.publication_source_key?.trim();
      if (!sourceKey) return acc;
      acc[sourceKey] = acc[sourceKey] || [];
      acc[sourceKey].push(item);
      return acc;
    }, {});
  }, [publicationDeadlineItems]);
  const publicationDeadlinesByProcessNumber = useMemo(() => {
    return publicationDeadlineItems.reduce<Record<string, AgendaItem[]>>((acc, item) => {
      const processKey = normalizeCaseDigits(item.publication_process_number || item.reference || "");
      if (!processKey) return acc;
      acc[processKey] = acc[processKey] || [];
      acc[processKey].push(item);
      return acc;
    }, {});
  }, [publicationDeadlineItems]);
  const publicationEntries = useMemo(() => {
    const items = todayPublicationResult?.items || [];
    return items.map((publication) => {
      const sourceKey = buildPublicationSourceKey(publication);
      const deadlineMap = new Map<string, AgendaItem>();

      (publicationDeadlinesBySourceKey[sourceKey] || []).forEach((item) => {
        deadlineMap.set(item.id, item);
      });

      const processKey = normalizeCaseDigits(publication.process_number);
      if (processKey) {
        (publicationDeadlinesByProcessNumber[processKey] || []).forEach((item) => {
          deadlineMap.set(item.id, item);
        });
      }

      return {
        publication,
        sourceKey,
        context: publicationContextMap[sourceKey] || null,
        deadlineItems: Array.from(deadlineMap.values())
      };
    });
  }, [todayPublicationResult, publicationContextMap, publicationDeadlinesByProcessNumber, publicationDeadlinesBySourceKey]);
  const hearingItems = useMemo(() => {
    return publicationAgendaItems.filter((item) => {
      const haystack = normalizeLooseText(`${item.title} ${item.reference || ""} ${item.description || ""}`);
      return item.event_type === "hearing" || (item.kind === "meeting" && haystack.includes("audiencia"));
    });
  }, [publicationAgendaItems]);
  const futureHearingItems = useMemo(() => {
    return [...hearingItems]
      .filter((item) => getAgendaDateKey(item.starts_at) >= todayKey)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [hearingItems, todayKey]);
  const matchesPublicationSummaryFilter = (entry: (typeof publicationEntries)[number], filterKey: PublicationSummaryFilterKey) => {
    const dueDateKeys = entry.deadlineItems.map((item) => getAgendaDateKey(item.starts_at));
    if (filterKey === "pending_analysis") return !entry.context?.status;
    if (filterKey === "open_deadlines") return dueDateKeys.some((dateKey) => dateKey >= todayKey);
    if (filterKey === "due_today") return dueDateKeys.some((dateKey) => dateKey === todayKey);
    if (filterKey === "due_tomorrow") return dueDateKeys.some((dateKey) => dateKey === tomorrowKey);
    if (filterKey === "due_within_five_days") return dueDateKeys.some((dateKey) => dateKey >= todayKey && dateKey <= fiveDaysKey);
    return entry.context?.status === "read_no_action" || dueDateKeys.some((dateKey) => dateKey < todayKey);
  };
  const filteredPublicationEntries = useMemo(() => {
    if (!activePublicationSummaryFilter) return publicationEntries;
    return publicationEntries.filter((entry) => matchesPublicationSummaryFilter(entry, activePublicationSummaryFilter));
  }, [activePublicationSummaryFilter, publicationEntries]);
  const citationSummaryRows: { key: PublicationSummaryFilterKey; label: string; value: number }[] = [
    {
      key: "pending_analysis",
      label: "Pendentes para análise",
      value: publicationEntries.filter((entry) => matchesPublicationSummaryFilter(entry, "pending_analysis")).length
    },
    {
      key: "open_deadlines",
      label: "Prazos em aberto",
      value: publicationEntries.filter((entry) => matchesPublicationSummaryFilter(entry, "open_deadlines")).length
    },
    {
      key: "due_tomorrow",
      label: "Vencendo amanhã",
      value: publicationEntries.filter((entry) => matchesPublicationSummaryFilter(entry, "due_tomorrow")).length
    },
    {
      key: "due_within_five_days",
      label: "Vencendo 5 dias",
      value: publicationEntries.filter((entry) => matchesPublicationSummaryFilter(entry, "due_within_five_days")).length
    },
    {
      key: "expired_deadlines",
      label: "Decursos de prazo",
      value: publicationEntries.filter((entry) => matchesPublicationSummaryFilter(entry, "expired_deadlines")).length
    }
  ];
  const dueTodayCount = publicationEntries.filter((entry) => matchesPublicationSummaryFilter(entry, "due_today")).length;
  const hearingSummaryRows = [
    { label: "Audiências futuras", value: futureHearingItems.length },
    {
      label: "Audiências futuras de conciliação",
      value: futureHearingItems.filter((item) =>
        normalizeLooseText(`${item.title} ${item.reference || ""} ${item.description || ""}`).includes("concil")
      ).length
    }
  ];
  const activePublicationSummaryLabel =
    citationSummaryRows.find((row) => row.key === activePublicationSummaryFilter)?.label ||
    (activePublicationSummaryFilter === "due_today" ? "Vencendo hoje" : "");

  const handlePublicationSummaryFilterClick = (filterKey: PublicationSummaryFilterKey) => {
    setActivePublicationSummaryFilter((current) => (current === filterKey ? null : filterKey));
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        publicationResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  return (
    <div className="content-card page-card publications-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Publicações</div>
          <h1 className="page-title">Central de publicações</h1>
        </div>
        <div className="pill">Publicações</div>
      </div>

      {publicationAgendaError && <div className="error">{publicationAgendaError}</div>}

      <div className="publications-grid publication-summary-grid">
        <div className="publication-card publication-summary-card">
          <div className="publication-summary-head">
            <div className="publication-summary-heading citations">Citações/Intimações</div>
            <button
              type="button"
              className={`publication-summary-inline-alert ${activePublicationSummaryFilter === "due_today" ? "active" : ""}`}
              onClick={() => handlePublicationSummaryFilterClick("due_today")}
            >
              Vencendo hoje: {isLoadingPublicationAgenda ? "..." : dueTodayCount}
            </button>
          </div>
          <div className="publication-summary-table-wrap">
            <table className="publication-summary-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {citationSummaryRows.map((row) => (
                  <tr
                    key={row.key}
                    className={`publication-summary-row clickable ${activePublicationSummaryFilter === row.key ? "active" : ""}`}
                    onClick={() => handlePublicationSummaryFilterClick(row.key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handlePublicationSummaryFilterClick(row.key);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={activePublicationSummaryFilter === row.key}
                  >
                    <td>{row.label}</td>
                    <td>{isLoadingPublicationAgenda ? "..." : row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="publication-card publication-summary-card">
          <div className="publication-summary-heading hearings">Audiências/Fóruns de Conciliações/Perícias</div>
          <div className="publication-summary-table-wrap">
            <table className="publication-summary-table">
              <thead>
                <tr>
                  <th>Situação</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {hearingSummaryRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{isLoadingPublicationAgenda ? "..." : row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div ref={publicationResultsRef} className="publication-card publication-search-card">
        <div className="publication-live-head">
          <div>
            <div className="publication-title">Buscar publicações da minha OAB</div>
            <div className="publication-live-subtitle">
              {hasCurrentPublicationOab
                ? "Selecione uma data no campo abaixo para consultar o DJEN da OAB vinculada ao seu login."
                : "OAB não cadastrada no seu membro da equipe. Cadastre a OAB para consultar o DJEN por esta área."}
            </div>
          </div>
        </div>
        <form className="publication-form publication-search-form" onSubmit={handleLoadTodayPublications}>
          <div className="field">
            <label>Data da consulta</label>
            <input
              type="date"
              value={selectedPublicationDate}
              onChange={(event) => handlePublicationSearchDateChange(event.target.value)}
            />
          </div>
          <div className="publication-search-actions">
            <button className="btn ghost small" type="submit" disabled={isLoadingTodayPublications || !hasCurrentPublicationOab}>
              {isLoadingTodayPublications ? "Consultando..." : "Buscar publicações"}
            </button>
          </div>
        </form>
        {todayPublicationsError && <div className="error">{todayPublicationsError}</div>}
        {todayPublicationsInlineMessage && <div className="agenda-inline">{todayPublicationsInlineMessage}</div>}
        {activePublicationSummaryFilter && (
          <div className="publication-active-filter">
            <span>
              Filtro ativo: <strong>{activePublicationSummaryLabel}</strong>
            </span>
            <button className="btn ghost small" type="button" onClick={() => setActivePublicationSummaryFilter(null)}>
              Limpar filtro
            </button>
          </div>
        )}
        {isLoadingPublicationContext && <div className="publication-meta">Carregando status e responsáveis da publicação...</div>}
        {todayPublicationResult && (
          <div className="publication-live-meta">
            <span>OAB {todayPublicationResult.oab}</span>
            <span>{todayPublicationResult.member_name}</span>
            <span>{formatDatePtBr(todayPublicationResult.publication_date)}</span>
          </div>
        )}
        {!todayPublicationResult ? (
          <div className="publication-empty">
            {activePublicationSummaryFilter
              ? `Selecione uma data e clique em buscar publicações para usar o filtro ${activePublicationSummaryLabel.toLowerCase()}.`
              : "Selecione uma data e clique em buscar publicações para consultar o DJEN."}
          </div>
        ) : todayPublicationResult.items.length === 0 ? (
          <div className="publication-empty">Nenhuma publicação encontrada para a data selecionada.</div>
        ) : filteredPublicationEntries.length === 0 ? (
          <div className="publication-empty">Nenhuma publicação encontrada para o filtro selecionado.</div>
        ) : (
          <div className="publication-list">
            {filteredPublicationEntries.map(({ publication, sourceKey, context }) => {
              const handled = Boolean(context?.status);
              const isBusy = processingPublicationSourceKey === sourceKey;
              return (
                <div
                  key={publication.hash || publication.id}
                  className={`publication-item publication-today-item ${handled ? "handled" : ""} ${
                    context?.status ? `status-${context.status}` : ""
                  }`}
                >
                  <div>
                    <div className="publication-name">{publication.title}</div>
                    <div className="publication-meta">
                      {publication.process_number ? `Processo ${publication.process_number}` : "Processo não identificado"}
                      {publication.tribunal ? ` · ${publication.tribunal}` : ""}
                      {publication.communication_type ? ` · ${publication.communication_type}` : ""}
                    </div>
                    {context?.wallet_name && <div className="publication-meta">Carteira: {context.wallet_name}</div>}
                    {publication.court_name && <div className="publication-meta">{publication.court_name}</div>}
                    {publication.summary && <div className="publication-summary">{publication.summary}</div>}
                    {context?.warning && <div className="publication-warning">{context.warning}</div>}
                  </div>
                  <div className="publication-today-actions">
                    <div className="publication-today-tags">
                      {context?.status && (
                        <span className={`publication-tag publication-status-tag ${context.status}`}>
                          {getPublicationHandlingLabel(context.status)}
                        </span>
                      )}
                    </div>
                    <div className="publication-action-buttons">
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => openPublicationActionModal(publication, "register")}
                        disabled={isBusy || isLoadingPublicationContext || context?.has_registered_case}
                      >
                        {context?.has_registered_case ? "Processo cadastrado" : "Cadastrar cliente/processo"}
                      </button>
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => openPublicationActionModal(publication, "task")}
                        disabled={isBusy || isLoadingPublicationContext || context?.status === "task_created"}
                      >
                        {context?.status === "task_created" ? "Providência registrada" : "Gerar tarefa"}
                      </button>
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => openPublicationActionModal(publication, "deadline")}
                        disabled={isBusy || isLoadingPublicationContext || context?.status === "task_created"}
                      >
                        {context?.status === "task_created" ? "Providência registrada" : "Gerar prazo"}
                      </button>
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => void handleMarkPublicationAsRead(publication)}
                        disabled={
                          isBusy ||
                          isLoadingPublicationContext ||
                          context?.status === "task_created" ||
                          context?.status === "read_no_action"
                        }
                      >
                        {context?.status === "read_no_action" ? "Sem providências" : "Li e não há providências"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PublicationTaskModal
        open={Boolean(activePublication && activePublicationAction === "task")}
        publication={activePublication}
        context={activePublicationContext}
        user={user}
        form={publicationTaskForm}
        busy={Boolean(activePublication && processingPublicationSourceKey === buildPublicationSourceKey(activePublication))}
        errorMessage={publicationActionError}
        onClose={closePublicationActionModal}
        onSubmit={handleSubmitPublicationTask}
        onChangeField={handlePublicationTaskFormField}
        onToggleResponsible={handleTogglePublicationResponsible}
      />
      <PublicationDeadlineModal
        open={Boolean(activePublication && activePublicationAction === "deadline")}
        publication={activePublication}
        user={user}
        form={publicationDeadlineForm}
        officeResponsibleOptions={publicationOfficeResponsibleOptions}
        busy={Boolean(activePublication && processingPublicationSourceKey === buildPublicationSourceKey(activePublication))}
        errorMessage={publicationActionError}
        onClose={closePublicationActionModal}
        onSubmit={handleSubmitPublicationDeadline}
        onChangeField={handlePublicationDeadlineFormField}
      />
      <AddClientModal
        open={Boolean(activePublication && activePublicationAction === "register" && !publicationRegistrationClient)}
        form={publicationRegistrationClientForm}
        saving={isSavingPublicationRegistrationClient}
        title="Cadastrar cliente da publicação"
        saveLabel="Salvar cliente e continuar"
        errorMessage={publicationRegistrationClientError}
        onClose={closePublicationActionModal}
        onChange={handlePublicationRegistrationClientFormField}
        onSave={handleSavePublicationRegistrationClient}
        onLookupCep={handleLookupPublicationRegistrationCep}
        cepError={publicationRegistrationCepError}
      />
      <AddProcessModal
        open={Boolean(activePublication && activePublicationAction === "register" && publicationRegistrationClient)}
        clientName={publicationRegistrationClient?.name || publicationRegistrationClientForm.name}
        form={publicationRegistrationCaseForm}
        wallets={publicationWallets}
        saving={isSavingPublicationRegistrationCase}
        errorMessage={publicationRegistrationCaseError}
        onChange={handlePublicationRegistrationCaseFormField}
        onClose={closePublicationActionModal}
        onSave={handleSavePublicationRegistrationCase}
      />
    </div>
  );
}

const agendaProviders: { provider: CalendarProvider; label: string; description: string }[] = [
  {
    provider: "google",
    label: "Google",
    description: "Importa reuniões criadas no Google Calendar / Google Meet."
  },
  {
    provider: "microsoft",
    label: "Microsoft",
    description: "Importa reuniões criadas no Outlook / Teams."
  }
];

const internalAgendaTypeOptions: { value: InternalAgendaEventType; label: string; kind: AgendaItem["kind"] }[] = [
  { value: "deadline", label: "Prazo", kind: "deadline" },
  { value: "meeting", label: "Reunião", kind: "meeting" },
  { value: "hearing", label: "Audiência", kind: "meeting" },
  { value: "audit", label: "Auditoria", kind: "meeting" }
];

const getInternalAgendaTypeOption = (value?: InternalAgendaEventType | string | null) =>
  internalAgendaTypeOptions.find((item) => item.value === value) || internalAgendaTypeOptions[0];

const agendaSourceLabel = (source: string) => {
  if (source === "internal") return "Interno";
  if (source === "google") return "Google";
  if (source === "microsoft") return "Microsoft";
  return source;
};

const agendaEventTagLabel = (item: AgendaItem) => {
  if (item.source === "internal") {
    return getInternalAgendaTypeOption(item.event_type).label;
  }
  return item.kind === "deadline" ? "Prazo" : "Reunião";
};

const agendaEventAssigneesLabel = (item: AgendaItem) => item.assignees || item.assignee_name || "";

const isAgendaItemCompleted = (item: AgendaItem) => (item.status || "").trim().toLowerCase() === "concluido";

const isAgendaDeadlineItem = (item: AgendaItem) => item.kind === "deadline" || item.event_type === "deadline";

const isAgendaHearingItem = (item: AgendaItem) => {
  if (item.event_type === "hearing") return true;
  const haystack = normalizeSearchText([item.title, item.description, item.reference, item.location].filter(Boolean).join(" "));
  return haystack.includes("audiencia") || haystack.includes("concilia");
};

const isAgendaTaskOrMeetingItem = (item: AgendaItem) => {
  if (isAgendaDeadlineItem(item) || isAgendaHearingItem(item)) return false;
  return item.kind === "meeting" || item.event_type === "meeting" || item.event_type === "audit";
};

const formatAgendaTime = (startValue: string, endValue: string, isAllDay: boolean) => {
  if (isAllDay) return "Dia inteiro";
  const startDate = new Date(startValue);
  const endDate = new Date(endValue);
  const startLabel = startDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const endLabel = endDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (!endValue || Number.isNaN(endDate.getTime()) || startLabel === endLabel) {
    return startLabel;
  }
  return `${startLabel} - ${endLabel}`;
};

const formatAgendaHeaderDate = (value: string) => {
  const date = parseLocalDate(value);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    weekday: "long"
  });
};

const getAgendaAssigneeSearchTerm = (value: string) => {
  const parts = value.split(";");
  return parts[parts.length - 1]?.trim() || "";
};

const injectAgendaAssigneeEmail = (value: string, email: string) => {
  const cleanEmail = email.trim();
  if (!cleanEmail) return value;
  const completed = value
    .split(";")
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);
  return completed.length ? `${completed.join("; ")}; ${cleanEmail}; ` : `${cleanEmail}; `;
};

function Agenda() {
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => formatIsoDate(new Date()));
  const [events, setEvents] = useState<AgendaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [inlineMessage, setInlineMessage] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "internal" | CalendarProvider>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "deadline" | "meeting">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "completed">("all");
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [updatingDeadlineId, setUpdatingDeadlineId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<ApiTeamMember[]>([]);
  const [isLoadingTeamMembers, setIsLoadingTeamMembers] = useState(false);
  const [isAssigneePickerOpen, setIsAssigneePickerOpen] = useState(false);
  const [deadlineForm, setDeadlineForm] = useState({
    title: "",
    dueDate: formatIsoDate(new Date()),
    startTime: "",
    endTime: "",
    eventType: "deadline" as InternalAgendaEventType,
    assignees: "",
    meetingUrl: "",
    reference: "",
    notes: ""
  });
  const assigneesInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inlineMessage) return;
    const timeout = window.setTimeout(() => setInlineMessage(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [inlineMessage]);

  useEffect(() => {
    let cancelled = false;
    const loadTeamMembers = async () => {
      setIsLoadingTeamMembers(true);
      try {
        const data = await apiListTeamMembers();
        if (cancelled) return;
        setTeamMembers(
          data
            .filter((member) => member.is_active && member.email.trim())
            .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"))
        );
      } catch {
        if (cancelled) return;
        setTeamMembers([]);
      } finally {
        if (!cancelled) {
          setIsLoadingTeamMembers(false);
        }
      }
    };
    void loadTeamMembers();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAgendaData = async (
    targetMonth: Date,
    options: { refreshExternal?: boolean; silent?: boolean } = {}
  ) => {
    const { refreshExternal = false, silent = false } = options;
    const rangeStart = `${formatIsoDate(new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1))}T00:00:00`;
    const rangeEnd = `${formatIsoDate(new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0))}T23:59:59`;
    if (!silent) {
      setIsLoading(true);
    }
    setError("");
    try {
      const agendaData = await apiListAgendaEvents({ start: rangeStart, end: rangeEnd, refresh_external: refreshExternal || undefined });
      setEvents(agendaData);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Não foi possível carregar a agenda."));
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadAgendaData(month);
  }, [month]);

  useEffect(() => {
    const refreshSilently = () => {
      void loadAgendaData(month, { silent: true, refreshExternal: true });
    };
    const intervalId = window.setInterval(refreshSilently, 15000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSilently();
      }
    };
    const handleWindowFocus = () => refreshSilently();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [month]);

  const monthLabel = month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const todayKey = formatIsoDate(new Date());

  const filteredEvents = useMemo(() => {
    return events.filter((item) => {
      if (typeFilter !== "all" && item.kind !== typeFilter) return false;
      if (statusFilter === "open" && isAgendaItemCompleted(item)) return false;
      if (statusFilter === "completed" && !isAgendaItemCompleted(item)) return false;
      if (sourceFilter === "all") return true;
      if (sourceFilter === "internal") return item.source === "internal";
      return item.source === sourceFilter;
    });
  }, [events, sourceFilter, statusFilter, typeFilter]);

  const dayMarkersByDate = useMemo(() => {
    const markers: Record<string, { deadline: boolean; task: boolean; hearing: boolean }> = {};
    filteredEvents.forEach((event) => {
      const start = new Date(event.starts_at);
      const end = new Date(event.ends_at);
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cursor <= endDay) {
        const key = formatIsoDate(cursor);
        if (!markers[key]) {
          markers[key] = { deadline: false, task: false, hearing: false };
        }
        if (isAgendaDeadlineItem(event)) markers[key].deadline = true;
        if (isAgendaTaskOrMeetingItem(event)) markers[key].task = true;
        if (isAgendaHearingItem(event)) markers[key].hearing = true;
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return markers;
  }, [filteredEvents]);

  const selectedDayEvents = useMemo(() => {
    const start = parseLocalDate(selectedDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return filteredEvents
      .filter((item) => {
        const startsAt = new Date(item.starts_at);
        const endsAt = new Date(item.ends_at);
        return startsAt < end && endsAt >= start;
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [filteredEvents, selectedDate]);

  const upcomingEvents = useMemo(() => {
    const selectedStart = parseLocalDate(selectedDate);
    return filteredEvents
      .filter((item) => new Date(item.starts_at).getTime() >= selectedStart.getTime())
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, 8);
  }, [filteredEvents, selectedDate]);

  const assigneeSearchTerm = useMemo(() => getAgendaAssigneeSearchTerm(deadlineForm.assignees), [deadlineForm.assignees]);

  const assigneeSuggestions = useMemo(() => {
    const query = normalizeSearchText(assigneeSearchTerm);
    if (!query) return [];
    const selectedEmails = new Set(
      deadlineForm.assignees
        .split(";")
        .slice(0, -1)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
    );
    return teamMembers
      .filter((member) => {
        const normalizedName = normalizeSearchText(member.full_name);
        const normalizedEmail = normalizeSearchText(member.email);
        if (selectedEmails.has(member.email.trim().toLowerCase())) return false;
        return normalizedName.includes(query) || normalizedEmail.includes(query);
      })
      .slice(0, 6);
  }, [assigneeSearchTerm, deadlineForm.assignees, teamMembers]);

  const handleSelectAssigneeSuggestion = (member: ApiTeamMember) => {
    setDeadlineForm((prev) => ({ ...prev, assignees: injectAgendaAssigneeEmail(prev.assignees, member.email) }));
    setIsAssigneePickerOpen(false);
    window.setTimeout(() => assigneesInputRef.current?.focus(), 0);
  };

  const handleCreateDeadline = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deadlineForm.title.trim() || !deadlineForm.dueDate) return;
    if (deadlineForm.endTime && !deadlineForm.startTime) {
      setError("Preencha o horário de início antes do horário final.");
      return;
    }
    if (deadlineForm.startTime && deadlineForm.endTime && deadlineForm.endTime <= deadlineForm.startTime) {
      setError("O horário final deve ser maior que o horário de início.");
      return;
    }
    setSavingDeadline(true);
    setError("");
    try {
      const dueDateValue = deadlineForm.startTime ? `${deadlineForm.dueDate}T${deadlineForm.startTime}:00` : deadlineForm.dueDate;
      await apiCreateAgendaDeadline({
        title: deadlineForm.title.trim(),
        due_date: dueDateValue,
        reference: deadlineForm.reference.trim() || undefined,
        notes: deadlineForm.notes.trim() || undefined,
        event_type: deadlineForm.eventType,
        meeting_url: deadlineForm.meetingUrl.trim() || undefined,
        assignees: deadlineForm.assignees.trim() || undefined,
        end_time: deadlineForm.endTime || undefined,
        is_all_day: !deadlineForm.startTime && !deadlineForm.endTime
      });
      const dueDate = parseLocalDate(deadlineForm.dueDate);
      const dueMonth = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
      setMonth(dueMonth);
      setSelectedDate(deadlineForm.dueDate);
      setDeadlineForm((prev) => ({
        ...prev,
        title: "",
        startTime: "",
        endTime: "",
        eventType: "deadline",
        assignees: "",
        meetingUrl: "",
        reference: "",
        notes: ""
      }));
      setIsAssigneePickerOpen(false);
      setInlineMessage("Compromisso interno cadastrado com sucesso.");
      await loadAgendaData(dueMonth);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Não foi possível salvar o compromisso interno."));
    } finally {
      setSavingDeadline(false);
    }
  };

  const handleDeleteDeadline = async (eventItem: AgendaItem) => {
    if (eventItem.source !== "internal") return;
    try {
      await apiDeleteAgendaDeadline(eventItem.entity_id);
      setInlineMessage("Compromisso interno removido.");
      await loadAgendaData(month);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Não foi possível remover o compromisso interno."));
    }
  };

  const handleToggleDeadlineCompleted = async (eventItem: AgendaItem) => {
    if (eventItem.source !== "internal") return;
    const nextCompleted = !isAgendaItemCompleted(eventItem);
    setUpdatingDeadlineId(eventItem.entity_id);
    setError("");
    setEvents((prev) =>
      prev.map((item) =>
        item.id === eventItem.id ? { ...item, status: nextCompleted ? "concluido" : "pendente" } : item
      )
    );
    try {
      const updated = await apiUpdateAgendaDeadline(eventItem.entity_id, { is_completed: nextCompleted });
      setEvents((prev) => prev.map((item) => (item.id === eventItem.id ? updated : item)));
      setInlineMessage(nextCompleted ? "Compromisso marcado como concluído." : "Compromisso reaberto.");
    } catch (err) {
      setEvents((prev) => prev.map((item) => (item.id === eventItem.id ? eventItem : item)));
      setError(extractApiErrorMessage(err, "Não foi possível atualizar o compromisso interno."));
    } finally {
      setUpdatingDeadlineId(null);
    }
  };

  const handleChangeMonth = (offset: number) => {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(nextMonth);
    setSelectedDate(formatIsoDate(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1)));
  };

  return (
    <div className="content-card page-card agenda-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Agenda</div>
          <h1 className="page-title">Compromissos e Prazos</h1>
          <div className="page-subtitle">Reuniões e prazos em uma única agenda. Gerencie conexões em Configurações.</div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {inlineMessage && <div className="agenda-inline">{inlineMessage}</div>}

      <div className="agenda-grid">
        <div className="agenda-left">
          <div className="calendar-card agenda-calendar-card">
            <div className="calendar-head">
              <div className="calendar-title">{monthTitle}</div>
              <div className="calendar-actions">
                <button type="button" className="btn ghost small" onClick={() => handleChangeMonth(-1)}>
                  Anterior
                </button>
                <button type="button" className="btn ghost small" onClick={() => handleChangeMonth(1)}>
                  Próximo
                </button>
              </div>
            </div>
            <div className="calendar-week">
              {weekDays.map((label) => (
                <div key={label} className="calendar-weekday">
                  {label}
                </div>
              ))}
            </div>
            <div className="calendar-grid">
              {Array.from({ length: totalCells }).map((_, index) => {
                const dayNumber = index - startOffset + 1;
                if (dayNumber < 1 || dayNumber > daysInMonth) {
                  return <div key={`empty-${index}`} className="calendar-cell empty" />;
                }
                const dateKey = formatIsoDate(new Date(year, monthIndex, dayNumber));
                const isSelected = dateKey === selectedDate;
                const dayMarkers = dayMarkersByDate[dateKey];
                const markerKinds = [
                  dayMarkers?.deadline ? "deadline" : null,
                  dayMarkers?.task ? "task" : null,
                  dayMarkers?.hearing ? "hearing" : null
                ].filter(Boolean) as Array<"deadline" | "task" | "hearing">;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    className={`calendar-cell agenda-day-btn ${markerKinds.length > 0 ? "has-events" : ""} ${dateKey === todayKey ? "today" : ""} ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedDate(dateKey);
                      setDeadlineForm((prev) => ({ ...prev, dueDate: dateKey }));
                    }}
                  >
                    <div className="calendar-day">{dayNumber}</div>
                    {markerKinds.length > 0 && (
                      <div className="calendar-markers" aria-hidden="true">
                        {markerKinds.map((marker) => (
                          <span key={marker} className={`calendar-marker ${marker}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="publication-card agenda-deadline-card">
            <div className="publication-title">Novo compromisso interno</div>
            <form className="publication-form agenda-deadline-form" onSubmit={handleCreateDeadline}>
              <div className="field">
                <label>Título *</label>
                <input
                  value={deadlineForm.title}
                  onChange={(event) => setDeadlineForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Ex: Reunião com cliente AP-002"
                />
              </div>
              <div className="field">
                <label>Data *</label>
                <input
                  type="date"
                  value={deadlineForm.dueDate}
                  onChange={(event) => setDeadlineForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Tipo</label>
                <select
                  value={deadlineForm.eventType}
                  onChange={(event) =>
                    setDeadlineForm((prev) => ({ ...prev, eventType: event.target.value as InternalAgendaEventType }))
                  }
                >
                  {internalAgendaTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Horário</label>
                <div className="agenda-time-range">
                  <div className="agenda-time-slot">
                    <span className="agenda-time-label">Início</span>
                    <input
                      type="time"
                      aria-label="Horário de início"
                      value={deadlineForm.startTime}
                      onChange={(event) => setDeadlineForm((prev) => ({ ...prev, startTime: event.target.value }))}
                    />
                  </div>
                  <div className="agenda-time-slot">
                    <span className="agenda-time-label">Fim</span>
                    <input
                      type="time"
                      aria-label="Horário de fim"
                      value={deadlineForm.endTime}
                      onChange={(event) => setDeadlineForm((prev) => ({ ...prev, endTime: event.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="field span-2">
                <label>Responsáveis</label>
                <div className="agenda-assignees-field">
                  <input
                    ref={assigneesInputRef}
                    value={deadlineForm.assignees}
                    onChange={(event) => {
                      setDeadlineForm((prev) => ({ ...prev, assignees: event.target.value }));
                      setIsAssigneePickerOpen(true);
                    }}
                    onFocus={() => setIsAssigneePickerOpen(true)}
                    onBlur={() => window.setTimeout(() => setIsAssigneePickerOpen(false), 120)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && isAssigneePickerOpen && assigneeSuggestions.length > 0) {
                        event.preventDefault();
                        handleSelectAssigneeSuggestion(assigneeSuggestions[0]);
                      }
                      if (event.key === "Escape") {
                        setIsAssigneePickerOpen(false);
                      }
                    }}
                    placeholder="Digite nome ou e-mail; clique para completar"
                  />
                  {isAssigneePickerOpen && (assigneeSearchTerm || isLoadingTeamMembers) && (
                    <div className="agenda-assignee-picker">
                      {isLoadingTeamMembers ? (
                        <div className="agenda-assignee-empty">Carregando equipe...</div>
                      ) : assigneeSuggestions.length === 0 ? (
                        <div className="agenda-assignee-empty">Nenhum membro encontrado.</div>
                      ) : (
                        assigneeSuggestions.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            className="agenda-assignee-option"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelectAssigneeSuggestion(member)}
                          >
                            <div className="agenda-assignee-name">{member.full_name}</div>
                            <div className="agenda-assignee-email">{member.email}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="field">
                <label>Link da reunião</label>
                <input
                  value={deadlineForm.meetingUrl}
                  onChange={(event) => setDeadlineForm((prev) => ({ ...prev, meetingUrl: event.target.value }))}
                  placeholder="https://meet.google.com/..."
                />
              </div>
              <div className="field">
                <label>Referência</label>
                <input
                  value={deadlineForm.reference}
                  onChange={(event) => setDeadlineForm((prev) => ({ ...prev, reference: event.target.value }))}
                  placeholder="Processo/cliente"
                />
              </div>
              <div className="field span-2">
                <label>Observações</label>
                <textarea
                  value={deadlineForm.notes}
                  onChange={(event) => setDeadlineForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Detalhes do compromisso"
                />
              </div>
              <div className="publication-actions agenda-deadline-actions">
                <button className="btn" type="submit" disabled={!deadlineForm.title.trim() || !deadlineForm.dueDate || savingDeadline}>
                  {savingDeadline ? "Salvando..." : "Salvar compromisso"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="agenda-right">
          <div className="publication-card agenda-events-card">
            <div className="agenda-events-head">
              <div>
                <div className="publication-title">Compromissos do dia</div>
                <div className="publication-meta">{formatAgendaHeaderDate(selectedDate)}</div>
              </div>
              <div className="agenda-filters">
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "all" | "internal" | CalendarProvider)}>
                  <option value="all">Todas origens</option>
                  <option value="internal">Somente internos</option>
                  <option value="google">Google</option>
                  <option value="microsoft">Microsoft</option>
                </select>
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | "deadline" | "meeting")}>
                  <option value="all">Todos tipos</option>
                  <option value="deadline">Prazos</option>
                  <option value="meeting">Reuniões e compromissos</option>
                </select>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "open" | "completed")}>
                  <option value="all">Todos status</option>
                  <option value="open">Em aberto</option>
                  <option value="completed">Concluídos</option>
                </select>
              </div>
            </div>

            {isLoading ? (
              <div className="publication-empty">Carregando agenda...</div>
            ) : selectedDayEvents.length === 0 ? (
              <div className="publication-empty">Nenhum compromisso para o dia selecionado.</div>
            ) : (
              <div className="publication-list agenda-event-list">
                {selectedDayEvents.map((item) => {
                  const completed = isAgendaItemCompleted(item);
                  const isUpdating = updatingDeadlineId === item.entity_id;
                  return (
                    <div key={item.id} className={`publication-item agenda-event-item ${item.kind} ${completed ? "completed" : ""}`}>
                      <div>
                        <div className="publication-name">{item.title}</div>
                        <div className="publication-meta">
                          {formatAgendaTime(item.starts_at, item.ends_at, item.is_all_day)} · {agendaSourceLabel(item.source)}
                          {item.reference ? ` · ${item.reference}` : ""}
                        </div>
                        {agendaEventAssigneesLabel(item) && <div className="publication-meta">Responsáveis: {agendaEventAssigneesLabel(item)}</div>}
                        {item.description && <div className="agenda-event-description">{item.description}</div>}
                        {item.location && <div className="publication-meta">Local: {item.location}</div>}
                        {item.meeting_url && (
                          <a className="agenda-meeting-link" href={item.meeting_url} target="_blank" rel="noreferrer">
                            Entrar na reunião
                          </a>
                        )}
                      </div>
                      <div className="agenda-event-side">
                        <span className={`publication-tag agenda-tag ${item.kind}`}>{agendaEventTagLabel(item)}</span>
                        {completed && <span className="agenda-status completed">Concluído</span>}
                        {item.source === "internal" && (
                          <div className="agenda-event-actions">
                            <button
                              type="button"
                              className={`link-btn ${completed ? "" : "success"}`}
                              onClick={() => handleToggleDeadlineCompleted(item)}
                              disabled={isUpdating}
                            >
                              {isUpdating ? "Salvando..." : completed ? "Reabrir" : "Concluir"}
                            </button>
                            <button type="button" className="link-btn danger" onClick={() => handleDeleteDeadline(item)}>
                              Remover
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="publication-card agenda-upcoming-card">
            <div className="publication-title">Próximos compromissos</div>
            {upcomingEvents.length === 0 ? (
              <div className="publication-empty">Sem itens futuros para os filtros escolhidos.</div>
            ) : (
              <div className="publication-list">
                {upcomingEvents.map((item) => (
                  <div key={`upcoming-${item.id}`} className={`publication-item agenda-upcoming-item ${isAgendaItemCompleted(item) ? "completed" : ""}`}>
                    <div>
                      <div className="publication-name">{item.title}</div>
                      <div className="publication-meta">
                      {new Date(item.starts_at).toLocaleDateString("pt-BR")} · {formatAgendaTime(item.starts_at, item.ends_at, item.is_all_day)} ·{" "}
                        {agendaSourceLabel(item.source)}
                      </div>
                      {agendaEventAssigneesLabel(item) && <div className="publication-meta">Responsáveis: {agendaEventAssigneesLabel(item)}</div>}
                    </div>
                    <div className="agenda-event-side">
                      <span className={`publication-tag agenda-tag ${item.kind}`}>{agendaEventTagLabel(item)}</span>
                      {isAgendaItemCompleted(item) && <span className="agenda-status completed">Concluído</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type CaseRow = {
  id: number;
  title: string;
  client: string;
  clientId?: number;
  walletId?: number;
  walletName?: string;
  counterparty: string;
  folder: string;
  action: string;
  area: string;
  number: string;
  forum: string;
  lawyer: string;
  rawStatus: string;
  status: "Ativo" | "Em andamento" | "Arquivado";
  value?: number;
  createdAt?: string;
  updatedAt?: string;
  closing?: ApiCaseClosing | null;
};

const normalizeCaseStatus = (status?: string | null): CaseRow["status"] => {
  const value = (status || "").toLowerCase();
  if (value.includes("arquiv")) return "Arquivado";
  if (value.includes("andamento")) return "Em andamento";
  return "Ativo";
};

const splitCaseTitle = (title: string): { activeParty: string; passiveParty: string } => {
  const parts = title.split(/\s+x\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { activeParty: parts[0], passiveParty: parts.slice(1).join(" x ") };
  }
  return { activeParty: title.trim() || "-", passiveParty: "-" };
};

const toCaseRow = (entry: ApiCase, clientsById: Map<number, string>): CaseRow => {
  const parties = splitCaseTitle(entry.title || "");
  const clientFromRef = entry.client_id ? clientsById.get(entry.client_id) : undefined;
  const client = clientFromRef || parties.activeParty || "Cliente";
  return {
    id: entry.id,
    title: entry.title || `${client} x ${parties.passiveParty}`,
    client,
    clientId: entry.client_id || undefined,
    walletId: entry.wallet_id || undefined,
    walletName: entry.wallet_name || undefined,
    counterparty: parties.passiveParty || "-",
    folder: "GERAL",
    action: entry.court?.trim() ? formatCourtOrRegion(entry.court.trim()) : "Ação judicial",
    area: entry.court?.trim().toUpperCase() || "GERAL",
    number: entry.number,
    forum: entry.forum?.trim() ? formatCourtOrRegion(entry.forum.trim()) : "-",
    lawyer: "-",
    rawStatus: entry.status || "aberto",
    status: normalizeCaseStatus(entry.status),
    value: entry.value ?? undefined,
    createdAt: entry.created_at || undefined,
    updatedAt: entry.updated_at || undefined,
    closing: entry.closing || null
  };
};

type CaseClosingStep = "type" | "result" | "obligations" | "dates" | "financial";
type CaseClosingTone = "positive" | "warning" | "negative" | "neutral";
type CaseClosingDraftObligation = ApiCaseClosingObligation & {
  selected: boolean;
};
type CaseClosingDraft = {
  closureType: string;
  result: string;
  obligations: CaseClosingDraftObligation[];
  dates: {
    triggerDate: string;
    completionDate: string;
    archivedAt: string;
  };
  financial: {
    claimAmount: string;
    closingAmount: string;
    paymentMethod: string;
    paymentStatus: string;
  };
};

const caseClosingSteps: Array<{ id: CaseClosingStep; label: string; hint: string }> = [
  { id: "type", label: "Tipo", hint: "Como o processo foi encerrado" },
  { id: "result", label: "Resultado", hint: "Desfecho principal" },
  { id: "obligations", label: "Obrigações", hint: "Pendências pós-encerramento" },
  { id: "dates", label: "Datas", hint: "Marcos relevantes" },
  { id: "financial", label: "Financeiro", hint: "Valores e pagamento" }
];

const caseClosingTypeOptions = [
  {
    id: "sentenca-transito-julgado",
    label: "Sentença com trânsito em julgado",
    description: "Decisão final e definitiva, sem recursos pendentes.",
    icon: "⚖️"
  },
  {
    id: "acordo-homologado",
    label: "Acordo homologado",
    description: "Acordo firmado e validado judicialmente.",
    icon: "🤝"
  },
  {
    id: "acordo-extrajudicial",
    label: "Acordo extrajudicial",
    description: "Composição firmada fora do juízo, com baixa posterior.",
    icon: "📝"
  },
  {
    id: "arquivamento",
    label: "Arquivamento",
    description: "Baixa formal do processo sem outras providências centrais.",
    icon: "🗂️"
  },
  {
    id: "extincao-sem-merito",
    label: "Extinção sem resolução do mérito",
    description: "Encerramento sem análise do mérito da demanda.",
    icon: "🚫"
  },
  {
    id: "desistencia",
    label: "Desistência",
    description: "Parte autora desistiu da ação ou do prosseguimento.",
    icon: "↩️"
  },
  {
    id: "prescricao-decadencia",
    label: "Prescrição / decadência",
    description: "Reconhecimento de perda do direito de ação ou pretensão.",
    icon: "⏳"
  }
] as const;

const caseClosingResultOptions: Array<{
  id: string;
  label: string;
  description: string;
  tone: CaseClosingTone;
  badge: string;
  icon: string;
}> = [
  {
    id: "procedente",
    label: "Procedente",
    description: "Resultado favorável integral ao cliente.",
    tone: "positive",
    badge: "Favorável",
    icon: "✅"
  },
  {
    id: "parcialmente-procedente",
    label: "Parcialmente procedente",
    description: "Ganho parcial ou acolhimento limitado dos pedidos.",
    tone: "warning",
    badge: "Parcial",
    icon: "⚖️"
  },
  {
    id: "improcedente",
    label: "Improcedente",
    description: "Pedidos rejeitados ou resultado desfavorável.",
    tone: "negative",
    badge: "Desfavorável",
    icon: "❌"
  },
  {
    id: "acordo-favoravel",
    label: "Acordo favorável",
    description: "Ajuste vantajoso para o cliente.",
    tone: "positive",
    badge: "Favorável",
    icon: "🤝"
  },
  {
    id: "acordo-desfavoravel",
    label: "Acordo desfavorável",
    description: "Ajuste necessário, com custo ou concessão relevante.",
    tone: "negative",
    badge: "Desfavorável",
    icon: "📉"
  },
  {
    id: "encerrado-sem-efeito-financeiro",
    label: "Encerrado sem efeito financeiro",
    description: "Fechamento operacional, sem condenação ou pagamento.",
    tone: "neutral",
    badge: "Operacional",
    icon: "📌"
  }
];

const caseClosingObligationCatalog = [
  {
    id: "pagamento",
    title: "Pagamento",
    description: "Executar ou acompanhar o pagamento previsto na decisão ou acordo."
  },
  {
    id: "baixa-cadastro",
    title: "Baixa em cadastro",
    description: "Registrar o encerramento em sistemas internos e controles externos."
  },
  {
    id: "obrigacao-fazer",
    title: "Cumprimento de obrigação de fazer",
    description: "Monitorar entrega, baixa, exclusão, regularização ou outra obrigação não financeira."
  },
  {
    id: "expedicao-alvara",
    title: "Expedição de alvará",
    description: "Solicitar e acompanhar expedição/liberação judicial de valores."
  },
  {
    id: "quitacao-final",
    title: "Quitação final",
    description: "Conferir e registrar que não restam pendências após o encerramento."
  }
] as const;

const caseClosingPaymentMethodOptions = [
  { id: "a-vista", label: "À vista", icon: "💵" },
  { id: "parcelado", label: "Parcelado", icon: "📆" },
  { id: "deposito", label: "Depósito", icon: "🏦" },
  { id: "sem-pagamento", label: "Sem pagamento", icon: "➖" }
] as const;

const caseClosingPaymentStatusOptions = [
  { id: "pago", label: "Pago", icon: "✅", tone: "positive" as CaseClosingTone },
  { id: "pendente", label: "Pendente", icon: "⏳", tone: "warning" as CaseClosingTone },
  { id: "parcelado", label: "Parcelado", icon: "📆", tone: "neutral" as CaseClosingTone }
] as const;

const caseClosingDateTemplates: Record<
  string,
  {
    triggerLabel: string;
    triggerHint: string;
    completionLabel: string;
    completionHint: string;
    archivedLabel: string;
    archivedHint: string;
  }
> = {
  "sentenca-transito-julgado": {
    triggerLabel: "Data da sentença",
    triggerHint: "Quando a decisão principal foi proferida.",
    completionLabel: "Data do trânsito em julgado",
    completionHint: "Quando não restaram recursos pendentes.",
    archivedLabel: "Data do arquivamento",
    archivedHint: "Quando o processo foi efetivamente baixado."
  },
  "acordo-homologado": {
    triggerLabel: "Data do acordo",
    triggerHint: "Quando as partes fecharam o acordo.",
    completionLabel: "Data da homologação",
    completionHint: "Quando o juízo homologou o ajuste.",
    archivedLabel: "Data do arquivamento",
    archivedHint: "Quando o processo foi encerrado no sistema."
  },
  "acordo-extrajudicial": {
    triggerLabel: "Data da assinatura",
    triggerHint: "Quando o acordo foi formalizado entre as partes.",
    completionLabel: "Data da quitação",
    completionHint: "Quando a obrigação principal foi cumprida.",
    archivedLabel: "Data da baixa",
    archivedHint: "Quando o caso foi encerrado internamente."
  },
  arquivamento: {
    triggerLabel: "Data do despacho final",
    triggerHint: "Último ato relevante antes da baixa.",
    completionLabel: "Data da baixa interna",
    completionHint: "Quando o caso foi considerado encerrado pela equipe.",
    archivedLabel: "Data do arquivamento",
    archivedHint: "Quando houve o arquivamento formal."
  },
  "extincao-sem-merito": {
    triggerLabel: "Data da extinção",
    triggerHint: "Quando a extinção sem mérito foi decidida.",
    completionLabel: "Fim do prazo recursal",
    completionHint: "Quando a decisão se estabilizou.",
    archivedLabel: "Data do arquivamento",
    archivedHint: "Quando o processo foi baixado."
  },
  desistencia: {
    triggerLabel: "Data da desistência",
    triggerHint: "Quando a parte formalizou o pedido de desistência.",
    completionLabel: "Data da homologação",
    completionHint: "Quando o juízo confirmou a desistência.",
    archivedLabel: "Data do arquivamento",
    archivedHint: "Quando o encerramento foi concluído."
  },
  "prescricao-decadencia": {
    triggerLabel: "Data do reconhecimento",
    triggerHint: "Quando a prescrição/decadência foi reconhecida.",
    completionLabel: "Data da estabilização",
    completionHint: "Quando não restaram medidas cabíveis.",
    archivedLabel: "Data do arquivamento",
    archivedHint: "Quando o processo foi baixado definitivamente."
  }
};

const defaultCaseClosingDateTemplate = {
  triggerLabel: "Data inicial",
  triggerHint: "Marco que deu origem ao encerramento.",
  completionLabel: "Data de conclusão",
  completionHint: "Marco principal que consolidou o encerramento.",
  archivedLabel: "Data do arquivamento",
  archivedHint: "Momento da baixa formal ou interna."
};

const getCaseClosingTypeLabel = (value?: string | null) =>
  caseClosingTypeOptions.find((option) => option.id === value)?.label || "Não definido";

const getCaseClosingResultLabel = (value?: string | null) =>
  caseClosingResultOptions.find((option) => option.id === value)?.label || "Não definido";

const getCaseClosingDateTemplate = (closureType?: string | null) =>
  (closureType && caseClosingDateTemplates[closureType]) || defaultCaseClosingDateTemplate;

const buildCaseClosingDraft = (closing?: ApiCaseClosing | null, fallbackClaimAmount?: number): CaseClosingDraft => {
  const savedObligations = new Map((closing?.obligations || []).map((item) => [item.id, item]));
  return {
    closureType: closing?.closure_type || "",
    result: closing?.result || "",
    obligations: caseClosingObligationCatalog.map((item) => {
      const saved = savedObligations.get(item.id);
      return {
        id: item.id,
        title: saved?.title || item.title,
        description: saved?.description || item.description,
        responsible: saved?.responsible || "",
        due_date: saved?.due_date || "",
        selected: Boolean(saved)
      };
    }),
    dates: {
      triggerDate: closing?.dates?.trigger_date || "",
      completionDate: closing?.dates?.completion_date || "",
      archivedAt: closing?.dates?.archived_at || ""
    },
    financial: {
      claimAmount:
        typeof closing?.financial?.claim_amount === "number" && Number.isFinite(closing.financial.claim_amount)
          ? formatCurrencyBRL(closing.financial.claim_amount)
          : typeof fallbackClaimAmount === "number" && Number.isFinite(fallbackClaimAmount) && fallbackClaimAmount > 0
            ? formatCurrencyBRL(fallbackClaimAmount)
            : "",
      closingAmount:
        typeof closing?.financial?.closing_amount === "number" && Number.isFinite(closing.financial.closing_amount)
          ? formatCurrencyBRL(closing.financial.closing_amount)
          : "",
      paymentMethod: closing?.financial?.payment_method || "",
      paymentStatus: closing?.financial?.payment_status || ""
    }
  };
};

type ProgressTimelineTone = "blue" | "green" | "amber" | "red" | "violet" | "slate";
type ProgressTimelineKind = "publication" | "deadline" | "meeting" | "hearing" | "audit" | "external";
type ProgressTimelineItem = {
  id: string;
  caseId: number;
  caseNumber: string;
  occurredAt: string;
  dateKey: string;
  timestamp: number;
  kind: ProgressTimelineKind;
  kindLabel: string;
  title: string;
  description: string;
  meta: string[];
  tone: ProgressTimelineTone;
  isNew: boolean;
};

const progressCaseNumberPattern = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/;

const extractProgressCaseDigits = (value?: string | null) => {
  const match = (value || "").match(progressCaseNumberPattern);
  return match ? normalizeCaseDigits(match[0]) : "";
};

const buildProgressDateKey = (value?: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return formatIsoDate(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
};

const buildProgressTimestamp = (value?: string | null) => {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const formatProgressDocument = (value?: string | null) => {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 11) return formatCpfFromDigits(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return value?.trim() || "Sem documento";
};

const getProgressCaseCode = (row: CaseRow) => {
  const haystack = `${row.title} ${row.client} ${row.action} ${row.area} ${row.walletName || ""} ${row.forum}`.toLowerCase();
  if (haystack.includes("trabalh")) return "TRA";
  if (haystack.includes("tribut") || haystack.includes("carf")) return "TRI";
  if (haystack.includes("previd")) return "PRE";
  if (haystack.includes("penal") || haystack.includes("criminal")) return "PEN";
  if (haystack.includes("administr")) return "ADM";
  if (haystack.includes("empresa")) return "EMP";
  return "CIV";
};

const getProgressToneFromCaseCode = (code: string): ProgressTimelineTone => {
  switch (code) {
    case "TRA":
      return "violet";
    case "TRI":
      return "amber";
    case "PRE":
      return "green";
    case "PEN":
      return "red";
    case "ADM":
      return "blue";
    case "EMP":
      return "slate";
    default:
      return "blue";
  }
};

const getProgressToneFromAgendaItem = (item: AgendaItem): ProgressTimelineTone => {
  if (item.source !== "internal") return item.kind === "deadline" ? "amber" : "blue";
  if (item.event_type === "hearing") return "violet";
  if (item.event_type === "audit") return "green";
  if (item.kind === "deadline") return "amber";
  return "blue";
};

const getProgressAgendaKind = (item: AgendaItem): ProgressTimelineKind => {
  if (item.source !== "internal") return "external";
  if (item.event_type === "hearing") return "hearing";
  if (item.event_type === "audit") return "audit";
  return item.kind;
};

function Progress() {
  const [processSearch, setProcessSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [caseRows, setCaseRows] = useState<CaseRow[]>([]);
  const [clientsById, setClientsById] = useState<Map<number, ApiClient>>(new Map());
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [publicationRecords, setPublicationRecords] = useState<PublicationAutomationRecord[]>([]);
  const [expandedCaseId, setExpandedCaseId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadProgress = async () => {
      setIsLoading(true);
      setError("");

      try {
        const [cases, clients] = await Promise.all([apiListCases(), apiListClients()]);
        if (cancelled) return;

        const clientNameMap = new Map<number, string>();
        const clientRecordMap = new Map<number, ApiClient>();
        clients.forEach((client) => {
          clientNameMap.set(client.id, client.name);
          clientRecordMap.set(client.id, client);
        });

        setClientsById(clientRecordMap);
        setCaseRows(cases.map((entry) => toCaseRow(entry, clientNameMap)));

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 45);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);

        const [agendaResult, publicationResult] = await Promise.allSettled([
          apiListAgendaEvents({ start: formatIsoDate(startDate), end: formatIsoDate(endDate) }),
          apiGetPublicationAutomationSettings()
        ]);

        if (cancelled) return;

        setAgendaItems(agendaResult.status === "fulfilled" ? agendaResult.value : []);
        setPublicationRecords(
          publicationResult.status === "fulfilled" ? publicationResult.value.recent_records || [] : []
        );
      } catch (err) {
        if (cancelled) return;
        setError(extractApiErrorMessage(err, "Não foi possível carregar os andamentos."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadProgress();
    return () => {
      cancelled = true;
    };
  }, []);

  const timelineByCaseId = useMemo(() => {
    const byCaseDigits = new Map<string, CaseRow>();
    caseRows.forEach((row) => {
      byCaseDigits.set(normalizeCaseDigits(row.number), row);
    });

    const grouped = new Map<number, ProgressTimelineItem[]>();
    const todayKey = formatIsoDate(new Date());

    const pushItem = (item: ProgressTimelineItem) => {
      const existing = grouped.get(item.caseId) || [];
      existing.push(item);
      grouped.set(item.caseId, existing);
    };

    agendaItems.forEach((item) => {
      const caseDigits =
        normalizeCaseDigits(item.publication_process_number || "") ||
        extractProgressCaseDigits(item.reference) ||
        extractProgressCaseDigits(item.title) ||
        extractProgressCaseDigits(item.description);
      if (!caseDigits) return;

      const relatedCase = byCaseDigits.get(caseDigits);
      if (!relatedCase) return;

      const occurredAt = item.starts_at || item.ends_at || "";
      const dateKey = buildProgressDateKey(occurredAt);
      const timeLabel = formatAgendaTime(item.starts_at, item.ends_at, item.is_all_day);
      const meta = [agendaSourceLabel(item.source)];
      if (timeLabel) meta.push(timeLabel);
      if (agendaEventAssigneesLabel(item)) meta.push(`Responsáveis: ${agendaEventAssigneesLabel(item)}`);
      if (item.location) meta.push(item.location);
      if (item.status) meta.push(item.status);

      pushItem({
        id: `agenda-${item.id}`,
        caseId: relatedCase.id,
        caseNumber: relatedCase.number,
        occurredAt,
        dateKey,
        timestamp: buildProgressTimestamp(occurredAt),
        kind: getProgressAgendaKind(item),
        kindLabel: agendaEventTagLabel(item),
        title: item.title,
        description: item.description?.trim() || item.reference?.trim() || "Compromisso vinculado ao processo.",
        meta,
        tone: getProgressToneFromAgendaItem(item),
        isNew: dateKey === todayKey
      });
    });

    publicationRecords.forEach((record) => {
      const caseDigits = normalizeCaseDigits(record.case_number || "");
      if (!caseDigits) return;

      const relatedCase = byCaseDigits.get(caseDigits);
      if (!relatedCase) return;

      const dateKey = buildProgressDateKey(record.created_at);
      const meta = ["Automação de publicações"];
      if (record.client_name) meta.push(record.client_name);
      if (record.matched_via === "case_number") meta.push("Match por processo");
      if (record.matched_via === "document") meta.push("Match por documento");

      pushItem({
        id: `publication-${record.id}`,
        caseId: relatedCase.id,
        caseNumber: relatedCase.number,
        occurredAt: record.created_at,
        dateKey,
        timestamp: buildProgressTimestamp(record.created_at),
        kind: "publication",
        kindLabel: "Publicação",
        title: record.title || `Publicação vinculada ao processo ${record.case_number}`,
        description: record.case_number
          ? `Nova publicação identificada para o processo ${formatCaseNumber(record.case_number)}.`
          : "Nova publicação vinculada ao processo monitorado.",
        meta,
        tone: "red",
        isNew: dateKey === todayKey
      });
    });

    grouped.forEach((items) => {
      items.sort((left, right) => right.timestamp - left.timestamp);
    });

    return grouped;
  }, [agendaItems, caseRows, publicationRecords]);

  const filteredCases = useMemo(() => {
    const processDigits = normalizeCaseDigits(processSearch);
    const documentDigits = documentSearch.replace(/\D/g, "");
    const clientTerm = clientSearch.trim().toLowerCase();

    return caseRows.filter((row) => {
      const clientRecord = row.clientId ? clientsById.get(row.clientId) : undefined;
      const clientDocument = (clientRecord?.document || "").replace(/\D/g, "");
      const normalizedCase = normalizeCaseDigits(row.number);
      const normalizedClient = `${row.client} ${clientRecord?.name || ""}`.toLowerCase();

      if (processDigits && !normalizedCase.includes(processDigits)) return false;
      if (documentDigits && !clientDocument.includes(documentDigits)) return false;
      if (clientTerm && !normalizedClient.includes(clientTerm)) return false;
      return true;
    });
  }, [caseRows, clientSearch, clientsById, documentSearch, processSearch]);

  const displayedCases = useMemo(() => {
    return [...filteredCases].sort((left, right) => {
      const rightLatest = timelineByCaseId.get(right.id)?.[0]?.timestamp ?? 0;
      const leftLatest = timelineByCaseId.get(left.id)?.[0]?.timestamp ?? 0;
      if (rightLatest !== leftLatest) return rightLatest - leftLatest;
      return left.number.localeCompare(right.number, "pt-BR");
    });
  }, [filteredCases, timelineByCaseId]);

  useEffect(() => {
    if (!displayedCases.length) {
      if (expandedCaseId !== null) setExpandedCaseId(null);
      return;
    }

    if (expandedCaseId === null || !displayedCases.some((row) => row.id === expandedCaseId)) {
      setExpandedCaseId(displayedCases[0].id);
    }
  }, [displayedCases, expandedCaseId]);

  const visibleTimelineItems = useMemo(
    () => displayedCases.flatMap((row) => timelineByCaseId.get(row.id) || []),
    [displayedCases, timelineByCaseId]
  );

  const monitoredCount = displayedCases.length;
  const timelineCount = visibleTimelineItems.length;
  const deadlineCount = visibleTimelineItems.filter((item) => item.kind === "deadline" || item.kind === "hearing").length;
  const updatedTodayCount = displayedCases.filter((row) => (timelineByCaseId.get(row.id) || []).some((item) => item.isNew)).length;
  const latestTimelineTimestamp = visibleTimelineItems.reduce((max, item) => Math.max(max, item.timestamp), 0);
  const lastCaptureLabel = latestTimelineTimestamp
    ? formatDateTimePtBr(new Date(latestTimelineTimestamp).toISOString())
    : "Ainda sem eventos vinculados";
  const hasActiveFilters = Boolean(processSearch.trim() || documentSearch.trim() || clientSearch.trim());

  return (
    <div className="content-card page-card progress-page">
      <div className="page-header progress-header">
        <div>
          <div className="eyebrow">Andamentos</div>
          <h1 className="page-title">Movimentações processuais em linha do tempo</h1>
          <div className="page-subtitle">
            Use os filtros para localizar processos e expandir a sequência de publicações, prazos e compromissos relacionados.
          </div>
        </div>
        <div className="pill">Beta</div>
      </div>

      {error && <div className="error">{error}</div>}

      {!error && (
        <>
          <form
            className="progress-filter-card"
            onSubmit={(event) => {
              event.preventDefault();
              if (displayedCases.length) setExpandedCaseId(displayedCases[0].id);
            }}
          >
            <div className="progress-filter-head">
              <div className="progress-filter-title">Filtrar andamentos</div>
              <div className="progress-filter-status">Última atualização: {lastCaptureLabel}</div>
            </div>

            <div className="progress-filter-grid">
              <div className="field">
                <label>Nº do processo</label>
                <input
                  value={processSearch}
                  onChange={(event) => setProcessSearch(formatCaseNumber(event.target.value))}
                  placeholder="Ex: 1001234-56.2024.8.26.0100"
                />
              </div>
              <div className="field">
                <label>CPF ou CNPJ do cliente</label>
                <input
                  value={documentSearch}
                  onChange={(event) => setDocumentSearch(event.target.value)}
                  placeholder="Ex: 123.456.789-00"
                />
              </div>
              <div className="field">
                <label>Nome do cliente</label>
                <input
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                  placeholder="Ex: Carlos Drummond"
                />
              </div>
              <div className="progress-filter-actions">
                <button className="btn ghost small" type="submit">
                  Buscar
                </button>
                {hasActiveFilters && (
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={() => {
                      setProcessSearch("");
                      setDocumentSearch("");
                      setClientSearch("");
                    }}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="progress-filter-foot">
              <span>Mostrando {monitoredCount} processo(s) monitorado(s).</span>
              {hasActiveFilters && <span>Filtros aplicados em tempo real.</span>}
            </div>
          </form>

          <div className="progress-summary-grid">
            <div className="progress-summary-card">
              <div className="progress-summary-value">{monitoredCount}</div>
              <div className="progress-summary-label">Processos monitorados</div>
            </div>
            <div className="progress-summary-card">
              <div className="progress-summary-value">{timelineCount}</div>
              <div className="progress-summary-label">Eventos na timeline</div>
            </div>
            <div className="progress-summary-card">
              <div className="progress-summary-value">{deadlineCount}</div>
              <div className="progress-summary-label">Prazos e audiências</div>
            </div>
            <div className="progress-summary-card">
              <div className="progress-summary-value">{updatedTodayCount}</div>
              <div className="progress-summary-label">Processos com atualização hoje</div>
            </div>
          </div>

          {isLoading ? (
            <div className="publication-empty">Carregando andamentos...</div>
          ) : !displayedCases.length ? (
            <div className="publication-empty">Nenhum processo encontrado para os filtros informados.</div>
          ) : (
            <div className="progress-case-list">
              {displayedCases.map((row) => {
                const clientRecord = row.clientId ? clientsById.get(row.clientId) : undefined;
                const items = timelineByCaseId.get(row.id) || [];
                const isOpen = expandedCaseId === row.id;
                const caseCode = getProgressCaseCode(row);
                const caseTone = getProgressToneFromCaseCode(caseCode);
                const newItems = items.filter((item) => item.isNew).length;

                return (
                  <article
                    key={row.id}
                    className={`progress-case-card ${isOpen ? "open" : ""}`}
                  >
                    <button
                      type="button"
                      className="progress-case-head"
                      onClick={() => setExpandedCaseId((current) => (current === row.id ? null : row.id))}
                    >
                      <div className="progress-case-ident">
                        <div className={`progress-case-badge tone-${caseTone}`}>{caseCode}</div>
                        <div className="progress-case-copy">
                          <div className="progress-case-number">{formatCaseNumber(row.number)}</div>
                          <div className="progress-case-meta">
                            <span>{row.client}</span>
                            <span>{formatProgressDocument(clientRecord?.document)}</span>
                            <span>{row.action}</span>
                            <span>{row.walletName || "Sem carteira"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="progress-case-state">
                        {newItems > 0 && <span className="progress-pill new">{newItems} novo(s)</span>}
                        <span className="progress-case-count">{items.length} mov.</span>
                        <span className={`progress-chevron ${isOpen ? "open" : ""}`}>⌄</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="progress-case-body">
                        {items.length ? (
                          <div className="progress-timeline">
                            {items.map((item) => (
                              <div key={item.id} className="progress-timeline-item">
                                <div className="progress-timeline-rail">
                                  <span className={`progress-timeline-dot tone-${item.tone}`} />
                                </div>
                                <div className="progress-timeline-content">
                                  <div className="progress-timeline-date">{formatDatePtBr(item.dateKey || item.occurredAt.slice(0, 10))}</div>
                                  <div className="progress-timeline-tags">
                                    <span className={`progress-pill tone-${item.tone}`}>{item.kindLabel}</span>
                                    {item.isNew && <span className="progress-pill new">Hoje</span>}
                                  </div>
                                  <div className="progress-timeline-title">{item.title}</div>
                                  <div className="progress-timeline-description">{item.description}</div>
                                  {item.meta.length > 0 && <div className="progress-timeline-meta">{item.meta.join(" • ")}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="progress-empty-state">
                            Ainda não há publicações ou compromissos vinculados a este processo.
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Cases() {
  type ProcessView = "dashboard" | "list" | "detail" | "create";
  type ProcessDetailKey =
    | "area"
    | "comarca"
    | "tribunal"
    | "instancia"
    | "rito"
    | "carteira"
    | "encerramento";

  const [view, setView] = useState<ProcessView>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCaseId, setActiveCaseId] = useState(0);
  const [detailKey, setDetailKey] = useState<ProcessDetailKey>("area");
  const [caseRows, setCaseRows] = useState<CaseRow[]>([]);
  const [clientsById, setClientsById] = useState<Map<number, string>>(new Map());
  const [registeredClients, setRegisteredClients] = useState<ApiClient[]>([]);
  const [wallets, setWallets] = useState<ApiWallet[]>([]);
  const [teamMembers, setTeamMembers] = useState<ApiTeamMember[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [casesError, setCasesError] = useState("");
  const [createCaseForm, setCreateCaseForm] = useState<CaseForm>(emptyCaseForm);
  const [createClientSearch, setCreateClientSearch] = useState("");
  const [selectedCreateClientId, setSelectedCreateClientId] = useState<number | null>(null);
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [saveCaseError, setSaveCaseError] = useState("");
  const [showEditCase, setShowEditCase] = useState(false);
  const [editCaseForm, setEditCaseForm] = useState<CaseForm>(emptyCaseForm);
  const [editCaseId, setEditCaseId] = useState<number | null>(null);
  const [isUpdatingCase, setIsUpdatingCase] = useState(false);
  const [updateCaseError, setUpdateCaseError] = useState("");
  const [showDeleteCaseConfirm, setShowDeleteCaseConfirm] = useState(false);
  const [isDeletingCase, setIsDeletingCase] = useState(false);
  const [deleteCaseError, setDeleteCaseError] = useState("");
  const [caseClosingStep, setCaseClosingStep] = useState<CaseClosingStep>("type");
  const [caseClosingDraft, setCaseClosingDraft] = useState<CaseClosingDraft>(buildCaseClosingDraft());
  const [isSavingCaseClosing, setIsSavingCaseClosing] = useState(false);
  const [caseClosingError, setCaseClosingError] = useState("");
  const [caseClosingSuccess, setCaseClosingSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadCases = async () => {
      setIsLoadingCases(true);
      setCasesError("");
      try {
        const [cases, clients, walletData, teamMemberData] = await Promise.all([
          apiListCases(),
          apiListClients(),
          apiListWallets(),
          apiListTeamMembers(undefined, { includeMasterAccounts: true })
        ]);
        if (cancelled) return;
        const clientsById = new Map<number, string>();
        clients.forEach((client) => {
          clientsById.set(client.id, client.name);
        });
        setRegisteredClients(clients);
        setClientsById(clientsById);
        setWallets(walletData);
        setTeamMembers(teamMemberData);
        const mapped = cases.map((entry) => toCaseRow(entry, clientsById));
        setCaseRows(mapped);
      } catch (err) {
        if (cancelled) return;
        setCasesError(extractApiErrorMessage(err, "Não foi possível carregar os processos da API."));
      } finally {
        if (!cancelled) setIsLoadingCases(false);
      }
    };
    loadCases();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!caseRows.length) {
      if (activeCaseId !== 0) setActiveCaseId(0);
      return;
    }
    if (activeCaseId !== 0 && !caseRows.some((row) => row.id === activeCaseId)) {
      setActiveCaseId(0);
      if (view === "detail") setView("list");
    }
  }, [caseRows, activeCaseId, view]);

  const totalCases = caseRows.length;
  const activeCases = caseRows.filter((row) => row.status !== "Arquivado").length;
  const portfolioCount = 3;
  const stalledCount = 4;
  const weeklyCount = 6;
  const priorityCount = 3;

  const summaryCards = [
    { id: "total", title: "Total de processos", value: totalCases, hint: "Visao geral do acervo" },
    { id: "active", title: "Processos ativos", value: activeCases, hint: "Em andamento" },
    { id: "portfolio", title: "Carteiras", value: portfolioCount, hint: "Equipes e frentes" },
    { id: "stalled", title: "Sem movimentacao +30 dias", value: stalledCount, hint: "Necessitam revisao" },
    { id: "weekly", title: "Movimentados na ultima semana", value: weeklyCount, hint: "Atualizacoes recentes" },
    { id: "priority", title: "Marcados como prioridade", value: priorityCount, hint: "Casos criticos" }
  ];

  const filteredCases = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return caseRows;
    return caseRows.filter((row) => {
      const haystack = `${row.title} ${row.client} ${row.walletName || ""} ${row.number} ${row.forum} ${row.lawyer} ${row.action} ${row.area}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [searchTerm, caseRows]);

  const selectedCreateClient =
    registeredClients.find((client) => client.id === selectedCreateClientId) ?? null;
  const filteredCreateClients = useMemo(() => {
    const term = createClientSearch.trim().toLowerCase();
    const source = !term
      ? registeredClients
      : registeredClients.filter((client) =>
          `${client.name} ${client.document || ""}`.toLowerCase().includes(term)
        );
    return source.slice(0, 8);
  }, [registeredClients, createClientSearch]);
  const shouldShowCreateClientResults =
    filteredCreateClients.length > 0 &&
    (!selectedCreateClient ||
      createClientSearch.trim().toLowerCase() !== selectedCreateClient.name.trim().toLowerCase());
  const selectedCase = caseRows.find((row) => row.id === activeCaseId) ?? null;

  useEffect(() => {
    if (!selectedCase) {
      setCaseClosingDraft(buildCaseClosingDraft());
      setCaseClosingStep("type");
      setCaseClosingError("");
      setCaseClosingSuccess("");
      return;
    }
    setCaseClosingDraft(buildCaseClosingDraft(selectedCase.closing, selectedCase.value));
    setCaseClosingStep("type");
    setCaseClosingError("");
    setCaseClosingSuccess("");
  }, [selectedCase?.id]);

  const detailSections: { id: ProcessDetailKey; title: string; description?: string; items?: string[] }[] = [
    {
      id: "area",
      title: "Área",
      items: [
        "Direito Civil",
        "Direito Penal",
        "Direito do Trabalho",
        "Direito Tributario",
        "Direito Administrativo",
        "Direito do Consumidor",
        "Direito Empresarial",
        "Direito Previdenciario",
        "Direito Ambiental"
      ]
    },
    {
      id: "comarca",
      title: "Comarca",
      description: "Vara + Cidade/Regiao em que tramita o processo."
    },
    {
      id: "tribunal",
      title: "Tribunal",
      description: "TJSP, TRF, TRT ou instancias superiores conforme o andamento do processo."
    },
    {
      id: "instancia",
      title: "Instancia",
      items: [
        "Primeira instancia",
        "Segunda instancia",
        "Tribunais superiores (STJ/STF)",
        "Juizados especiais"
      ]
    },
    {
      id: "rito",
      title: "Rito",
      items: ["Comum", "Sumario", "Sumarissimo", "Juizado Especial", "Execucao", "Cumprimento de Sentenca"]
    },
    {
      id: "carteira",
      title: "Carteira",
      items: ["Equipe ou advogado responsavel", "Classificacao interna", "Segmento do cliente"]
    },
    {
      id: "encerramento",
      title: "Encerramento",
      items: [
        "Sentenca com transito em julgado",
        "Acordo homologado",
        "Arquivamento",
        "Extincao sem resolucao",
        "Desistencia"
      ]
    }
  ];

  const activeDetail = detailSections.find((section) => section.id === detailKey) ?? detailSections[0];
  const closingResponsibleOptions = useMemo(
    () =>
      [...teamMembers]
        .filter((member) => member.is_active)
        .sort((left, right) => left.full_name.localeCompare(right.full_name, "pt-BR")),
    [teamMembers]
  );
  const selectedClosingObligations = useMemo(
    () => caseClosingDraft.obligations.filter((item) => item.selected),
    [caseClosingDraft.obligations]
  );
  const completedClosingObligations = useMemo(
    () => selectedClosingObligations.filter((item) => item.responsible || item.due_date).length,
    [selectedClosingObligations]
  );
  const closingDateTemplate = useMemo(
    () => getCaseClosingDateTemplate(caseClosingDraft.closureType),
    [caseClosingDraft.closureType]
  );
  const caseClosingStepIndex = caseClosingSteps.findIndex((step) => step.id === caseClosingStep);
  const caseClosingStepDone = {
    type: Boolean(caseClosingDraft.closureType),
    result: Boolean(caseClosingDraft.result),
    obligations: selectedClosingObligations.length > 0,
    dates: Boolean(
      caseClosingDraft.dates.triggerDate || caseClosingDraft.dates.completionDate || caseClosingDraft.dates.archivedAt
    ),
    financial: Boolean(
      caseClosingDraft.financial.claimAmount ||
        caseClosingDraft.financial.closingAmount ||
        caseClosingDraft.financial.paymentMethod ||
        caseClosingDraft.financial.paymentStatus
    )
  };
  const caseClosingCompletionCount = caseClosingSteps.filter((step) => caseClosingStepDone[step.id]).length;
  const caseClosingSummary = [
    { label: "Tipo", value: getCaseClosingTypeLabel(caseClosingDraft.closureType) },
    { label: "Resultado", value: getCaseClosingResultLabel(caseClosingDraft.result) },
    {
      label: "Obrigações",
      value: selectedClosingObligations.length
        ? `${selectedClosingObligations.length} selecionada(s)`
        : "Nenhuma selecionada"
    },
    {
      label: "Datas",
      value:
        [caseClosingDraft.dates.triggerDate, caseClosingDraft.dates.completionDate, caseClosingDraft.dates.archivedAt].filter(Boolean)
          .length + " preenchida(s)"
    },
    {
      label: "Financeiro",
      value: caseClosingDraft.financial.closingAmount || caseClosingDraft.financial.claimAmount || "Sem valores"
    }
  ];

  const handleSelectCase = (id: number) => {
    setActiveCaseId(id);
    setView("detail");
  };

  const resetCreateCaseState = () => {
    setCreateCaseForm(emptyCaseForm);
    setCreateClientSearch("");
    setSelectedCreateClientId(null);
    setSaveCaseError("");
  };

  const handleSelectCreateClient = (client: ApiClient) => {
    setSelectedCreateClientId(client.id);
    setCreateClientSearch(client.name);
    setSaveCaseError("");
  };

  const handleCreateCase = async () => {
    if (!selectedCreateClient) {
      setSaveCaseError("Selecione um cliente para cadastrar o processo.");
      return;
    }
    const validationMessage = getCaseFormValidationMessage(createCaseForm);
    if (validationMessage) {
      setSaveCaseError(validationMessage);
      return;
    }
    setIsSavingCase(true);
    setSaveCaseError("");
    try {
      const counterparty = formatCounterparty(createCaseForm.counterparty).trim() || "Parte contrária";
      const formattedProcess = formatCaseNumber(createCaseForm.process);
      const created = await apiCreateCase({
        number: formattedProcess,
        title: `${selectedCreateClient.name} x ${counterparty}`,
        client_id: selectedCreateClient.id,
        wallet_id: createCaseForm.walletId ? Number(createCaseForm.walletId) : undefined,
        status: "aberto",
        forum: formatCourtOrRegion(createCaseForm.region).trim() || undefined,
        court: formatCourtOrRegion(createCaseForm.court).trim() || undefined
      });
      const createdRow = toCaseRow(created, clientsById);
      setCaseRows((prev) => [createdRow, ...prev]);
      setActiveCaseId(createdRow.id);
      resetCreateCaseState();
      setView("detail");
    } catch (err) {
      setSaveCaseError(extractApiErrorMessage(err, "Não foi possível salvar o processo na API."));
    } finally {
      setIsSavingCase(false);
    }
  };

  const handleStartEditCase = () => {
    if (!selectedCase) return;
    setEditCaseId(selectedCase.id);
    setEditCaseForm({
      process: formatCaseNumber(selectedCase.number || ""),
      walletId: selectedCase.walletId ? String(selectedCase.walletId) : "",
      court: selectedCase.action === "Ação judicial" ? "" : formatCourtOrRegion(selectedCase.action),
      region: selectedCase.forum === "-" ? "" : formatCourtOrRegion(selectedCase.forum),
      associated: "",
      counterparty: formatCounterparty(selectedCase.counterparty === "-" ? "" : selectedCase.counterparty),
      counterLawyer: "",
      oab: "",
      contact: "",
      notes: ""
    });
    setUpdateCaseError("");
    setShowEditCase(true);
  };

  const handleUpdateCase = async () => {
    if (!selectedCase || !editCaseId) return;
    const validationMessage = getCaseFormValidationMessage(editCaseForm);
    if (validationMessage) {
      setUpdateCaseError(validationMessage);
      return;
    }
    setIsUpdatingCase(true);
    setUpdateCaseError("");
    try {
      const formattedProcess = formatCaseNumber(editCaseForm.process);
      const payload = {
        number: formattedProcess,
        title: `${selectedCase.client} x ${formatCounterparty(editCaseForm.counterparty).trim() || "Parte contrária"}`,
        client_id: selectedCase.clientId,
        wallet_id: editCaseForm.walletId ? Number(editCaseForm.walletId) : undefined,
        status: selectedCase.rawStatus || "aberto",
        forum: formatCourtOrRegion(editCaseForm.region).trim() || undefined,
        court: formatCourtOrRegion(editCaseForm.court).trim() || undefined
      };
      const updated = await apiUpdateCase(editCaseId, payload);
      const updatedRow = toCaseRow(updated, clientsById);
      setCaseRows((prev) => prev.map((row) => (row.id === updatedRow.id ? updatedRow : row)));
      setActiveCaseId(updatedRow.id);
      setShowEditCase(false);
      setEditCaseId(null);
      setEditCaseForm(emptyCaseForm);
    } catch (err) {
      setUpdateCaseError(extractApiErrorMessage(err, "Não foi possível atualizar o processo na API."));
    } finally {
      setIsUpdatingCase(false);
    }
  };

  const handleRequestDeleteCase = () => {
    if (!selectedCase) return;
    setDeleteCaseError("");
    setShowDeleteCaseConfirm(true);
  };

  const handleDeleteCase = async () => {
    if (!selectedCase) return;
    setIsDeletingCase(true);
    setDeleteCaseError("");
    try {
      if (selectedCase.walletId && !isLocalApiBaseUrl(baseURL)) {
        await apiUpdateCase(selectedCase.id, {
          number: selectedCase.number,
          title: selectedCase.title,
          client_id: selectedCase.clientId,
          status: selectedCase.rawStatus || "aberto",
          forum: selectedCase.forum === "-" ? undefined : selectedCase.forum,
          court: selectedCase.action === "Ação judicial" ? undefined : selectedCase.action,
          wallet_id: undefined
        });
      }
      await apiDeleteCase(selectedCase.id);
      setCaseRows((prev) => prev.filter((row) => row.id !== selectedCase.id));
      setShowDeleteCaseConfirm(false);
      setShowEditCase(false);
      setEditCaseId(null);
      setEditCaseForm(emptyCaseForm);
      setView("list");
    } catch (err) {
      setDeleteCaseError(extractApiErrorMessage(err, "Não foi possível excluir o processo."));
    } finally {
      setIsDeletingCase(false);
    }
  };

  const handleSelectClosingType = (closureType: string) => {
    setCaseClosingDraft((prev) => ({ ...prev, closureType }));
    setCaseClosingError("");
    setCaseClosingSuccess("");
  };

  const handleSelectClosingResult = (result: string) => {
    setCaseClosingDraft((prev) => ({ ...prev, result }));
    setCaseClosingError("");
    setCaseClosingSuccess("");
  };

  const handleToggleClosingObligation = (obligationId: string) => {
    setCaseClosingDraft((prev) => ({
      ...prev,
      obligations: prev.obligations.map((item) =>
        item.id === obligationId
          ? {
              ...item,
              selected: !item.selected,
              responsible: item.selected ? "" : item.responsible,
              due_date: item.selected ? "" : item.due_date
            }
          : item
      )
    }));
    setCaseClosingError("");
    setCaseClosingSuccess("");
  };

  const handleChangeClosingObligation = (
    obligationId: string,
    field: "responsible" | "due_date",
    value: string
  ) => {
    setCaseClosingDraft((prev) => ({
      ...prev,
      obligations: prev.obligations.map((item) => (item.id === obligationId ? { ...item, [field]: value } : item))
    }));
    setCaseClosingError("");
    setCaseClosingSuccess("");
  };

  const handleChangeClosingDate = (
    field: keyof CaseClosingDraft["dates"],
    value: string
  ) => {
    setCaseClosingDraft((prev) => ({ ...prev, dates: { ...prev.dates, [field]: value } }));
    setCaseClosingError("");
    setCaseClosingSuccess("");
  };

  const handleChangeClosingFinancial = (
    field: keyof CaseClosingDraft["financial"],
    value: string
  ) => {
    setCaseClosingDraft((prev) => ({ ...prev, financial: { ...prev.financial, [field]: value } }));
    setCaseClosingError("");
    setCaseClosingSuccess("");
  };

  const handleGoToNextClosingStep = () => {
    const nextStep = caseClosingSteps[caseClosingStepIndex + 1];
    if (nextStep) setCaseClosingStep(nextStep.id);
  };

  const handleGoToPreviousClosingStep = () => {
    const previousStep = caseClosingSteps[caseClosingStepIndex - 1];
    if (previousStep) setCaseClosingStep(previousStep.id);
  };

  const handleSaveCaseClosing = async () => {
    if (!selectedCase) return;
    if (!caseClosingDraft.closureType) {
      setCaseClosingError("Selecione o tipo de encerramento para salvar a composição.");
      return;
    }

    setIsSavingCaseClosing(true);
    setCaseClosingError("");
    setCaseClosingSuccess("");
    try {
      const payload = {
        closure_type: caseClosingDraft.closureType || undefined,
        result: caseClosingDraft.result || undefined,
        obligations: caseClosingDraft.obligations
          .filter((item) => item.selected)
          .map(({ selected, ...item }) => ({
            ...item,
            responsible: item.responsible || undefined,
            due_date: item.due_date || undefined
          })),
        dates: {
          trigger_date: caseClosingDraft.dates.triggerDate || undefined,
          completion_date: caseClosingDraft.dates.completionDate || undefined,
          archived_at: caseClosingDraft.dates.archivedAt || undefined
        },
        financial: {
          claim_amount: caseClosingDraft.financial.claimAmount ? parseCurrencyBRL(caseClosingDraft.financial.claimAmount) : undefined,
          closing_amount: caseClosingDraft.financial.closingAmount
            ? parseCurrencyBRL(caseClosingDraft.financial.closingAmount)
            : undefined,
          payment_method: caseClosingDraft.financial.paymentMethod || undefined,
          payment_status: caseClosingDraft.financial.paymentStatus || undefined
        }
      };
      const updated = await apiSaveCaseClosing(selectedCase.id, payload);
      const updatedRow = toCaseRow(updated, clientsById);
      setCaseRows((prev) => prev.map((row) => (row.id === updatedRow.id ? updatedRow : row)));
      setCaseClosingDraft(buildCaseClosingDraft(updatedRow.closing, updatedRow.value));
      setCaseClosingSuccess("Encerramento salvo com sucesso.");
    } catch (err) {
      setCaseClosingError(extractApiErrorMessage(err, "Não foi possível salvar o encerramento."));
    } finally {
      setIsSavingCaseClosing(false);
    }
  };

  const canAdvanceCaseClosingStep =
    caseClosingStep === "type"
      ? Boolean(caseClosingDraft.closureType)
      : caseClosingStep === "result"
        ? Boolean(caseClosingDraft.result)
        : true;
  const isLastCaseClosingStep = caseClosingStep === "financial";
  const financialClaimAmount = caseClosingDraft.financial.claimAmount ? parseCurrencyBRL(caseClosingDraft.financial.claimAmount) : 0;
  const financialClosingAmount = caseClosingDraft.financial.closingAmount ? parseCurrencyBRL(caseClosingDraft.financial.closingAmount) : 0;

  const renderCaseClosingStepContent = () => {
    if (caseClosingStep === "type") {
      return (
        <div className="processes-closing-step-body">
          <div className="processes-closing-step-copy">
            <h3>Tipo de encerramento</h3>
            <p>Selecione a forma principal de encerramento para estruturar o restante do fluxo.</p>
          </div>
          <div className="processes-closing-option-grid">
            {caseClosingTypeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`processes-closing-option-card ${caseClosingDraft.closureType === option.id ? "active" : ""}`}
                onClick={() => handleSelectClosingType(option.id)}
              >
                <span className="processes-closing-option-icon" aria-hidden="true">
                  {option.icon}
                </span>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (caseClosingStep === "result") {
      return (
        <div className="processes-closing-step-body">
          <div className="processes-closing-step-copy">
            <h3>Resultado do encerramento</h3>
            <p>Defina o desfecho principal para orientar relatórios, histórico e comunicação interna.</p>
          </div>
          <div className="processes-closing-option-grid result">
            {caseClosingResultOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`processes-closing-option-card tone-${option.tone} ${caseClosingDraft.result === option.id ? "active" : ""}`}
                onClick={() => handleSelectClosingResult(option.id)}
              >
                <span className="processes-closing-option-icon" aria-hidden="true">
                  {option.icon}
                </span>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
                <em>{option.badge}</em>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (caseClosingStep === "obligations") {
      const progressPercent = caseClosingObligationCatalog.length
        ? Math.round((completedClosingObligations / caseClosingObligationCatalog.length) * 100)
        : 0;
      return (
        <div className="processes-closing-step-body">
          <div className="processes-closing-step-copy">
            <h3>Obrigações pós-encerramento</h3>
            <p>Marque apenas o que se aplica ao caso e atribua responsável e prazo quando fizer sentido.</p>
          </div>
          <div className="processes-closing-obligation-progress">
            <div>
              <strong>{completedClosingObligations}</strong>
              <span>obrigação(ões) configurada(s)</span>
            </div>
            <div className="processes-closing-progress-bar" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="processes-closing-obligation-list">
            {caseClosingDraft.obligations.map((item) => (
              <div key={item.id} className={`processes-closing-obligation-card ${item.selected ? "active" : ""}`}>
                <label className="processes-closing-obligation-head">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => handleToggleClosingObligation(item.id)}
                  />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </div>
                </label>
                {item.selected && (
                  <div className="processes-closing-obligation-fields">
                    <div className="field">
                      <label>Responsável</label>
                      <select
                        value={item.responsible || ""}
                        onChange={(event) => handleChangeClosingObligation(item.id, "responsible", event.target.value)}
                      >
                        <option value="">Selecionar responsável</option>
                        {closingResponsibleOptions.map((member) => (
                          <option key={member.id} value={member.full_name}>
                            {member.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Prazo</label>
                      <input
                        type="date"
                        value={item.due_date || ""}
                        onChange={(event) => handleChangeClosingObligation(item.id, "due_date", event.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (caseClosingStep === "dates") {
      return (
        <div className="processes-closing-step-body">
          <div className="processes-closing-step-copy">
            <h3>Datas importantes</h3>
            <p>Registre os marcos relevantes para fechar a timeline do processo com coerência.</p>
          </div>
          <div className="processes-closing-date-grid">
            <div className="processes-closing-date-card">
              <strong>{closingDateTemplate.triggerLabel}</strong>
              <span>{closingDateTemplate.triggerHint}</span>
              <input
                type="date"
                value={caseClosingDraft.dates.triggerDate}
                onChange={(event) => handleChangeClosingDate("triggerDate", event.target.value)}
              />
            </div>
            <div className="processes-closing-date-card">
              <strong>{closingDateTemplate.completionLabel}</strong>
              <span>{closingDateTemplate.completionHint}</span>
              <input
                type="date"
                value={caseClosingDraft.dates.completionDate}
                onChange={(event) => handleChangeClosingDate("completionDate", event.target.value)}
              />
            </div>
            <div className="processes-closing-date-card">
              <strong>{closingDateTemplate.archivedLabel}</strong>
              <span>{closingDateTemplate.archivedHint}</span>
              <input
                type="date"
                value={caseClosingDraft.dates.archivedAt}
                onChange={(event) => handleChangeClosingDate("archivedAt", event.target.value)}
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="processes-closing-step-body">
        <div className="processes-closing-step-copy">
          <h3>Dados financeiros</h3>
          <p>Preencha os valores e marque a forma de pagamento para compor o encerramento financeiro do caso.</p>
        </div>
        <div className="processes-closing-financial-grid">
          <div className="field">
            <label>Valor da causa</label>
            <input
              value={caseClosingDraft.financial.claimAmount}
              onChange={(event) => handleChangeClosingFinancial("claimAmount", formatCurrencyInputBRL(event.target.value))}
              placeholder="R$ 0,00"
            />
          </div>
          <div className="field">
            <label>Valor do acordo / condenação</label>
            <input
              value={caseClosingDraft.financial.closingAmount}
              onChange={(event) => handleChangeClosingFinancial("closingAmount", formatCurrencyInputBRL(event.target.value))}
              placeholder="R$ 0,00"
            />
          </div>
          <div className="field span-2">
            <label>Forma de pagamento</label>
            <div className="processes-closing-toggle-grid">
              {caseClosingPaymentMethodOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`processes-closing-toggle-card ${caseClosingDraft.financial.paymentMethod === option.id ? "active" : ""}`}
                  onClick={() => handleChangeClosingFinancial("paymentMethod", option.id)}
                >
                  <span aria-hidden="true">{option.icon}</span>
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="field span-2">
            <label>Status do pagamento</label>
            <div className="processes-closing-toggle-grid">
              {caseClosingPaymentStatusOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`processes-closing-toggle-card tone-${option.tone} ${caseClosingDraft.financial.paymentStatus === option.id ? "active" : ""}`}
                  onClick={() => handleChangeClosingFinancial("paymentStatus", option.id)}
                >
                  <span aria-hidden="true">{option.icon}</span>
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="processes-closing-financial-summary">
          <div>
            <strong>{formatCurrencyBRL(financialClaimAmount)}</strong>
            <span>Base do processo</span>
          </div>
          <div>
            <strong>{formatCurrencyBRL(financialClosingAmount)}</strong>
            <span>Fechamento financeiro</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="content-card page-card cases-page processes-page">
      <section className="processes-body">
          <div className="processes-top">
            <div className="wallets-switch" role="tablist" aria-label="Modo de processos">
              <button
                type="button"
                className={`wallets-switch-btn ${view === "dashboard" ? "active" : ""}`}
                onClick={() => setView("dashboard")}
                aria-pressed={view === "dashboard"}
              >
                Resumo
              </button>
              <button
                type="button"
                className={`wallets-switch-btn ${view === "list" || view === "detail" ? "active" : ""}`}
                onClick={() => setView("list")}
                aria-pressed={view === "list" || view === "detail"}
              >
                Visualizar
              </button>
              <button
                type="button"
                className={`wallets-switch-btn ${view === "create" ? "active" : ""}`}
                onClick={() => setView("create")}
                aria-pressed={view === "create"}
              >
                Cadastrar
              </button>
            </div>

            {(view === "list" || view === "detail") && (
              <div className="processes-search">
                <input
                  placeholder="Pesquisar por numero, parte ou tribunal"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                <button type="button" className="icon-btn" aria-label="Pesquisar processos">
                  <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-4-4" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          {casesError && <div className="error">{casesError}</div>}

          {view === "dashboard" && (
            <div className="processes-dashboard">
              <div className="processes-dashboard-head">
                <div>
                  <div className="processes-eyebrow">Processos</div>
                  <h2>Visao consolidada</h2>
                  <p>Resumo rapido do acervo e alertas prioritarios.</p>
                </div>
                <button className="btn ghost small" type="button" onClick={() => setView("list")}>
                  Ver lista completa
                </button>
              </div>
              <div className="processes-kpi-grid">
                {summaryCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="processes-kpi-card"
                    onClick={() => setView("list")}
                  >
                    <div className="processes-kpi-title">{card.title}</div>
                    <div className="processes-kpi-value">{card.value}</div>
                    <div className="processes-kpi-hint">{card.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "list" && (
            <div className="processes-list">
              <div className="processes-list-head">
                <div>
                  <div className="processes-eyebrow">Processos</div>
                  <h2>Lista completa</h2>
                </div>
                <button className="btn secondary small" type="button" onClick={() => setView("dashboard")}>
                  Voltar ao resumo
                </button>
              </div>
              <div className="processes-table">
                <div className="processes-table-row head">
                  <div>Nº do processo</div>
                  <div>Partes</div>
                  <div>Area</div>
                  <div>Vara/Comarca</div>
                  <div>Andamento</div>
                </div>
                {isLoadingCases ? (
                  <div className="processes-empty">Carregando processos...</div>
                ) : filteredCases.length === 0 ? (
                  <div className="processes-empty">Nenhum processo encontrado.</div>
                ) : (
                  filteredCases.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className={`processes-table-row ${row.id === activeCaseId ? "active" : ""}`}
                      onClick={() => handleSelectCase(row.id)}
                    >
                      <div>{row.number}</div>
                      <div>{row.title}</div>
                      <div>{row.area}</div>
                      <div>{row.forum}</div>
                      <div>
                        <span className={`processes-status ${row.status.replace(" ", "-").toLowerCase()}`}></span>
                        {row.status}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {view === "detail" && selectedCase && (
            <div className="processes-detail">
              <div className="processes-detail-head">
                <div>
                  <div className="processes-detail-number">{selectedCase.number}</div>
                  <div className="processes-detail-meta">
                    Cadastro: {selectedCase.createdAt ? formatDateTimePtBr(selectedCase.createdAt) : "-"} · Última alteração:{" "}
                    {selectedCase.updatedAt ? formatDateTimePtBr(selectedCase.updatedAt) : "-"}
                  </div>
                </div>
                <div className="processes-detail-side">
                  <span className="processes-status-pill">{selectedCase.status}</span>
                  <div className="processes-detail-bubble">
                    {selectedCase.closing?.closure_type
                      ? `Encerramento configurado: ${getCaseClosingTypeLabel(selectedCase.closing.closure_type)}.`
                      : "Monte o encerramento em etapas e salve o fluxo dentro deste processo."}
                  </div>
                </div>
              </div>
              <div className="processes-detail-lines">
                <div>Polo ativo: {selectedCase.client}</div>
                <div>Polo passivo: {selectedCase.counterparty}</div>
                <div>Carteira: {selectedCase.walletName || "-"}</div>
                <div>
                  Valor da causa: {typeof selectedCase.value === "number" ? formatCurrencyBRL(selectedCase.value) : "-"}
                </div>
                <div>Encerramento: {selectedCase.closing?.closure_type ? getCaseClosingTypeLabel(selectedCase.closing.closure_type) : "Não iniciado"}</div>
              </div>

              <div className="processes-detail-section">
                <div className="processes-detail-title">Dados do processo</div>
                <div className="processes-detail-grid">
                  {detailSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={`processes-detail-chip ${detailKey === section.id ? "active" : ""}`}
                      onClick={() => setDetailKey(section.id)}
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
              </div>

              {activeDetail.id === "encerramento" ? (
                <div className="processes-detail-panel processes-closing-panel">
                  <div className="processes-closing-layout">
                    <div className="processes-closing-main">
                      <div className="processes-closing-header">
                        <div>
                          <div className="processes-detail-panel-title">Encerramento do processo</div>
                          <div className="processes-detail-panel-text">
                            Estruture tipo, resultado, obrigações, datas e financeiro no mesmo fluxo.
                          </div>
                        </div>
                        <button
                          className="btn secondary small"
                          type="button"
                          onClick={handleSaveCaseClosing}
                          disabled={isSavingCaseClosing || !caseClosingDraft.closureType}
                        >
                          {isSavingCaseClosing ? "Salvando..." : "Salvar encerramento"}
                        </button>
                      </div>

                      <div className="processes-closing-steps" role="tablist" aria-label="Etapas do encerramento">
                        {caseClosingSteps.map((step, index) => (
                          <button
                            key={step.id}
                            type="button"
                            className={`processes-closing-step-tab ${caseClosingStep === step.id ? "active" : ""} ${
                              caseClosingStepDone[step.id] ? "done" : ""
                            }`}
                            onClick={() => setCaseClosingStep(step.id)}
                          >
                            <span className="processes-closing-step-index">
                              {caseClosingStepDone[step.id] ? "✓" : index + 1}
                            </span>
                            <span>
                              <strong>{step.label}</strong>
                              <small>{step.hint}</small>
                            </span>
                          </button>
                        ))}
                      </div>

                      {caseClosingError && <div className="error">{caseClosingError}</div>}
                      {caseClosingSuccess && <div className="success">{caseClosingSuccess}</div>}

                      {renderCaseClosingStepContent()}

                      <div className="processes-closing-footer">
                        <button
                          className="btn ghost small"
                          type="button"
                          onClick={handleGoToPreviousClosingStep}
                          disabled={caseClosingStepIndex <= 0}
                        >
                          Voltar
                        </button>
                        <div className="processes-closing-footer-actions">
                          {!isLastCaseClosingStep && (
                            <button
                              className="btn secondary small"
                              type="button"
                              onClick={handleSaveCaseClosing}
                              disabled={isSavingCaseClosing || !caseClosingDraft.closureType}
                            >
                              Salvar rascunho
                            </button>
                          )}
                          <button
                            className="btn small"
                            type="button"
                            onClick={isLastCaseClosingStep ? handleSaveCaseClosing : handleGoToNextClosingStep}
                            disabled={isSavingCaseClosing || (!isLastCaseClosingStep && !canAdvanceCaseClosingStep)}
                          >
                            {isLastCaseClosingStep ? "Salvar encerramento" : "Próxima etapa"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <aside className="processes-closing-summary-card">
                      <div className="processes-closing-summary-head">
                        <strong>Resumo do encerramento</strong>
                        <span>{caseClosingCompletionCount}/{caseClosingSteps.length} etapas com dados</span>
                      </div>
                      <div className="processes-closing-summary-list">
                        {caseClosingSummary.map((item) => (
                          <div key={item.label} className="processes-closing-summary-item">
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="processes-closing-summary-block">
                        <span>Próximas obrigações</span>
                        {selectedClosingObligations.length ? (
                          selectedClosingObligations.map((item) => (
                            <div key={item.id} className="processes-closing-summary-chip">
                              <strong>{item.title}</strong>
                              <span>
                                {[item.responsible || "Sem responsável", item.due_date ? formatBrazilDate(item.due_date) : "Sem prazo"].join(
                                  " · "
                                )}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="processes-detail-panel-text">Nenhuma obrigação selecionada.</div>
                        )}
                      </div>
                    </aside>
                  </div>
                </div>
              ) : (
                <div className="processes-detail-panel">
                  <div className="processes-detail-panel-title">{activeDetail.title}</div>
                  {activeDetail.description && <div className="processes-detail-panel-text">{activeDetail.description}</div>}
                  {activeDetail.items && (
                    <ul className="processes-detail-list">
                      {activeDetail.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="processes-detail-actions">
                <button className="btn small" type="button" onClick={() => setDetailKey("encerramento")}>
                  Abrir encerramento
                </button>
                <button className="btn secondary small" type="button" onClick={handleStartEditCase}>
                  Editar processo
                </button>
                <button className="btn danger small" type="button" onClick={handleRequestDeleteCase}>
                  Excluir processo
                </button>
                <button className="btn ghost small" type="button" onClick={() => setView("list")}>
                  Voltar para lista
                </button>
              </div>
            </div>
          )}

          {view === "create" && (
            <div className="processes-create">
              <div className="processes-create-card">
                <div className="processes-create-head">
                  <div>
                    <div className="processes-eyebrow">Cadastro</div>
                    <h2>Novo processo</h2>
                    <p>Busque o cliente, preencha os dados do processo e salve sem passar pela aba Pessoas.</p>
                  </div>
                  <button className="btn ghost small" type="button" onClick={() => setView("dashboard")}>
                    Voltar ao resumo
                  </button>
                </div>

                <div className="field span-2">
                  <label>
                    Buscar cliente <span className="required">*</span>
                  </label>
                  <input
                    value={createClientSearch}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      const selectedClientName = selectedCreateClient?.name.trim().toLowerCase() || "";
                      if (selectedCreateClient && nextValue.trim().toLowerCase() !== selectedClientName) {
                        setSelectedCreateClientId(null);
                      }
                      if (saveCaseError) setSaveCaseError("");
                      setCreateClientSearch(nextValue);
                    }}
                    placeholder="Digite nome ou documento do cliente"
                  />
                </div>

                {selectedCreateClient ? (
                  <div className="processes-selected-client">
                    <div>
                      <strong>{selectedCreateClient.name}</strong>
                      <span>{selectedCreateClient.document || "Sem documento cadastrado"}</span>
                    </div>
                    <button
                      className="btn ghost small"
                      type="button"
                      onClick={() => {
                        setSelectedCreateClientId(null);
                        setCreateClientSearch("");
                      }}
                    >
                      Trocar cliente
                    </button>
                  </div>
                ) : (
                  <div className="field-hint">Selecione um cliente antes de salvar o processo.</div>
                )}

                {shouldShowCreateClientResults && (
                  <div className="processes-client-results" role="listbox" aria-label="Clientes encontrados">
                    {filteredCreateClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        className="processes-client-option"
                        onClick={() => handleSelectCreateClient(client)}
                      >
                        <strong>{client.name}</strong>
                        <span>{client.document || "Documento não informado"}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!selectedCreateClient && !registeredClients.length && (
                  <div className="field-hint">
                    {isLoadingCases
                      ? "Carregando clientes cadastrados..."
                      : "Nenhum cliente cadastrado. Cadastre o cliente na aba Pessoas e volte aqui."}
                  </div>
                )}
                {!!createClientSearch.trim() && !filteredCreateClients.length && (
                  <div className="field-hint">Nenhum cliente encontrado para essa busca.</div>
                )}

                <ProcessFormFields
                  form={createCaseForm}
                  wallets={wallets}
                  onChange={(key, value) => {
                    if (saveCaseError) setSaveCaseError("");
                    setCreateCaseForm((prev) => ({ ...prev, [key]: value }));
                  }}
                />

                {saveCaseError && <div className="error">{saveCaseError}</div>}
                <div className="modal-actions">
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      if (isSavingCase) return;
                      resetCreateCaseState();
                    }}
                    disabled={isSavingCase}
                  >
                    Limpar
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={handleCreateCase}
                    disabled={isSavingCase || !selectedCreateClient || !!getCaseFormValidationMessage(createCaseForm)}
                  >
                    {isSavingCase ? "Salvando..." : "Salvar processo"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <AddProcessModal
            open={showEditCase}
            clientName={selectedCase?.client}
            form={editCaseForm}
            wallets={wallets}
            saving={isUpdatingCase}
            errorMessage={updateCaseError}
            onChange={(key, value) => {
              if (updateCaseError) setUpdateCaseError("");
              setEditCaseForm((prev) => ({ ...prev, [key]: value }));
            }}
            onClose={() => {
              if (isUpdatingCase) return;
              setShowEditCase(false);
              setEditCaseId(null);
              setEditCaseForm(emptyCaseForm);
              setUpdateCaseError("");
            }}
            onSave={handleUpdateCase}
          />
          <ConfirmDeleteModal
            open={showDeleteCaseConfirm}
            title="Excluir processo"
            message={`Deseja excluir o processo ${selectedCase?.number || ""}?`}
            confirmLabel="Excluir processo"
            busy={isDeletingCase}
            errorMessage={deleteCaseError}
            onCancel={() => {
              if (isDeletingCase) return;
              setShowDeleteCaseConfirm(false);
              setDeleteCaseError("");
            }}
            onConfirm={handleDeleteCase}
          />
      </section>
    </div>
  );
}

function Wallets({ canManage }: { canManage: boolean }) {
  type WalletView = "dashboard" | "list" | "create";
  const [view, setView] = useState<WalletView>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [wallets, setWallets] = useState<ApiWallet[]>([]);
  const [members, setMembers] = useState<ApiTeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [editingWalletId, setEditingWalletId] = useState<number | null>(null);
  const [form, setForm] = useState({ nickname: "", description: "", isActive: true, teamMemberIds: [] as number[] });

  useEffect(() => {
    let cancelled = false;
    const loadWallets = async () => {
      setIsLoading(true);
      setError("");
      if (canManage) {
        setIsLoadingMembers(true);
      }
      try {
        const [walletData, memberData] = await Promise.all([apiListWallets(), canManage ? apiListTeamMembers() : Promise.resolve([])]);
        if (cancelled) return;
        setWallets(walletData);
        setMembers(memberData);
      } catch (err) {
        if (cancelled) return;
        setError(extractApiErrorMessage(err, "Não foi possível carregar as carteiras."));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsLoadingMembers(false);
        }
      }
    };
    loadWallets();
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  useEffect(() => {
    if (!canManage && view === "create") {
      setView("list");
    }
  }, [canManage, view]);

  const totalWallets = wallets.length;
  const activeWallets = wallets.filter((wallet) => wallet.is_active).length;
  const linkedCases = wallets.reduce((sum, wallet) => sum + (wallet.case_count || 0), 0);
  const restrictedWallets = wallets.filter((wallet) => (wallet.team_member_ids?.length || 0) > 0).length;
  const nextWalletNumber = (wallets.length ? Math.max(...wallets.map((wallet) => wallet.number)) : 0) + 1;
  const editingWallet = editingWalletId ? wallets.find((wallet) => wallet.id === editingWalletId) || null : null;
  const selectableMembers = members
    .filter((member) => member.is_active || form.teamMemberIds.includes(member.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));

  const filteredWallets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return wallets;
    return wallets.filter((wallet) => {
      const accessNames = (wallet.team_members || []).map((member) => `${member.full_name} ${member.email}`).join(" ");
      return `${wallet.name} ${wallet.nickname} ${wallet.description || ""} ${accessNames}`.toLowerCase().includes(term);
    });
  }, [wallets, searchTerm]);

  const resetForm = () => {
    setEditingWalletId(null);
    setForm({ nickname: "", description: "", isActive: true, teamMemberIds: [] });
    setSaveError("");
  };

  const handleOpenCreateWallet = () => {
    setSaveSuccess("");
    resetForm();
    setView("create");
  };

  const toggleWalletMember = (memberId: number) => {
    setForm((prev) => ({
      ...prev,
      teamMemberIds: prev.teamMemberIds.includes(memberId)
        ? prev.teamMemberIds.filter((id) => id !== memberId)
        : [...prev.teamMemberIds, memberId]
    }));
  };

  const handleEditWallet = (wallet: ApiWallet) => {
    setSaveSuccess("");
    setEditingWalletId(wallet.id);
    setForm({
      nickname: wallet.nickname || "",
      description: wallet.description || "",
      isActive: wallet.is_active,
      teamMemberIds: [...(wallet.team_member_ids || [])]
    });
    setSaveError("");
    setView("create");
  };

  const handleSaveWallet = async () => {
    if (!canManage) {
      setSaveError("Você não tem permissão para gerenciar carteiras.");
      return;
    }
    if (!form.nickname.trim()) return;
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const payload = {
        nickname: form.nickname.trim(),
        description: form.description.trim() || undefined,
        is_active: form.isActive,
        team_member_ids: form.teamMemberIds
      };
      if (editingWalletId) {
        const updated = await apiUpdateWallet(editingWalletId, payload);
        setWallets((prev) => prev.map((wallet) => (wallet.id === updated.id ? updated : wallet)));
        setSaveSuccess("Carteira atualizada com sucesso.");
      } else {
        const created = await apiCreateWallet(payload);
        setWallets((prev) => [created, ...prev]);
        setSaveSuccess("Carteira criada com sucesso.");
      }
      resetForm();
      setView("list");
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, "Não foi possível salvar a carteira."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="content-card page-card wallets-page">
      <div className="wallets-panel">
        <div className="wallets-topbar">
          <div className="wallets-switch" role="tablist" aria-label="Modo de carteiras">
            <button
              type="button"
              className={`wallets-switch-btn ${view === "dashboard" ? "active" : ""}`}
              onClick={() => setView("dashboard")}
              aria-pressed={view === "dashboard"}
            >
              Resumo
            </button>
            <button
              type="button"
              className={`wallets-switch-btn ${view === "list" ? "active" : ""}`}
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
            >
              Visualizar
            </button>
            <button
              type="button"
              className={`wallets-switch-btn ${view === "create" ? "active" : ""}`}
              onClick={() => setView("create")}
              aria-pressed={view === "create"}
              disabled={!canManage}
            >
              Cadastrar
            </button>
          </div>
          <div className="processes-search wallets-search">
            <input
              placeholder="Pesquisar por nome ou apelido"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        {saveSuccess && <div className="success">{saveSuccess}</div>}

        {view === "dashboard" && (
          <div className="processes-dashboard">
            <div className="processes-dashboard-head">
              <div>
                <div className="processes-eyebrow">Carteiras</div>
                <h2>Visão consolidada</h2>
                <p>Controle de carteiras, processos vinculados e membros com acesso.</p>
              </div>
            </div>
            <div className="processes-kpi-grid">
              <button type="button" className="processes-kpi-card" onClick={() => setView("list")}>
                <div className="processes-kpi-title">Total de carteiras</div>
                <div className="processes-kpi-value">{totalWallets}</div>
                <div className="processes-kpi-hint">Criadas no sistema</div>
              </button>
              <button type="button" className="processes-kpi-card" onClick={() => setView("list")}>
                <div className="processes-kpi-title">Carteiras ativas</div>
                <div className="processes-kpi-value">{activeWallets}</div>
                <div className="processes-kpi-hint">Disponíveis para vínculo</div>
              </button>
              <button type="button" className="processes-kpi-card" onClick={() => setView("list")}>
                <div className="processes-kpi-title">Processos vinculados</div>
                <div className="processes-kpi-value">{linkedCases}</div>
                <div className="processes-kpi-hint">Distribuídos entre carteiras</div>
              </button>
              <button type="button" className="processes-kpi-card" onClick={() => setView("list")}>
                <div className="processes-kpi-title">Carteiras com acesso restrito</div>
                <div className="processes-kpi-value">{restrictedWallets}</div>
                <div className="processes-kpi-hint">Membros específicos vinculados</div>
              </button>
            </div>
          </div>
        )}

        {view === "list" && (
          <div className="processes-list">
            <div className="processes-list-head">
              <div>
                <div className="processes-eyebrow">Carteiras</div>
                <h2>Lista completa</h2>
              </div>
              <button className="btn secondary small" type="button" onClick={handleOpenCreateWallet} disabled={!canManage}>
                Nova carteira
              </button>
            </div>
            <div className="processes-table">
              <div className="wallets-table-row head">
                <div>Nome</div>
                <div>Apelido</div>
                <div>Acesso</div>
                <div>Processos</div>
                <div>Status</div>
                <div>Ações</div>
              </div>
              {isLoading ? (
                <div className="processes-empty">Carregando carteiras...</div>
              ) : filteredWallets.length === 0 ? (
                <div className="processes-empty">Nenhuma carteira cadastrada.</div>
              ) : (
                filteredWallets.map((wallet) => (
                  <div key={wallet.id} className="wallets-table-row">
                    <div>{wallet.name}</div>
                    <div>
                      <strong>{wallet.nickname}</strong>
                      <div className="wallets-row-sub">{wallet.description || "Sem descrição"}</div>
                    </div>
                    <div className="wallet-access-stack">
                      {(wallet.team_members || []).length === 0 ? (
                        <div className="wallet-access-empty">Somente master e administradores</div>
                      ) : (
                        (wallet.team_members || []).map((member) => (
                          <div key={member.id} className="wallet-access-badge">
                            {member.full_name}
                          </div>
                        ))
                      )}
                    </div>
                    <div>{wallet.case_count || 0}</div>
                    <div>{wallet.is_active ? "Ativa" : "Inativa"}</div>
                    <div className="wallets-row-actions">
                      {canManage && (
                        <button className="btn ghost small" type="button" onClick={() => handleEditWallet(wallet)}>
                          Editar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === "create" && canManage && (
          <div className="wallets-form-card">
            <div className="processes-eyebrow">Cadastro</div>
            <h2>{editingWalletId ? "Editar carteira" : "Nova carteira"}</h2>
            <div className="wallets-form-hint">
              Nome automático: sempre o último número + 1. O master e administradores sempre visualizam todas as carteiras.
            </div>
            <div className="modal-grid">
              <div className="field">
                <label>Nome da carteira</label>
                <input value={editingWallet?.name || `Carteira ${nextWalletNumber}`} readOnly />
              </div>
              <div className="field">
                <label>Apelido *</label>
                <input
                  value={form.nickname}
                  onChange={(event) => setForm((prev) => ({ ...prev, nickname: event.target.value }))}
                  placeholder="Ex: Cível SP"
                />
              </div>
              <div className="field span-2">
                <label>Descrição</label>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Detalhes da carteira"
                />
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  value={form.isActive ? "active" : "inactive"}
                  onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.value === "active" }))}
                >
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </select>
              </div>
              <div className="field span-2">
                <label>Membros com acesso</label>
                {isLoadingMembers ? (
                  <div className="wallet-access-empty">Carregando equipe...</div>
                ) : selectableMembers.length === 0 ? (
                  <div className="wallet-access-empty">Nenhum membro da equipe cadastrado.</div>
                ) : (
                  <div className="permissions-grid">
                    {selectableMembers.map((member) => (
                      <label key={member.id} className={`permission-item wallet-member-item ${!member.is_active ? "locked" : ""}`}>
                        <input
                          type="checkbox"
                          checked={form.teamMemberIds.includes(member.id)}
                          onChange={() => toggleWalletMember(member.id)}
                        />
                        <div>
                          <div className="wallet-member-name">{member.full_name}</div>
                          <div className="wallet-member-meta">
                            {member.team_name} · {member.role_title} · {member.is_active ? "Ativo" : "Inativo"}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div className="wallets-form-hint">
                  Se nenhum membro for marcado, a carteira fica visível apenas para o master e administradores.
                </div>
              </div>
            </div>
            {saveError && <div className="error">{saveError}</div>}
            <div className="modal-actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setSaveSuccess("");
                  resetForm();
                  setView("list");
                }}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button className="btn" type="button" onClick={handleSaveWallet} disabled={isSaving || !form.nickname.trim()}>
                {isSaving ? "Salvando..." : editingWalletId ? "Salvar alterações" : "Salvar carteira"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const teamRoleOptions = [
  "Advogado(a)",
  "Advogado(a) Sênior",
  "Coordenador(a) Jurídico",
  "Analista Jurídico",
  "Assistente Jurídico",
  "Paralegal",
  "Estagiário(a) Jurídico",
  "Atendimento",
  "Financeiro",
  "Administrativo"
] as const;

const buildEmptyTeamForm = () => ({
  fullName: "",
  email: "",
  phone: "",
  cpf: "",
  oabNumber: "",
  oabUf: "",
  roleTitle: "",
  teamName: "",
  notes: "",
  isAdmin: false,
  allowedNavKeys: [...defaultMemberNavKeys],
  isActive: true
});

type TeamForm = ReturnType<typeof buildEmptyTeamForm>;

const getTeamFormValidationMessage = (form: TeamForm) => {
  if (!form.fullName.trim()) {
    return "Informe o nome completo do membro.";
  }
  if (!form.email.trim()) {
    return "Informe o email do membro.";
  }
  if (!form.cpf.trim()) {
    return "Informe o CPF do membro.";
  }
  if (!isValidCpf(form.cpf)) {
    return "Informe um CPF válido.";
  }
  const hasAnyOabInput = Boolean(form.oabNumber.trim() || form.oabUf.trim());
  if (hasAnyOabInput && (form.oabNumber.trim().length !== 6 || !form.oabUf.trim())) {
    return "Informe os 6 números e a UF da OAB ou deixe ambos em branco.";
  }
  if (!form.roleTitle.trim()) {
    return "Informe o cargo do membro.";
  }
  if (!form.teamName.trim()) {
    return "Informe a equipe do membro.";
  }
  if (form.allowedNavKeys.length === 0) {
    return "Selecione ao menos um acesso para o membro.";
  }
  return "";
};

function Team({ canManage }: { canManage: boolean }) {
  type TeamView = "dashboard" | "list" | "create";
  const [view, setView] = useState<TeamView>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [members, setMembers] = useState<ApiTeamMember[]>([]);
  const [capacity, setCapacity] = useState<TeamMembersCapacity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resettingPasswordId, setResettingPasswordId] = useState<number | null>(null);
  const [form, setForm] = useState(buildEmptyTeamForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadMembers = async () => {
      setIsLoading(true);
      setError("");
      try {
        const [data, teamCapacity] = await Promise.all([
          apiListTeamMembers(undefined, { includeMasterAccounts: true }),
          apiGetTeamMembersCapacity().catch(() => null)
        ]);
        if (cancelled) return;
        setMembers(data);
        setCapacity(teamCapacity);
      } catch (err) {
        if (cancelled) return;
        setError(extractApiErrorMessage(err, "Não foi possível carregar a equipe."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadMembers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canManage && view === "create") {
      setView("list");
    }
  }, [canManage, view]);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatOabNumber = (value: string) => value.replace(/\D/g, "").slice(0, 6);
  const splitStoredOab = (value: string) => {
    const compact = value.trim().toUpperCase().replace(/\s+/g, "");
    const digits = compact.replace(/\D/g, "").slice(0, 6);
    const ufMatch = compact.match(/([A-Z]{2})$/);
    return {
      number: digits,
      uf: ufMatch?.[1] ?? ""
    };
  };

  const filteredMembers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => {
      const haystack =
        `${member.full_name} ${member.email} ${member.cpf} ${member.oab || ""} ${member.role_title} ${member.team_name} ${member.account_role || ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [members, searchTerm]);

  const totalMembers = members.length;
  const activeMembers = members.filter((member) => member.is_active).length;
  const teamsCount = new Set(members.map((member) => member.team_name.trim().toLowerCase()).filter(Boolean)).size;
  const activeUsers = capacity?.active_users ?? activeMembers;
  const userLimit = capacity?.user_limit ?? null;
  const availableSlots = capacity?.available_slots ?? null;
  const limitReached = typeof availableSlots === "number" && availableSlots <= 0;
  const teamValidationMessage = getTeamFormValidationMessage(form);
  const cpfInvalid = form.cpf.trim().length > 0 && !isValidCpf(form.cpf);
  const createBlockedByLimit = !editingId && form.isActive && limitReached;
  const availableRoleOptions = useMemo(() => {
    const currentRole = form.roleTitle.trim();
    if (!currentRole || teamRoleOptions.includes(currentRole as (typeof teamRoleOptions)[number])) {
      return [...teamRoleOptions];
    }
    return [...teamRoleOptions, currentRole];
  }, [form.roleTitle]);
  const editingMember = useMemo(
    () => (editingId ? members.find((member) => member.id === editingId) ?? null : null),
    [editingId, members]
  );
  const editingMasterAccount = Boolean(editingMember?.is_master_account);

  const refreshCapacity = async () => {
    try {
      const teamCapacity = await apiGetTeamMembersCapacity();
      setCapacity(teamCapacity);
    } catch {
      // Keep capacity as-is when endpoint is not available for this role/context.
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(buildEmptyTeamForm());
    setSaveError("");
  };

  const enforceAdminNavAccess = (keys: NavKey[], isAdmin: boolean): NavKey[] => {
    const normalized = normalizeNavKeys(keys);
    const withSettings = normalized.includes("settings") ? [...normalized] : [...normalized, "settings"];
    if (!isAdmin) return withSettings;
    const output = [...withSettings];
    for (const required of adminRequiredNavKeys) {
      if (!output.includes(required)) output.push(required);
    }
    return output;
  };

  const toggleAllowedNavKey = (key: NavKey) => {
    setForm((prev) => {
      const current = enforceAdminNavAccess(prev.allowedNavKeys, prev.isAdmin);
      const isRequiredAdminNav = prev.isAdmin && adminRequiredNavKeys.includes(key);
      if (isRequiredAdminNav) return { ...prev, allowedNavKeys: current };
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      return {
        ...prev,
        allowedNavKeys: enforceAdminNavAccess(next, prev.isAdmin)
      };
    });
  };

  const handleToggleAdmin = (checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      isAdmin: checked,
      allowedNavKeys: enforceAdminNavAccess(prev.allowedNavKeys, checked)
    }));
  };

  const handleSaveMember = async () => {
    if (!canManage) {
      setSaveError("Você não tem permissão para cadastrar membros.");
      return;
    }
    if (teamValidationMessage) {
      setSaveError(teamValidationMessage);
      return;
    }
    if (createBlockedByLimit) return;
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const normalizedOabNumber = form.oabNumber.trim();
      const normalizedOabUf = form.oabUf.trim().toUpperCase();
      const payload = {
        full_name: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        cpf: normalizeCpfDigits(form.cpf),
        oab: normalizedOabNumber && normalizedOabUf ? `${normalizedOabNumber}/${normalizedOabUf}` : "",
        role_title: form.roleTitle.trim(),
        team_name: form.teamName.trim(),
        notes: form.notes.trim() || undefined,
        is_admin: editingMasterAccount ? true : form.isAdmin,
        allowed_nav_keys: editingMasterAccount ? [...defaultMemberNavKeys] : form.allowedNavKeys,
        is_active: editingMasterAccount ? true : form.isActive
      };
      if (editingId) {
        const updated = await apiUpdateTeamMember(editingId, payload);
        setMembers((prev) => prev.map((member) => (member.id === editingId || member.id === updated.id ? updated : member)));
        setSaveSuccess("Membro atualizado com sucesso.");
      } else {
        const created = await apiCreateTeamMember(payload);
        setMembers((prev) => [created, ...prev]);
        if (created.invite_email_sent) {
          setSaveSuccess(`Membro criado e convite enviado para ${created.email}.`);
        } else if (created.invite_token) {
          setSaveSuccess(`Membro criado. Token de convite (dev): ${created.invite_token}`);
        } else {
          setSaveSuccess("Membro criado. Configure SMTP no VPS para envio automático de convite.");
        }
      }
      await refreshCapacity();
      resetForm();
      setView("list");
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, "Não foi possível salvar o membro da equipe."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditMember = (member: ApiTeamMember) => {
    if (member.is_read_only && !member.is_master_account) {
      setSaveError("A conta master aparece na equipe apenas para consulta.");
      setView("list");
      return;
    }
    setSaveSuccess("");
    setEditingId(member.id);
    const memberNavKeys = normalizeNavKeys(member.allowed_nav_keys);
    const baseNavKeys = memberNavKeys.length ? memberNavKeys : [...defaultMemberNavKeys];
    const parsedOab = splitStoredOab(member.oab || "");
    setForm({
      fullName: member.full_name || "",
      email: member.email || "",
      phone: member.phone || "",
      cpf: formatCpfFromDigits(member.cpf || ""),
      oabNumber: parsedOab.number,
      oabUf: parsedOab.uf,
      roleTitle: member.role_title || "",
      teamName: member.team_name || "",
      notes: member.notes || "",
      isAdmin: Boolean(member.is_admin),
      allowedNavKeys: enforceAdminNavAccess(baseNavKeys, Boolean(member.is_admin)),
      isActive: member.is_active
    });
    setSaveError("");
    setView("create");
  };

  const handleDeleteMember = async () => {
    if (!canManage) {
      setDeleteError("Você não tem permissão para excluir membros.");
      return;
    }
    if (!deleteId) return;
    const member = members.find((item) => item.id === deleteId);
    if (member?.is_master_account || member?.is_read_only) {
      setDeleteError("A conta master não pode ser excluída pela tela de equipe.");
      return;
    }
    setIsDeleting(true);
    setDeleteError("");
    try {
      await apiDeleteTeamMember(deleteId);
      setMembers((prev) => prev.filter((member) => member.id !== deleteId));
      await refreshCapacity();
      setDeleteId(null);
      if (editingId === deleteId) resetForm();
    } catch (err) {
      setDeleteError(extractApiErrorMessage(err, "Não foi possível excluir o membro da equipe."));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetMemberPassword = async (member: ApiTeamMember) => {
    if (!canManage) {
      setSaveError("Você não tem permissão para refazer senhas.");
      return;
    }
    if (member.is_read_only || member.is_master_account) {
      setSaveError("A conta master não pode ser alterada pela tela de equipe.");
      return;
    }
    setResettingPasswordId(member.id);
    setSaveError("");
    setSaveSuccess("");
    try {
      const result = await apiResetTeamMemberPassword(member.id);
      if (result.invite_email_sent) {
        setSaveSuccess(`Link de redefinição enviado para ${result.email}.`);
      } else if (result.invite_link) {
        setSaveSuccess(`Link de redefinição gerado para ${result.email}: ${result.invite_link}`);
      } else if (result.invite_token) {
        setSaveSuccess(`Token de redefinição gerado para ${result.email}: ${result.invite_token}`);
      } else {
        setSaveSuccess(`Senha refeita para ${result.email}. Configure SMTP no VPS para envio automático do link.`);
      }
    } catch (err) {
      const apiError = err as { response?: { status?: number } };
      if (apiError.response?.status === 404) {
        setSaveError("Esse recurso ainda não está disponível no servidor atual. Publique a API com a rota de redefinição de senha.");
      } else {
        setSaveError(extractApiErrorMessage(err, "Não foi possível refazer a senha do membro."));
      }
    } finally {
      setResettingPasswordId(null);
    }
  };

  return (
    <div className="content-card page-card wallets-page">
      <div className="wallets-panel">
        <div className="wallets-topbar">
          <div className="wallets-switch" role="tablist" aria-label="Modo de equipe">
            <button
              type="button"
              className={`wallets-switch-btn ${view === "dashboard" ? "active" : ""}`}
              onClick={() => setView("dashboard")}
              aria-pressed={view === "dashboard"}
            >
              Resumo
            </button>
            <button
              type="button"
              className={`wallets-switch-btn ${view === "list" ? "active" : ""}`}
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
            >
              Visualizar
            </button>
            <button
              type="button"
              className={`wallets-switch-btn ${view === "create" ? "active" : ""}`}
              onClick={() => setView("create")}
              aria-pressed={view === "create"}
              disabled={!canManage}
            >
              Cadastrar
            </button>
          </div>
          <div className="processes-search wallets-search">
            <input
              placeholder="Pesquisar por nome, CPF, OAB ou equipe"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {saveSuccess && <div className="success">{saveSuccess}</div>}

        {view === "dashboard" && (
          <div className="processes-dashboard">
            <div className="processes-dashboard-head">
              <div>
                <div className="processes-eyebrow">Equipe</div>
                <h2>Visão da equipe</h2>
                <p>Cadastre e gerencie quem atua no escritório.</p>
              </div>
            </div>
            <div className="processes-kpi-grid">
              <button type="button" className="processes-kpi-card" onClick={() => setView("list")}>
                <div className="processes-kpi-title">Total de pessoas</div>
                <div className="processes-kpi-value">{totalMembers}</div>
                <div className="processes-kpi-hint">Membros cadastrados</div>
              </button>
              <button type="button" className="processes-kpi-card" onClick={() => setView("list")}>
                <div className="processes-kpi-title">Ativos</div>
                <div className="processes-kpi-value">{activeUsers}</div>
                <div className="processes-kpi-hint">Usuários ativos com login</div>
              </button>
              <button type="button" className="processes-kpi-card" onClick={() => setView("list")}>
                <div className="processes-kpi-title">Limite do plano</div>
                <div className="processes-kpi-value">{userLimit ?? "∞"}</div>
                <div className="processes-kpi-hint">
                  {typeof availableSlots === "number" ? `${availableSlots} vagas disponíveis` : `${teamsCount} equipes cadastradas`}
                </div>
              </button>
            </div>
          </div>
        )}

        {view === "list" && (
          <div className="processes-list">
            <div className="processes-list-head">
              <div>
                <div className="processes-eyebrow">Equipe</div>
                <h2>Lista completa</h2>
              </div>
              <button
                className="btn secondary small"
                type="button"
                onClick={() => {
                  setSaveSuccess("");
                  resetForm();
                  setView("create");
                }}
                disabled={!canManage}
              >
                Novo membro
              </button>
            </div>
            <div className="processes-table">
              <div className="wallets-table-row team head">
                <div>Nome</div>
                <div>Equipe</div>
                <div>Cargo</div>
                <div>CPF</div>
                <div>OAB</div>
                <div>Status</div>
                <div>Ações</div>
              </div>
              {isLoading ? (
                <div className="processes-empty">Carregando equipe...</div>
              ) : filteredMembers.length === 0 ? (
                <div className="processes-empty">Nenhum membro cadastrado.</div>
              ) : (
                filteredMembers.map((member) => (
                  <div key={member.id} className="wallets-table-row team">
                    <div>
                      <strong>{member.full_name}</strong>
                      <div className="wallets-row-sub">{member.email}</div>
                      {member.is_master_account && <div className="wallets-row-sub">Conta master do escritório</div>}
                    </div>
                    <div>{member.team_name}</div>
                    <div>{member.role_title}</div>
                    <div>{formatCpfFromDigits(member.cpf)}</div>
                    <div>{member.oab || "OAB não cadastrada"}</div>
                    <div>
                      {member.is_active ? "Ativo" : "Inativo"}
                      {member.is_read_only && !member.is_master_account ? " · Somente leitura" : ""}
                    </div>
                    <div className="wallets-row-actions">
                      {canManage && (!member.is_read_only || member.is_master_account) ? (
                        <>
                          <button className="btn ghost small" type="button" onClick={() => handleEditMember(member)}>
                            Editar
                          </button>
                          {!member.is_master_account && (
                            <button className="btn danger small" type="button" onClick={() => setDeleteId(member.id)}>
                              Excluir
                            </button>
                          )}
                        </>
                      ) : member.is_master_account ? (
                        <span className="wallets-row-sub">Conta master</span>
                      ) : member.is_read_only ? (
                        <span className="wallets-row-sub">Somente leitura</span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === "create" && canManage && (
          <div className="wallets-form-card">
            <div className="processes-eyebrow">Equipe</div>
            <h2>{editingId ? "Editar membro" : "Cadastrar novo membro"}</h2>
            <div className="wallets-form-hint">
              Campos obrigatórios: Nome, Email, CPF, Cargo e Equipe. OAB é opcional.
              {typeof userLimit === "number" && (
                <> Limite de usuários ativos: {activeUsers}/{userLimit} (disponíveis: {availableSlots ?? 0}).</>
              )}
            </div>
            <div className="modal-grid">
              <div className="field">
                <label>Nome completo *</label>
                <input
                  value={form.fullName}
                  onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value.toUpperCase() }))}
                />
              </div>
              <div className="field">
                <label>Email *</label>
                <input
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value.toLowerCase() }))}
                />
              </div>
              <div className="field">
                <label>Telefone</label>
                <input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: formatPhone(event.target.value) }))} />
              </div>
              <div className="field">
                <label>CPF *</label>
                <input
                  value={form.cpf}
                  onChange={(event) => setForm((prev) => ({ ...prev, cpf: formatCpf(event.target.value) }))}
                  inputMode="numeric"
                />
                {cpfInvalid && <div className="error-inline">Informe um CPF válido.</div>}
              </div>
              <div className="field">
                <label>Número OAB</label>
                <input
                  value={form.oabNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, oabNumber: formatOabNumber(event.target.value) }))}
                  placeholder="347991"
                  inputMode="numeric"
                />
              </div>
              <div className="field">
                <label>UF da OAB</label>
                <select value={form.oabUf} onChange={(event) => setForm((prev) => ({ ...prev, oabUf: event.target.value }))}>
                  <option value="">Selecione</option>
                  {brazilUfOptions.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Cargo *</label>
                <select value={form.roleTitle} onChange={(event) => setForm((prev) => ({ ...prev, roleTitle: event.target.value }))}>
                  <option value="">Selecione</option>
                  {availableRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Equipe *</label>
                <input value={form.teamName} onChange={(event) => setForm((prev) => ({ ...prev, teamName: event.target.value }))} />
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  value={form.isActive ? "active" : "inactive"}
                  onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.value === "active" }))}
                  disabled={editingMasterAccount}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
              <div className="field span-2">
                <label>Observações</label>
                <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
              </div>
              <div className="field span-2">
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={form.isAdmin || editingMasterAccount}
                    disabled={editingMasterAccount}
                    onChange={(event) => handleToggleAdmin(event.target.checked)}
                  />
                  Administrador da equipe (pode cadastrar membros e criar carteiras)
                </label>
              </div>
              <div className="field span-2">
                <label>Acesso aos menus do software *</label>
                <div className="permissions-grid">
                  {navPermissionOptions.map((item) => {
                    const lockedByAdmin = form.isAdmin && adminRequiredNavKeys.includes(item.key);
                    return (
                      <label key={item.key} className={`permission-item ${lockedByAdmin ? "locked" : ""}`}>
                        <input
                          type="checkbox"
                          checked={form.allowedNavKeys.includes(item.key)}
                          disabled={lockedByAdmin}
                          onChange={() => toggleAllowedNavKey(item.key)}
                        />
                        <span>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            {saveError && <div className="error">{saveError}</div>}
            <div className="modal-actions">
              {editingMember && !editingMember.is_master_account && (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => handleResetMemberPassword(editingMember)}
                  disabled={isSaving || resettingPasswordId === editingMember.id}
                >
                  {resettingPasswordId === editingMember.id ? "Enviando link..." : "Refazer senha"}
                </button>
              )}
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setSaveSuccess("");
                  resetForm();
                  setView("list");
                }}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button className="btn" type="button" onClick={handleSaveMember} disabled={!!teamValidationMessage || isSaving || createBlockedByLimit}>
                {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar membro"}
              </button>
            </div>
            {createBlockedByLimit && <div className="error-inline">Limite de usuários ativos atingido para o plano atual.</div>}
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        open={deleteId !== null}
        title="Excluir membro da equipe"
        message="Essa ação não poderá ser desfeita."
        confirmLabel="Excluir membro"
        busy={isDeleting}
        errorMessage={deleteError}
        onCancel={() => {
          if (isDeleting) return;
          setDeleteId(null);
          setDeleteError("");
        }}
        onConfirm={handleDeleteMember}
      />
    </div>
  );
}

function ProfileAvatar({
  avatarDataUrl,
  label,
  size
}: {
  avatarDataUrl?: string | null;
  label: string;
  size: "sidebar" | "settings";
}) {
  const className = `profile-avatar ${size === "sidebar" ? "profile-avatar-sidebar" : "profile-avatar-settings"}`;
  if (avatarDataUrl) {
    return <img className={className} src={avatarDataUrl} alt={`Foto de ${label}`} />;
  }
  return (
    <div className={`${className} profile-avatar-fallback`} role="img" aria-label={`Avatar padrão de ${label}`}>
      <span className="profile-avatar-head" />
      <span className="profile-avatar-body" />
    </div>
  );
}

function Settings({
  theme,
  onThemeChange,
  textScaleIndex,
  onTextScaleChange,
  onLogout,
  user,
  profile,
  onSaveProfile,
  onPreviewProfile
}: {
  theme: ThemeMode;
  onThemeChange: (value: ThemeMode) => void;
  textScaleIndex: number;
  onTextScaleChange: (value: number) => void;
  onLogout: () => void;
  user: AuthUser | null;
  profile: UserProfilePreferences;
  onSaveProfile: (value: UserProfilePreferences) => UserProfilePreferences;
  onPreviewProfile: (value: UserProfilePreferences | null) => void;
}) {
  const runningInTauri = typeof window !== "undefined" && isTauri();
  const [appVersion, setAppVersion] = useState("0.1.8");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateMessage, setUpdateMessage] = useState("");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [calendarConnections, setCalendarConnections] = useState<CalendarConnectionStatus[]>([]);
  const [isLoadingCalendarConnections, setIsLoadingCalendarConnections] = useState(true);
  const [calendarConnectionsError, setCalendarConnectionsError] = useState("");
  const [calendarInlineMessage, setCalendarInlineMessage] = useState("");
  const [calendarAuthLink, setCalendarAuthLink] = useState<CalendarAuthLinkState | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<CalendarProvider | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<CalendarProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<CalendarProvider | null>(null);
  const [publicationSettings, setPublicationSettings] = useState<PublicationAutomationSettings | null>(null);
  const [publicationForm, setPublicationForm] = useState({ is_enabled: false, email_enabled: false, schedule_time: "06:00" });
  const [isLoadingPublicationSettings, setIsLoadingPublicationSettings] = useState(true);
  const [publicationSettingsError, setPublicationSettingsError] = useState("");
  const [publicationInlineMessage, setPublicationInlineMessage] = useState("");
  const [savingPublicationSettings, setSavingPublicationSettings] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [profileForm, setProfileForm] = useState<UserProfilePreferences>(profile);
  const [profileError, setProfileError] = useState("");
  const [profileInlineMessage, setProfileInlineMessage] = useState("");
  const profileFormRef = useRef<UserProfilePreferences>(profile);
  const linkedOfficeName = user?.organization_name?.trim() || MASTER_OFFICE_NAME;
  const linkedRoleTitle =
    user?.role_title?.trim() ||
    (user?.role === "superadmin" || user?.role === "owner" || user?.role === "admin" ? "Responsável master" : "Membro da equipe");

  const saveProfileAutomatically = (nextProfile: UserProfilePreferences, message = "") => {
    try {
      const savedProfile = onSaveProfile(nextProfile);
      setProfileForm(savedProfile);
      profileFormRef.current = savedProfile;
      onPreviewProfile(null);
      setProfileError("");
      setProfileInlineMessage(message);
      return savedProfile;
    } catch (error) {
      setProfileForm(nextProfile);
      profileFormRef.current = nextProfile;
      onPreviewProfile(nextProfile);
      setProfileInlineMessage("");
      setProfileError(extractRuntimeErrorMessage(error, "Não foi possível salvar o perfil automaticamente."));
      return nextProfile;
    }
  };

  useEffect(() => {
    setProfileForm(profile);
    profileFormRef.current = profile;
    onPreviewProfile(null);
  }, [profile, onPreviewProfile]);

  useEffect(() => {
    profileFormRef.current = profileForm;
  }, [profileForm]);

  useEffect(() => {
    if (!user || profileForm.phone.trim() || hasStoredProfilePhonePreference(user)) return;
    let cancelled = false;
    const userEmail = user.email.trim().toLowerCase();
    void apiListTeamMembers(undefined, { includeMasterAccounts: true })
      .then((members) => {
        if (cancelled || hasStoredProfilePhonePreference(user)) return;
        const matchedMember =
          members.find((member) => member.email.trim().toLowerCase() === userEmail) ||
          members.find((member) => member.is_master_account && member.organization_id === user.organization_id);
        const registeredPhone = matchedMember?.phone?.trim();
        if (!registeredPhone) return;
        const currentProfile = profileFormRef.current;
        if (currentProfile.phone.trim()) return;
        saveProfileAutomatically({
          ...currentProfile,
          phone: registeredPhone.slice(0, 32)
        });
      })
      .catch(() => {
        // The phone is only a convenience fallback; the profile remains editable if the team list is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [profileForm.phone, user]);

  useEffect(() => {
    return () => {
      onPreviewProfile(null);
    };
  }, [onPreviewProfile]);

  useEffect(() => {
    if (!runningInTauri) {
      setUpdateStatus("unavailable");
      setUpdateMessage("Atualização automática disponível apenas no app desktop.");
      return;
    }
    let cancelled = false;
    void getVersion()
      .then((version) => {
        if (!cancelled) setAppVersion(version);
      })
      .catch(() => {
        // Keep default version if API call fails.
      });
    return () => {
      cancelled = true;
    };
  }, [runningInTauri]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!calendarInlineMessage) return;
    const timeout = window.setTimeout(() => setCalendarInlineMessage(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [calendarInlineMessage]);

  useEffect(() => {
    if (!publicationInlineMessage) return;
    const timeout = window.setTimeout(() => setPublicationInlineMessage(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [publicationInlineMessage]);

  useEffect(() => {
    if (!profileInlineMessage) return;
    const timeout = window.setTimeout(() => setProfileInlineMessage(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [profileInlineMessage]);

  const handleProfileFieldChange =
    (field: keyof Omit<UserProfilePreferences, "avatarDataUrl">) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextProfile = {
        ...profileForm,
        [field]: event.target.value
      };
      saveProfileAutomatically(nextProfile);
    };

  const handleProfilePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const hasSupportedType = supportedProfilePhotoTypes.has(file.type);
    const lowerName = file.name.toLowerCase();
    const hasSupportedExtension = supportedProfilePhotoExtensions.some((extension) => lowerName.endsWith(extension));
    if ((!hasSupportedType && !hasSupportedExtension) || file.size > profilePhotoMaxSizeBytes) {
      setProfileError("Arquivo fora do padrão suportado. Envie uma imagem JPG, PNG ou WEBP com até 2 MB.");
      return;
    }
    try {
      const avatarDataUrl = await readFileAsDataUrl(file);
      const nextProfile = {
        ...profileForm,
        avatarDataUrl
      };
      saveProfileAutomatically(nextProfile, "Foto salva automaticamente.");
    } catch (error) {
      setProfileError(extractRuntimeErrorMessage(error, "Não foi possível carregar a foto do perfil."));
    }
  };

  const handleRemoveProfilePhoto = () => {
    const nextProfile = {
      ...profileForm,
      avatarDataUrl: ""
    };
    saveProfileAutomatically(nextProfile, "Foto removida automaticamente.");
  };

  const loadCalendarConnections = async () => {
    setIsLoadingCalendarConnections(true);
    setCalendarConnectionsError("");
    try {
      const data = await apiListCalendarConnections();
      setCalendarConnections(data);
    } catch (err) {
      setCalendarConnectionsError(extractApiErrorMessage(err, "Não foi possível carregar as integrações de calendário."));
    } finally {
      setIsLoadingCalendarConnections(false);
    }
  };

  const loadPublicationAutomation = async () => {
    setIsLoadingPublicationSettings(true);
    setPublicationSettingsError("");
    try {
      const data = await apiGetPublicationAutomationSettings();
      setPublicationSettings(data);
      setPublicationForm({
        is_enabled: data.is_enabled,
        email_enabled: data.is_enabled ? data.email_enabled : false,
        schedule_time: data.schedule_time || "06:00"
      });
    } catch (err) {
      const error = err as { response?: { status?: number } };
      if (error.response?.status === 404) {
        setPublicationSettingsError("Esse recurso ainda não está disponível no servidor atual. A automação foi implementada localmente, mas ainda precisa ser publicada na API principal.");
      } else {
        setPublicationSettingsError(extractApiErrorMessage(err, "Não foi possível carregar a automação de publicações."));
      }
    } finally {
      setIsLoadingPublicationSettings(false);
    }
  };

  useEffect(() => {
    void loadCalendarConnections();
  }, []);

  useEffect(() => {
    void loadPublicationAutomation();
  }, []);

  useEffect(() => {
    const handleOauthDone = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "newlaw-calendar-oauth") return;
      if (event.data.status === "success") {
        setCalendarInlineMessage("Conta conectada. Você já pode atualizar a agenda.");
        setCalendarAuthLink(null);
      } else {
        setCalendarConnectionsError("A conexão com o provedor não foi concluída.");
        setCalendarAuthLink(null);
      }
      setConnectingProvider(null);
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      void loadCalendarConnections();
    };
    window.addEventListener("message", handleOauthDone);
    return () => window.removeEventListener("message", handleOauthDone);
  }, []);

  const openCalendarAuthUrl = async (url: string) => {
    if (runningInTauri) {
      await openUrl(url);
      return;
    }
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      throw new Error("O navegador bloqueou a abertura automática.");
    }
  };

  const pollConnectionUntilReady = (provider: CalendarProvider) => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    const startedAt = Date.now();
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const statuses = await apiListCalendarConnections();
        setCalendarConnections(statuses);
        const connected = statuses.some((item) => item.provider === provider && item.connected);
        const timeoutReached = Date.now() - startedAt > 120000;
        if (!connected && !timeoutReached) return;
        if (pollIntervalRef.current) {
          window.clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setConnectingProvider(null);
        if (connected) {
          setCalendarAuthLink(null);
          setCalendarInlineMessage("Conta conectada. Você já pode atualizar a agenda.");
        } else {
          setCalendarInlineMessage("A conexão não foi concluída no tempo esperado. Se precisar, use o link abaixo para abrir a autenticação novamente.");
        }
      } catch {
        // A interface pode ser atualizada manualmente.
      }
    }, 3000);
  };

  const handleConnectProvider = async (provider: CalendarProvider) => {
    setConnectingProvider(provider);
    setCalendarConnectionsError("");
    setCalendarInlineMessage("");
    setCalendarAuthLink(null);
    try {
      const response = await apiStartCalendarConnection(provider);
      setCalendarAuthLink({ provider, url: response.auth_url });
      try {
        await openCalendarAuthUrl(response.auth_url);
        setCalendarInlineMessage(
          `Navegador aberto para concluir o login ${provider === "google" ? "Google" : "Microsoft"}. Se nada acontecer, use o link abaixo.`
        );
      } catch {
        setCalendarInlineMessage(
          `A autenticação ${provider === "google" ? "Google" : "Microsoft"} está pronta. Use o link abaixo para abrir no navegador.`
        );
      }
      pollConnectionUntilReady(provider);
    } catch (err) {
      setConnectingProvider(null);
      setCalendarConnectionsError(extractApiErrorMessage(err, `Não foi possível iniciar a conexão ${provider}.`));
    }
  };

  const handleSyncProvider = async (provider: CalendarProvider) => {
    setSyncingProvider(provider);
    setCalendarConnectionsError("");
    try {
      await apiSyncCalendarConnection(provider);
      setCalendarInlineMessage(`Agenda ${provider === "google" ? "Google" : "Microsoft"} sincronizada.`);
      await loadCalendarConnections();
    } catch (err) {
      setCalendarConnectionsError(extractApiErrorMessage(err, "Falha ao sincronizar o calendário externo."));
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleDisconnectProvider = async (provider: CalendarProvider) => {
    setDisconnectingProvider(provider);
    setCalendarConnectionsError("");
    try {
      await apiDisconnectCalendarConnection(provider);
      setCalendarAuthLink((current) => (current?.provider === provider ? null : current));
      setCalendarInlineMessage(`Conta ${provider === "google" ? "Google" : "Microsoft"} desconectada.`);
      await loadCalendarConnections();
    } catch (err) {
      setCalendarConnectionsError(extractApiErrorMessage(err, "Falha ao desconectar o calendário."));
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const savePublicationSettingsAutomatically = async (
    nextForm: typeof publicationForm,
    successMessage = "Configuração salva."
  ) => {
    setSavingPublicationSettings(true);
    setPublicationSettingsError("");
    try {
      const data = await apiUpdatePublicationAutomationSettings({
        is_enabled: nextForm.is_enabled,
        email_enabled: nextForm.is_enabled ? nextForm.email_enabled : false,
        schedule_time: nextForm.schedule_time
      });
      setPublicationSettings(data);
      setPublicationForm({
        is_enabled: data.is_enabled,
        email_enabled: data.is_enabled ? data.email_enabled : false,
        schedule_time: data.schedule_time
      });
      setPublicationInlineMessage(successMessage);
    } catch (err) {
      const error = err as { response?: { status?: number } };
      if (error.response?.status === 404) {
        setPublicationSettingsError("Esse recurso ainda não está disponível no servidor atual. A API principal ainda não recebeu a atualização de publicações automáticas.");
      } else {
        setPublicationSettingsError(extractApiErrorMessage(err, "Não foi possível salvar a automação de publicações."));
      }
    } finally {
      setSavingPublicationSettings(false);
    }
  };

  const handlePublicationScheduleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextForm = {
      ...publicationForm,
      schedule_time: event.target.value || "06:00"
    };
    setPublicationForm(nextForm);
    void savePublicationSettingsAutomatically(nextForm);
  };

  const handlePublicationDownloadToggle = () => {
    const willEnable = !publicationForm.is_enabled;
    const nextForm = {
      ...publicationForm,
      is_enabled: willEnable,
      email_enabled: willEnable ? publicationForm.email_enabled : false
    };
    setPublicationForm(nextForm);
    void savePublicationSettingsAutomatically(
      nextForm,
      willEnable ? "Download automático ativado." : "Download automático desativado."
    );
  };

  const handlePublicationEmailToggle = () => {
    if (!publicationForm.is_enabled) return;
    const willEnable = !publicationForm.email_enabled;
    const nextForm = {
      ...publicationForm,
      email_enabled: willEnable
    };
    setPublicationForm(nextForm);
    void savePublicationSettingsAutomatically(
      nextForm,
      willEnable ? "Envio por e-mail ativado." : "Envio por e-mail desativado."
    );
  };

  const calendarConnectionMap = useMemo(() => {
    return calendarConnections.reduce<Record<string, CalendarConnectionStatus>>((acc, connection) => {
      acc[connection.provider] = connection;
      return acc;
    }, {});
  }, [calendarConnections]);
  const publicationFeatureUnavailable = !publicationSettings && publicationSettingsError.toLowerCase().includes("não está disponível");
  const isPublicationBusy = isLoadingPublicationSettings || savingPublicationSettings || Boolean(publicationSettings?.is_running);

  const handleCheckForUpdates = async () => {
    if (!runningInTauri) return;
    setUpdateStatus("checking");
    setUpdateMessage("Verificando atualizações...");
    setDownloadProgress(null);
    setAvailableUpdate(null);
    try {
      const update = await check();
      if (!update) {
        setUpdateStatus("up-to-date");
        setUpdateMessage("Você já está com a versão mais recente.");
        return;
      }
      setAvailableUpdate(update);
      setUpdateStatus("available");
      setUpdateMessage(`Nova versão ${update.version} disponível.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível verificar atualizações.";
      setUpdateStatus("error");
      setUpdateMessage(message);
    }
  };

  const handleInstallUpdate = async () => {
    if (!runningInTauri || !availableUpdate) return;
    setInstallingUpdate(true);
    setDownloadProgress(0);
    setUpdateStatus("downloading");
    setUpdateMessage("Baixando atualização...");
    try {
      let downloaded = 0;
      let contentLength = 0;
      await availableUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            downloaded = 0;
            setDownloadProgress(0);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.min(100, Math.round((downloaded / contentLength) * 100)));
            }
            break;
          case "Finished":
            setUpdateStatus("installing");
            setUpdateMessage("Instalando atualização...");
            break;
        }
      });
      setUpdateStatus("installed");
      setUpdateMessage("Atualização instalada. Feche e abra o app para concluir.");
      setAvailableUpdate(null);
      setDownloadProgress(100);
    } catch (error) {
      const message = extractRuntimeErrorMessage(error, "Não foi possível instalar a atualização.");
      setUpdateStatus("error");
      setUpdateMessage(message);
    } finally {
      setInstallingUpdate(false);
    }
  };

  const canCheckUpdate = runningInTauri && updateStatus !== "checking" && !installingUpdate;
  const canInstallUpdate = runningInTauri && availableUpdate !== null && !installingUpdate;
  const updateStatusLabel =
    downloadProgress !== null && (updateStatus === "downloading" || updateStatus === "installing")
      ? `${updateMessage} (${downloadProgress}%)`
      : updateMessage;
  const updateStatusTone =
    updateStatus === "error"
      ? "error"
      : updateStatus === "available"
        ? "available"
        : updateStatus === "up-to-date" || updateStatus === "installed"
          ? "success"
          : "";

  return (
    <div className="content-card page-card settings-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Configurações</div>
          <h1 className="page-title">Preferências do sistema</h1>
        </div>
        <div className="theme-options settings-header-theme-options">
          <button
            type="button"
            className={`theme-option ${theme === "light" ? "active" : ""}`}
            onClick={() => onThemeChange("light")}
            aria-pressed={theme === "light"}
          >
            <span className="theme-dot light" aria-hidden="true" />
            Claro
          </button>
          <button
            type="button"
            className={`theme-option ${theme === "dark" ? "active" : ""}`}
            onClick={() => onThemeChange("dark")}
            aria-pressed={theme === "dark"}
          >
            <span className="theme-dot dark" aria-hidden="true" />
            Escuro
          </button>
        </div>
      </div>
      <div className="settings-grid">
        <div className="settings-card settings-profile-card">
          <div className="settings-row">
            <div>
              <div className="settings-title">Perfil</div>
            </div>
            <div className="pill">Conta master</div>
          </div>
          {profileError && (
            <div className="profile-upload-notice" role="alert">
              {profileError}
            </div>
          )}
          {profileInlineMessage && <div className="agenda-inline">{profileInlineMessage}</div>}
          <div className="settings-profile-layout">
            <div className="settings-profile-preview">
              <ProfileAvatar avatarDataUrl={profileForm.avatarDataUrl} label={linkedOfficeName} size="settings" />
              <div className="settings-profile-preview-copy">
                <strong>{linkedOfficeName}</strong>
                <span>{profileForm.displayName.trim() || user?.name || "Responsável da conta"}</span>
                <small>{linkedRoleTitle}</small>
              </div>
              <input
                ref={profilePhotoInputRef}
                className="settings-profile-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleProfilePhotoChange}
              />
              <div className="settings-profile-photo-actions">
                <button className="btn small" type="button" onClick={() => profilePhotoInputRef.current?.click()}>
                  Escolher foto
                </button>
                <button className="btn ghost small" type="button" onClick={handleRemoveProfilePhoto} disabled={!profileForm.avatarDataUrl}>
                  Remover foto
                </button>
              </div>
            </div>
            <div className="settings-profile-form">
              <div className="settings-profile-form-grid">
                <div className="field">
                  <label>Nome exibido</label>
                  <input
                    value={profileForm.displayName}
                    onChange={handleProfileFieldChange("displayName")}
                    placeholder="Responsável da conta"
                    maxLength={60}
                  />
                </div>
                <div className="field">
                  <label>Cargo cadastrado</label>
                  <input value={linkedRoleTitle} readOnly />
                </div>
                <div className="field">
                  <label>Telefone para contato</label>
                  <input
                    value={profileForm.phone}
                    onChange={handleProfileFieldChange("phone")}
                    placeholder="(00) 00000-0000"
                    maxLength={32}
                  />
                </div>
                <div className="field span-2">
                  <label>Sobre o perfil</label>
                  <textarea
                    value={profileForm.bio}
                    onChange={handleProfileFieldChange("bio")}
                    placeholder="Informações rápidas para identificar quem está usando a conta master."
                    maxLength={220}
                  />
                </div>
              </div>
              <div className="settings-profile-locked">
                <div className="settings-profile-locked-item">
                  <span>Escritório vinculado</span>
                  <strong>{linkedOfficeName}</strong>
                </div>
                <div className="settings-profile-locked-item">
                  <span>E-mail de acesso</span>
                  <strong>{user?.email || "usuario@newlaw.app.br"}</strong>
                </div>
                <div className="settings-profile-locked-item">
                  <span>Nível de acesso</span>
                  <strong>{linkedRoleTitle}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="settings-card">
          <div className="settings-row settings-row-scale">
            <div>
              <div className="settings-title">Tamanho do texto</div>
            </div>
            <div className="settings-scale-box">
              {textScaleOptions.map((option, index) => (
                <button
                  key={option.label}
                  type="button"
                  className={`settings-scale-option ${textScaleIndex === index ? "active" : ""}`}
                  onClick={() => onTextScaleChange(index)}
                  aria-pressed={textScaleIndex === index}
                  style={{ fontSize: `${option.previewSize}px` }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-title">Integrações de calendário</div>
              <div className="settings-sub">Conecte Google e Microsoft para exibir reuniões na agenda.</div>
            </div>
            <button className="btn ghost small" type="button" onClick={loadCalendarConnections} disabled={isLoadingCalendarConnections}>
              {isLoadingCalendarConnections ? "Atualizando..." : "Atualizar integrações"}
            </button>
          </div>
          {calendarConnectionsError && <div className="error">{calendarConnectionsError}</div>}
          {calendarInlineMessage && <div className="agenda-inline">{calendarInlineMessage}</div>}
          {calendarAuthLink && (
            <div className="agenda-inline-link">
              <div className="agenda-inline-link-title">
                Link da autenticação {calendarAuthLink.provider === "google" ? "Google" : "Microsoft"}
              </div>
              <div className="agenda-inline-link-actions">
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => void openCalendarAuthUrl(calendarAuthLink.url)}
                >
                  Abrir no navegador
                </button>
                <a
                  href={calendarAuthLink.url}
                  target="_blank"
                  rel="noreferrer"
                  className="agenda-inline-link-url"
                  onClick={(event) => {
                    event.preventDefault();
                    void openCalendarAuthUrl(calendarAuthLink.url);
                  }}
                >
                  {calendarAuthLink.url}
                </a>
              </div>
            </div>
          )}
          <div className="agenda-connections-list">
            {agendaProviders.map((config) => {
              const status = calendarConnectionMap[config.provider];
              const connected = Boolean(status?.connected);
              return (
                <div key={config.provider} className={`agenda-connection-item ${connected ? "connected" : ""}`}>
                  <div>
                    <div className="agenda-connection-title">{config.label}</div>
                    <div className="agenda-connection-sub">
                      {connected
                        ? `Conectado ${status?.provider_email ? `como ${status.provider_email}` : ""}`.trim()
                        : config.description}
                    </div>
                    {status?.sync_error && <div className="agenda-connection-error">{status.sync_error}</div>}
                  </div>
                  <div className="agenda-connection-actions">
                    {connected ? (
                      <>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => handleSyncProvider(config.provider)}
                          disabled={syncingProvider === config.provider || disconnectingProvider === config.provider}
                        >
                          {syncingProvider === config.provider ? "Sincronizando..." : "Sincronizar"}
                        </button>
                        <button
                          type="button"
                          className="btn ghost small danger"
                          onClick={() => handleDisconnectProvider(config.provider)}
                          disabled={disconnectingProvider === config.provider || syncingProvider === config.provider}
                        >
                          {disconnectingProvider === config.provider ? "Desconectando..." : "Desconectar"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => handleConnectProvider(config.provider)}
                        disabled={connectingProvider === config.provider}
                      >
                        {connectingProvider === config.provider ? "Aguardando login..." : `Conectar ${config.label}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="settings-note">
            As integrações são somente leitura. Criação e edição de reuniões continuam no Google/Outlook.
          </div>
        </div>
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-title">Publicações automáticas</div>
            </div>
          </div>
          {publicationSettingsError && <div className="error">{publicationSettingsError}</div>}
          {publicationInlineMessage && <div className="agenda-inline">{publicationInlineMessage}</div>}
          <div className="settings-publications-simple">
            <div className="field settings-field settings-publications-time">
              <label>Melhor horário para baixar</label>
              <input
                type="time"
                value={publicationForm.schedule_time}
                onChange={handlePublicationScheduleChange}
                disabled={isPublicationBusy || publicationFeatureUnavailable}
              />
            </div>
            <div className="settings-publications-toggle-row">
              <button
                className={`settings-publication-toggle ${publicationForm.is_enabled ? "active" : ""}`}
                type="button"
                onClick={handlePublicationDownloadToggle}
                disabled={isPublicationBusy || publicationFeatureUnavailable}
                aria-pressed={publicationForm.is_enabled}
              >
                Baixar automaticamente
              </button>
              <button
                className={`settings-publication-toggle ${publicationForm.email_enabled ? "active" : ""}`}
                type="button"
                onClick={handlePublicationEmailToggle}
                disabled={isPublicationBusy || publicationFeatureUnavailable || !publicationForm.is_enabled}
                aria-pressed={publicationForm.email_enabled}
              >
                Enviar por e-mail
              </button>
            </div>
          </div>
        </div>
        <div className="settings-card update-card">
          <div className="settings-title">Atualizações do sistema</div>
          <div className="update-shell">
            <div className="update-info">
              <img className="update-logo" src="/logo_new_law_teste.png" alt="NEWLAW" />
              <div>
                <div className="update-name">NEWLAW {appVersion}</div>
              </div>
            </div>
            <div className="update-actions">
              <div className="update-buttons">
                <button className="btn secondary small" type="button" onClick={handleCheckForUpdates} disabled={!canCheckUpdate}>
                  {updateStatus === "checking" ? "Verificando..." : "Verificar atualização"}
                </button>
                <button className="btn small" type="button" onClick={handleInstallUpdate} disabled={!canInstallUpdate}>
                  {installingUpdate ? "Instalando..." : "Baixar e instalar"}
                </button>
              </div>
              <div className={`update-status-line ${updateStatusTone}`} aria-live="polite">
                {updateStatusLabel || "\u00a0"}
              </div>
            </div>
          </div>
        </div>
        <div className="settings-logout-row">
          <button className="btn small settings-logout-button" type="button" onClick={onLogout}>
            Encerrar sessão
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [active, setActive] = useState<NavKey>("people");
  const sidebarCollapsed = true;
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profilePreferences, setProfilePreferences] = useState<UserProfilePreferences>(() => loadStoredProfilePreferences(null));
  const [profilePreview, setProfilePreview] = useState<UserProfilePreferences | null>(null);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState<"idle" | "ok" | "error" | "checking">("idle");
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem("newlaw-theme");
    return stored === "light" || stored === "dark" ? stored : "dark";
  });
  const [textScaleIndex, setTextScaleIndex] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const stored = Number(window.localStorage.getItem("newlaw-text-scale-index"));
    return Number.isFinite(stored) ? clampTextScaleIndex(stored) : 0;
  });
  const textScale = textScaleOptions[clampTextScaleIndex(textScaleIndex)]?.value ?? 1;
  const runningInTauri = typeof window !== "undefined" && isTauri();
  const usesLocalDesktopApi = runningInTauri && baseURL === LOCAL_API_BASE_URL;

  useEffect(() => {
    const session = loadAuthSession();
    if (!session) return;
    setToken(session.accessToken);
    setUser(session.user);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const syncAuthenticatedUser = async () => {
      try {
        const nextUser = await apiMe();
        if (cancelled) return;
        setUser(nextUser);
        const session = loadAuthSession();
        if (session?.accessToken === token) {
          saveAuthSession({ ...session, user: nextUser });
        }
      } catch {
        // Keep the locally restored session when the API is not reachable.
      }
    };
    void syncAuthenticatedUser();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("newlaw-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--newlaw-text-scale", String(textScale));
    window.localStorage.setItem("newlaw-text-scale-index", String(clampTextScaleIndex(textScaleIndex)));
  }, [textScale, textScaleIndex]);

  useEffect(() => {
    setProfilePreferences(loadStoredProfilePreferences(user));
    setProfilePreview(null);
  }, [user]);

  useEffect(() => {
    if (!usesLocalDesktopApi) return;
    let cancelled = false;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const ensureLocalBackend = async () => {
      try {
        await invoke("start_backend");
      } catch {
        // If the backend is already running or startup fails, the ping loop below confirms connectivity.
      }
      for (let attempt = 0; attempt < 12 && !cancelled; attempt += 1) {
        try {
          await ping();
          if (!cancelled) setApiStatus("ok");
          return;
        } catch {
          if (attempt < 11) await wait(350);
        }
      }
      if (!cancelled) setApiStatus("error");
    };
    void ensureLocalBackend();
    return () => {
      cancelled = true;
    };
  }, [usesLocalDesktopApi]);

  const navListRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const allowedNavKeys = useMemo(() => getEffectiveAllowedNavKeys(user), [user]);
  const visibleNavItems = useMemo(() => navItems.filter((item) => allowedNavKeys.includes(item.key)), [allowedNavKeys]);
  const canManageTeamAndWallets = Boolean(
    user && (user.role === "superadmin" || user.role === "owner" || user.role === "admin" || user.is_admin)
  );
  const activeNav = visibleNavItems.some((item) => item.key === active) ? active : (visibleNavItems[0]?.key ?? "settings");
  const effectiveProfilePreferences = profilePreview ?? profilePreferences;
  const sidebarDisplayName = effectiveProfilePreferences.displayName || user?.name || "Responsável da conta";
  const sidebarFooterName = (() => {
    const parts = sidebarDisplayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 2) return parts.join(" ");
    return `${parts[0]} ${parts[parts.length - 1]}`;
  })();
  const sidebarOfficeName = user?.organization_name?.trim() || MASTER_OFFICE_NAME;
  const sidebarRoleLabel =
    user?.role_title?.trim() ||
    (user?.role === "superadmin" || user?.role === "owner" || user?.role === "admin" ? "Responsável master" : "Membro da equipe");

  useEffect(() => {
    if (!token) return;
    const timeouts = new Map<EventTarget, number>();
    const attach = (element: HTMLElement | null) => {
      if (!element) return () => {};
      const handleScroll = () => {
        element.classList.add("is-scrolling");
        const existing = timeouts.get(element);
        if (existing) window.clearTimeout(existing);
        const timeout = window.setTimeout(() => {
          element.classList.remove("is-scrolling");
          timeouts.delete(element);
        }, 700);
        timeouts.set(element, timeout);
      };
      element.addEventListener("scroll", handleScroll, { passive: true });
      return () => {
        element.removeEventListener("scroll", handleScroll);
        const existing = timeouts.get(element);
        if (existing) window.clearTimeout(existing);
      };
    };
    const cleanupNav = attach(navListRef.current);
    const cleanupContent = attach(contentRef.current);
    return () => {
      cleanupNav();
      cleanupContent();
    };
  }, [token]);

  useEffect(() => {
    if (!token || !visibleNavItems.length) return;
    const isActiveVisible = visibleNavItems.some((item) => item.key === active);
    if (!isActiveVisible) {
      setActive(visibleNavItems[0].key);
    }
  }, [token, visibleNavItems, active]);

  const finishAuthSession = (data: { access_token: string; refresh_token: string; user: AuthUser }) => {
    setToken(data.access_token);
    setUser(data.user);
    saveAuthSession({ accessToken: data.access_token, refreshToken: data.refresh_token, user: data.user });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const data = await apiLogin(creds.username, creds.password);
      finishAuthSession(data);
    } catch (err) {
      setAuthError(extractApiErrorMessage(err, "Login inválido."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePing = async () => {
    setApiStatus("checking");
    setAuthError("");
    try {
      await ping();
      setApiStatus("ok");
    } catch (err) {
      setApiStatus("error");
      setAuthError(extractApiErrorMessage(err, "Não foi possível conectar à API."));
    }
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } finally {
      setIsAssistantOpen(false);
      clearAuthSession();
      setToken(null);
      setUser(null);
    }
  };

  const handleSaveProfile = (value: UserProfilePreferences) => {
    const normalized = normalizeProfilePreferences(value, user);
    setProfilePreferences(normalized);
    setProfilePreview(null);
    if (typeof window !== "undefined") {
      const storageKey = getProfileStorageKey(user);
      if (storageKey) {
        window.localStorage.setItem(storageKey, JSON.stringify(normalized));
      }
      window.localStorage.removeItem(PROFILE_STORAGE_KEY_PREFIX);
    }
    return normalized;
  };

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Entrar</h1>
          <p>Informe suas credenciais para acessar.</p>
          <form onSubmit={handleLogin}>
            <div className="field">
              <label>Usuário</label>
              <input
                value={creds.username}
                onChange={(event) => setCreds((current) => ({ ...current, username: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Senha</label>
              <input
                type="password"
                value={creds.password}
                onChange={(event) => setCreds((current) => ({ ...current, password: event.target.value }))}
              />
            </div>
            <div className="login-meta">
              <span>API: {baseURL}</span>
              <button className="btn ghost small" type="button" onClick={handlePing} disabled={apiStatus === "checking"}>
                {apiStatus === "checking" ? "Testando..." : "Testar API"}
              </button>
              {apiStatus === "ok" && <span className="status ok">OK</span>}
              {apiStatus === "error" && <span className="status error">Erro</span>}
            </div>

            {authError && <div className="error">{authError}</div>}

            <button className="btn" type="submit" disabled={authBusy}>
              {authBusy ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const render = () => {
    switch (activeNav) {
      case "home":
        return <Home user={user} />;
      case "dashboard":
        return <Dashboard />;
      case "people":
        return <People />;
      case "cases":
        return <Cases />;
      case "wallets":
        return <Wallets canManage={canManageTeamAndWallets} />;
      case "team":
        return <Team canManage={canManageTeamAndWallets} />;
      case "official":
        return <Publications user={user} />;
      case "settings":
        return (
          <Settings
            theme={theme}
            onThemeChange={setTheme}
            textScaleIndex={textScaleIndex}
            onTextScaleChange={setTextScaleIndex}
            onLogout={handleLogout}
            user={user}
            profile={profilePreferences}
            onSaveProfile={handleSaveProfile}
            onPreviewProfile={setProfilePreview}
          />
        );
      case "finance":
      case "billing":
        return <Finance />;
      case "agenda":
        return <Agenda />;
      case "progress":
        return <Progress />;
      case "service":
        return <Service user={user} />;
      case "templates":
        return <Placeholder title={navItems.find((n) => n.key === activeNav)?.label || "Em breve"} />;
      case "stats":
        return <StatisticsWorkbench />;
      case "files":
        return <Files />;
      default:
        return <Placeholder title="Dashboard" />;
    }
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-account">
            <ProfileAvatar avatarDataUrl={effectiveProfilePreferences.avatarDataUrl} label={sidebarOfficeName} size="sidebar" />
            <div className="brand">
              <span className="brand-full">{sidebarOfficeName}</span>
              <span className="brand-meta">{sidebarRoleLabel}</span>
            </div>
          </div>
        </div>
        <div className="section-label">Ferramentas</div>
        <div className="nav-list scroll-area" ref={navListRef}>
          {visibleNavItems.map((item) => (
            <button
              key={item.key}
              className={`nav-btn ${activeNav === item.key ? "active" : ""}`}
              onClick={() => setActive(item.key)}
              title={item.label}
            >
              <span className="nav-icon" aria-hidden="true">
                {navIcons[item.key]}
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-user">{sidebarFooterName}</div>
          <button
            className={`sidebar-ai-trigger ${isAssistantOpen ? "active" : ""}`}
            type="button"
            onClick={() => setIsAssistantOpen((current) => !current)}
            aria-label={isAssistantOpen ? "Fechar NewLaw AI" : "Abrir NewLaw AI"}
            aria-haspopup="dialog"
            aria-expanded={isAssistantOpen}
            title="NewLaw AI"
          >
            <img className="sidebar-logo" src="/logo_new_law_teste.png" alt="NewLaw AI" />
          </button>
        </div>
      </aside>
      <main className="content scroll-area" ref={contentRef}>
        {render()}
      </main>
      <NewLawAssistantModal open={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} userName={sidebarDisplayName} />
    </div>
  );
}

export default App;
