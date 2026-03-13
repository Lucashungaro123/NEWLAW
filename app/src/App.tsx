import { useEffect, useMemo, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  AgendaItem,
  AuthUser,
  ApiCase,
  ApiClient,
  ApiTeamMember,
  ApiWallet,
  CalendarConnectionStatus,
  CalendarProvider,
  TeamMembersCapacity,
  baseURL,
  createAgendaDeadline as apiCreateAgendaDeadline,
  createTeamMember as apiCreateTeamMember,
  createWallet as apiCreateWallet,
  clearAuthSession,
  createCase as apiCreateCase,
  createClient as apiCreateClient,
  deleteAgendaDeadline as apiDeleteAgendaDeadline,
  deleteTeamMember as apiDeleteTeamMember,
  deleteCase as apiDeleteCase,
  deleteClient as apiDeleteClient,
  disconnectCalendarConnection as apiDisconnectCalendarConnection,
  getTeamMembersCapacity as apiGetTeamMembersCapacity,
  listAgendaEvents as apiListAgendaEvents,
  listCalendarConnections as apiListCalendarConnections,
  listTeamMembers as apiListTeamMembers,
  listCases as apiListCases,
  listClients as apiListClients,
  listWallets as apiListWallets,
  startCalendarConnection as apiStartCalendarConnection,
  syncCalendarConnection as apiSyncCalendarConnection,
  updateTeamMember as apiUpdateTeamMember,
  updateCase as apiUpdateCase,
  updateClient as apiUpdateClient,
  loadAuthSession,
  login as apiLogin,
  logout as apiLogout,
  ping,
  saveAuthSession
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
type ThemeMode = "dark" | "light";
type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "installing" | "installed" | "up-to-date" | "error" | "unavailable";

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
  { key: "reports", label: "Relatórios" },
  { key: "stats", label: "Estatísticas" },
  { key: "official", label: "Publicações" },
  { key: "progress", label: "Andamentos" },
  { key: "files", label: "Arquivos" },
  { key: "settings", label: "Configurações" }
];

const navPermissionOptions = navItems.map((item) => ({ key: item.key, label: item.label }));
const defaultMemberNavKeys = navPermissionOptions.map((item) => item.key);
const adminRequiredNavKeys: NavKey[] = ["team", "wallets"];

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
  reports: (
    <svg className="nav-svg" {...navIconProps} aria-hidden="true">
      <path d="M2 20h20" />
      <path d="M6 20V10" />
      <path d="M12 20V4" />
      <path d="M18 20v-8" />
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

type FinanceEntryType = "receita" | "despesa";
type FinancePaymentMethod = "" | "pix" | "boleto" | "cartao" | "dinheiro" | "transferencia";
type FinanceStatus = "Pago" | "A vencer" | "Vencido" | "Parcial";
type FinanceRecurring = "nao-recorrente" | "mensal" | "anual" | "personalizado";

type RevenueForm = {
  category: string;
  client: string;
  process: string;
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

type FinanceEntry = {
  id: number;
  entryType: FinanceEntryType;
  category: string;
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
  client: "",
  process: "",
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

const financeMonths = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

const formatCurrencyBRL = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value : 0);

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
  if (entry.entryType === "receita") {
    if (entry.paymentDate) return "Pago";
    return overdue ? "Vencido" : "A vencer";
  }
  const paidAmount = entry.paidAmount || 0;
  if (paidAmount >= entry.amount && entry.amount > 0) return "Pago";
  if (paidAmount > 0 && paidAmount < entry.amount) return "Parcial";
  return overdue ? "Vencido" : "A vencer";
};

const seedFinanceEntries: FinanceEntry[] = [];

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
  if (document) {
    if (kind === "PF") {
      form.cpf = document;
      form.cnpj = "";
    } else {
      form.cnpj = document;
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

const extractApiErrorMessage = (err: unknown, fallback: string) => {
  const error = err as {
    response?: { status?: number; data?: { detail?: string } };
    message?: string;
  };
  if (error.response?.status === 401) {
    return "Sessão expirada. Faça login novamente.";
  }
  if (error.response?.status === 405) {
    return "API no VPS desatualizada para este cadastro (405). Atualize e reinicie o backend.";
  }
  if (error.response?.data?.detail) {
    return error.response.data.detail;
  }
  const raw = (error.message || "").toLowerCase();
  if (raw.includes("network") || raw.includes("failed to fetch")) {
    return `Sem conexão com a API (${baseURL}).`;
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

const getEffectiveAllowedNavKeys = (user: AuthUser | null): NavKey[] => {
  if (!user) return [];
  const isPlatformAdmin = user.role === "superadmin" || user.role === "owner" || user.role === "admin";
  if (isPlatformAdmin) return [...defaultMemberNavKeys];
  const keys = normalizeNavKeys(user.allowed_nav_keys);
  const base = keys.length ? [...keys] : [...defaultMemberNavKeys];
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

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 11)];
    if (digits.length <= 3) return parts[0];
    if (digits.length <= 6) return `${parts[0]}.${parts[1]}`;
    if (digits.length <= 9) return `${parts[0]}.${parts[1]}.${parts[2]}`;
    return `${parts[0]}.${parts[1]}.${parts[2]}-${parts[3]}`;
  };

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
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

  const cepDigits = (form.cep || "").replace(/\D/g, "");
  const isPerson = form.kind === "PF";
  const requiredMissing =
    !form.name.trim() || (isPerson ? form.cpf.trim().length === 0 : form.cnpj.trim().length === 0);
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
                <label>Estado civil</label>
                <select value={form.marital} onChange={(e) => onChange("marital", e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Solteiro">Solteiro</option>
                  <option value="Solteira">Solteira</option>
                  <option value="Casado">Casado</option>
                  <option value="Casada">Casada</option>
                  <option value="Viúvo">Viúvo</option>
                  <option value="Viúva">Viúva</option>
                  <option value="União estável">União estável</option>
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
          <button className="btn" type="button" onClick={onSave} disabled={requiredMissing || saving}>
            {saving ? "Salvando..." : saveLabel || "Salvar"}
          </button>
        </div>
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
  form: typeof emptyCaseForm;
  wallets?: ApiWallet[];
  saving?: boolean;
  errorMessage?: string;
  onChange: (key: keyof typeof emptyCaseForm, value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2 className="modal-title">Cliente: {clientName}</h2>
        <div className="modal-grid">
          <div className="field">
            <label>Processo</label>
            <input value={form.process} onChange={(e) => onChange("process", e.target.value)} />
          </div>
          <div className="field">
            <label>Carteira</label>
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
            <label>Vara</label>
            <input value={form.court} onChange={(e) => onChange("court", e.target.value)} />
          </div>
          <div className="field">
            <label>Comarca</label>
            <input value={form.region} onChange={(e) => onChange("region", e.target.value)} />
          </div>
          <div className="field">
            <label>Processos associados</label>
            <input value={form.associated} onChange={(e) => onChange("associated", e.target.value)} />
          </div>
          <div className="field">
            <label>Parte contrária</label>
            <input value={form.counterparty} onChange={(e) => onChange("counterparty", e.target.value)} />
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
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Observações</label>
            <textarea value={form.notes} onChange={(e) => onChange("notes", e.target.value)} />
          </div>
        </div>
        {errorMessage && <div className="error">{errorMessage}</div>}
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="button" onClick={onSave} disabled={saving || !form.process.trim()}>
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
        <div className="modal-note">Essa ação não poderá ser desfeita.</div>
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
  const [showAddProcess, setShowAddProcess] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [editClientId, setEditClientId] = useState<number | null>(null);
  const [editClientForm, setEditClientForm] = useState<ClientForm>(emptyClientForm);
  const [caseForm, setCaseForm] = useState(emptyCaseForm);
  const [cepError, setCepError] = useState("");
  const [editCepError, setEditCepError] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isUpdatingClient, setIsUpdatingClient] = useState(false);
  const [isDeletingClient, setIsDeletingClient] = useState(false);
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [pageError, setPageError] = useState("");
  const [saveClientError, setSaveClientError] = useState("");
  const [updateClientError, setUpdateClientError] = useState("");
  const [deleteClientError, setDeleteClientError] = useState("");
  const [saveCaseError, setSaveCaseError] = useState("");
  const [wallets, setWallets] = useState<ApiWallet[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadClients = async () => {
      setIsLoadingClients(true);
      setPageError("");
      try {
        const [data, walletData] = await Promise.all([apiListClients(), apiListWallets()]);
        if (cancelled) return;
        setApiClients(data);
        setWallets(walletData);
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

  const selectedClient = clients.find((c) => c.id === selectedId);
  const selectedApiClient = apiClients.find((c) => c.id === selectedId);
  const selectedClientForm = selectedApiClient ? toClientForm(selectedApiClient) : emptyClientForm;

  const handleSaveClient = async () => {
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

  const handleSaveCase = async () => {
    if (!selectedClient || !caseForm.process.trim()) return;
    setIsSavingCase(true);
    setSaveCaseError("");
    try {
      const counterparty = caseForm.counterparty.trim() || "Parte contrária";
      await apiCreateCase({
        number: caseForm.process.trim(),
        title: `${selectedClient.name} x ${counterparty}`,
        client_id: selectedClient.id,
        wallet_id: caseForm.walletId ? Number(caseForm.walletId) : undefined,
        status: "aberto",
        forum: caseForm.region.trim() || undefined,
        court: caseForm.court.trim() || undefined
      });
      setCaseForm(emptyCaseForm);
      setShowAddProcess(false);
    } catch (err) {
      setSaveCaseError(extractApiErrorMessage(err, "Não foi possível salvar o processo na API."));
    } finally {
      setIsSavingCase(false);
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
            <button
              className="btn secondary"
              disabled={!selectedClient || isLoadingClients}
              onClick={() => {
                setSaveCaseError("");
                setShowAddProcess(true);
              }}
            >
              Cadastrar processo
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
      <AddProcessModal
        open={showAddProcess}
        clientName={selectedClient?.name}
        form={caseForm}
        wallets={wallets}
        saving={isSavingCase}
        errorMessage={saveCaseError}
        onChange={(key, value) => {
          if (saveCaseError) setSaveCaseError("");
          setCaseForm((prev) => ({ ...prev, [key]: value }));
        }}
        onClose={() => {
          if (isSavingCase) return;
          setShowAddProcess(false);
          setCaseForm(emptyCaseForm);
          setSaveCaseError("");
        }}
        onSave={handleSaveCase}
      />
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

function Finance() {
  const [entries, setEntries] = useState<FinanceEntry[]>(seedFinanceEntries);
  const [searchTerm, setSearchTerm] = useState("");
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [inlineMessage, setInlineMessage] = useState("");
  const [revenueForm, setRevenueForm] = useState<RevenueForm>(emptyRevenueForm);
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm);

  useEffect(() => {
    if (!inlineMessage) return;
    const timeout = window.setTimeout(() => setInlineMessage(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [inlineMessage]);

  const revenueEntries = useMemo(() => entries.filter((entry) => entry.entryType === "receita"), [entries]);
  const expenseEntries = useMemo(() => entries.filter((entry) => entry.entryType === "despesa"), [entries]);

  const expectedRevenue = useMemo(
    () => revenueEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [revenueEntries]
  );
  const receivedRevenue = useMemo(
    () => revenueEntries.reduce((sum, entry) => sum + (entry.paymentDate ? entry.amount : 0), 0),
    [revenueEntries]
  );
  const overdueRevenue = useMemo(
    () =>
      revenueEntries.reduce((sum, entry) => {
        if (entry.paymentDate) return sum;
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
      if (entry.paymentDate) return false;
      const days = daysFromToday(entry.dueDate);
      return days >= 0 && days <= 7;
    }).length;
  }, [revenueEntries]);

  const overdueClientsCount = useMemo(() => {
    const unique = new Set<string>();
    revenueEntries.forEach((entry) => {
      if (entry.paymentDate) return;
      if (getFinanceStatus(entry) === "Vencido" && entry.client.trim()) {
        unique.add(entry.client.trim().toLowerCase());
      }
    });
    return unique.size;
  }, [revenueEntries]);

  const receiptRate = expectedRevenue > 0 ? Math.round((receivedRevenue / expectedRevenue) * 100) : 0;
  const annualResult = receivedRevenue - totalExpenses;

  const chartData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const expectedByMonth = Array.from({ length: 12 }, () => 0);
    const receivedByMonth = Array.from({ length: 12 }, () => 0);
    const expenseByMonth = Array.from({ length: 12 }, () => 0);

    entries.forEach((entry) => {
      const dueDate = toDateStart(entry.dueDate);
      if (!dueDate || dueDate.getFullYear() !== currentYear) return;
      const monthIndex = dueDate.getMonth();
      if (entry.entryType === "receita") {
        expectedByMonth[monthIndex] += entry.amount;
        if (entry.paymentDate) receivedByMonth[monthIndex] += entry.amount;
      } else {
        expenseByMonth[monthIndex] += entry.amount;
      }
    });

    return financeMonths.map((label, index) => ({
      label,
      expected: expectedByMonth[index],
      received: receivedByMonth[index],
      expense: expenseByMonth[index]
    }));
  }, [entries]);

  const chartMax = useMemo(() => {
    const values = chartData.flatMap((item) => [item.expected, item.received, item.expense]);
    return Math.max(1, ...values);
  }, [chartData]);
  const toBarHeight = (value: number) => (value > 0 ? `${(value / chartMax) * 100}%` : "0%");

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

  const periodRevenue = useMemo(
    () =>
      filteredEntries.reduce((sum, entry) => {
        if (entry.entryType !== "receita") return sum;
        return sum + entry.amount;
      }, 0),
    [filteredEntries]
  );

  const periodExpense = useMemo(
    () =>
      filteredEntries.reduce((sum, entry) => {
        if (entry.entryType !== "despesa") return sum;
        return sum + entry.amount;
      }, 0),
    [filteredEntries]
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

  const handleSaveRevenue = () => {
    const amount = parseCurrencyBRL(revenueForm.amount);
    if (!revenueForm.category || amount <= 0) return;
    const newEntry: FinanceEntry = {
      id: Date.now(),
      entryType: "receita",
      category: revenueForm.category,
      client: revenueForm.client.trim() || "Não informado",
      process: revenueForm.process.trim(),
      amount,
      dueDate: revenueForm.dueDate || toIsoDateWithOffset(0),
      paymentDate: revenueForm.paymentDate || undefined,
      paymentMethod: revenueForm.paymentMethod || undefined,
      attachmentName: revenueForm.attachmentName || undefined
    };
    setEntries((prev) => [newEntry, ...prev]);
    setRevenueForm(emptyRevenueForm);
    setShowRevenueModal(false);
  };

  const handleSaveExpense = () => {
    const amount = parseCurrencyBRL(expenseForm.amount);
    const paidAmount = parseCurrencyBRL(expenseForm.paidAmount);
    if (!expenseForm.expenseType || !expenseForm.category || amount <= 0) return;
    const installments = Number(expenseForm.installments) || 1;
    const newEntry: FinanceEntry = {
      id: Date.now(),
      entryType: "despesa",
      expenseType: expenseForm.expenseType,
      category: expenseForm.category,
      client: expenseForm.client.trim() || "Escritório",
      process: expenseForm.process.trim(),
      amount,
      dueDate: expenseForm.dueDate || toIsoDateWithOffset(0),
      recurring: expenseForm.recurring,
      paidAmount: paidAmount > 0 ? paidAmount : undefined,
      installments,
      attachmentName: expenseForm.attachmentName || undefined
    };
    setEntries((prev) => [newEntry, ...prev]);
    setExpenseForm(emptyExpenseForm);
    setShowExpenseModal(false);
  };

  return (
    <div className="content-card page-card finance-page">
      <div className="finance-shell">
        <div className="page-header finance-header">
          <div>
            <div className="eyebrow">Financeiro</div>
            <h1 className="page-title">Gerencie receitas, despesas, previsibilidade e inadimplência com visão estratégica.</h1>
          </div>
          <div className="pill">Atualizado em tempo real</div>
        </div>

        {inlineMessage && <div className="finance-inline-note">{inlineMessage}</div>}

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

        <section className="finance-chart-card">
          <div className="finance-chart-head">
            <div className="finance-chart-title">Previsão anual</div>
            <div className="finance-chart-result">
              Resultado anual: <strong>{formatCurrencyBRL(annualResult)}</strong>
            </div>
          </div>

          <div className="finance-chart-grid">
            {chartData.map((item) => (
              <div key={item.label} className="finance-chart-month">
                <div className="finance-chart-bars">
                  <span className="bar prevista" style={{ height: toBarHeight(item.expected) }} />
                  <span className="bar recebida" style={{ height: toBarHeight(item.received) }} />
                  <span className="bar despesa" style={{ height: toBarHeight(item.expense) }} />
                </div>
                <div className="finance-chart-label">{item.label}</div>
              </div>
            ))}
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
          </div>
        </section>

        <section className="finance-table-card">
          <div className="finance-table-head">
            <div>
              <div className="finance-table-title">Controle Financeiro</div>
              <div className="finance-table-sub">Exibindo {Math.min(filteredEntries.length, 25)} de {entries.length} lançamentos</div>
            </div>
            <div className="finance-table-filters">
              <input
                placeholder="Pesquisar cliente, categoria, processo ou método"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <button className="btn secondary small" type="button" onClick={() => setSearchTerm("")}>
                Limpar
              </button>
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
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9}>Nenhum lançamento encontrado.</td>
                  </tr>
                ) : (
                  filteredEntries.slice(0, 25).map((entry) => {
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
                      <tr key={entry.id}>
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
                          <button className="finance-row-action" type="button" aria-label="Ações do lançamento">
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
                  setShowRevenueModal(false);
                  setRevenueForm(emptyRevenueForm);
                }}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="modal-note">Campos obrigatórios: Categoria e Valor.</div>
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
                <label>Cliente/pessoa</label>
                <input
                  value={revenueForm.client}
                  onChange={(event) => setRevenueForm((prev) => ({ ...prev, client: event.target.value }))}
                  placeholder="Campo pesquisável"
                />
              </div>
              <div className="field">
                <label>Processo</label>
                <input
                  value={revenueForm.process}
                  onChange={(event) => setRevenueForm((prev) => ({ ...prev, process: event.target.value }))}
                  placeholder="Número do processo"
                />
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
                  setShowRevenueModal(false);
                  setRevenueForm(emptyRevenueForm);
                }}
              >
                Cancelar
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleSaveRevenue}
                disabled={!revenueForm.category || parseCurrencyBRL(revenueForm.amount) <= 0}
              >
                Salvar receita
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
                  setShowExpenseModal(false);
                  setExpenseForm(emptyExpenseForm);
                }}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
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
                  setShowExpenseModal(false);
                  setExpenseForm(emptyExpenseForm);
                }}
              >
                Cancelar
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleSaveExpense}
                disabled={!expenseForm.expenseType || !expenseForm.category || parseCurrencyBRL(expenseForm.amount) <= 0}
              >
                Salvar despesa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Home() {
  const quickPrompts = [
    "Quais prazos vencem esta semana?",
    "Resumo do processo do Cliente X",
    "Intimações recebidas hoje",
    "Prazos urgentes nas próximas 48h"
  ];

  return (
    <div className="content-card page-card home-card">
      <div className="page-header home-header">
        <div>
          <div className="eyebrow">Home</div>
          <h1 className="page-title">Central inteligente do escritório</h1>
          <div className="page-subtitle">Pergunte sobre prazos e publicações sem sair do painel.</div>
        </div>
        <div className="pill">Preview</div>
      </div>
      <div className="home-ai">
        <div className="home-ai-header">
          <div className="home-ai-icon" aria-hidden="true">
            <svg
              className="home-ai-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3l1.8 4.7L18 9.2l-4.2 1.5L12 16l-1.8-5.3L6 9.2l4.2-1.5L12 3z" />
              <path d="M19 13l.9 2.3L22 16l-2.1.7L19 19l-.9-2.3L16 16l2.1-.7L19 13z" />
            </svg>
          </div>
          <div>
            <div className="home-ai-title">NewLaw AI</div>
            <div className="home-ai-subtitle">Assistente jurídico inteligente</div>
          </div>
        </div>
        <div className="home-ai-panel">
          <div className="home-ai-bubble">
            Olá! Sou o assistente inteligente do NewLaw. Me diga o período ou o cliente e eu retorno os prazos.
          </div>
          <div className="home-ai-empty">
            <div className="home-ai-empty-title">Sem consultas ainda</div>
            <div className="home-ai-empty-subtitle">
              Quando você perguntar, a resposta aparece aqui com datas e processos.
            </div>
          </div>
        </div>
        <div className="home-ai-suggestions">
          {quickPrompts.map((prompt) => (
            <button key={prompt} className="home-ai-chip" type="button">
              {prompt}
            </button>
          ))}
        </div>
        <div className="home-ai-input">
          <input aria-label="Pergunta para a IA" placeholder="Pergunte algo sobre seus prazos..." />
          <button className="home-ai-send" type="button" aria-label="Enviar pergunta">
            <svg
              className="home-ai-send-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

type Publication = {
  id: number;
  title: string;
  publicationDate: string;
  deadlineDays: number;
  deadlineDate: string;
};

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

function Publications() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [form, setForm] = useState({ title: "", publicationDate: "", deadlineDays: "" });
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const deadlinePreview = useMemo(() => {
    if (!form.publicationDate || form.deadlineDays === "") return "";
    const days = Number(form.deadlineDays);
    if (Number.isNaN(days)) return "";
    const baseDate = parseLocalDate(form.publicationDate);
    const deadline = new Date(baseDate);
    deadline.setDate(deadline.getDate() + days);
    return formatIsoDate(deadline);
  }, [form.deadlineDays, form.publicationDate]);

  const deadlinesByDate = useMemo(() => {
    return publications.reduce<Record<string, Publication[]>>((acc, publication) => {
      acc[publication.deadlineDate] = acc[publication.deadlineDate] || [];
      acc[publication.deadlineDate].push(publication);
      return acc;
    }, {});
  }, [publications]);

  const orderedDeadlines = useMemo(() => {
    return [...publications].sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate));
  }, [publications]);

  const handleAddPublication = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.publicationDate || !deadlinePreview) return;
    const deadlineDays = Number(form.deadlineDays);
    if (Number.isNaN(deadlineDays)) return;
    const deadlineMonth = parseLocalDate(deadlinePreview);
    setPublications((prev) => [
      {
        id: Date.now(),
        title: form.title.trim(),
        publicationDate: form.publicationDate,
        deadlineDays,
        deadlineDate: deadlinePreview
      },
      ...prev
    ]);
    setMonth(new Date(deadlineMonth.getFullYear(), deadlineMonth.getMonth(), 1));
    setForm((prev) => ({ ...prev, title: "" }));
  };

  const monthLabel = month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const todayKey = formatIsoDate(new Date());

  return (
    <div className="content-card page-card publications-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Publicações</div>
          <h1 className="page-title">Calendário de prazos</h1>
          <div className="page-subtitle">Cadastre publicações e acompanhe automaticamente os prazos no calendário.</div>
        </div>
        <div className="pill">Publicações</div>
      </div>

      <div className="publications-grid">
        <div className="publication-card">
          <div className="publication-title">Nova publicação</div>
          <form className="publication-form" onSubmit={handleAddPublication}>
            <div className="field">
              <label>Título</label>
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Ex: Intimação processo 1234"
              />
            </div>
            <div className="field">
              <label>Data da publicação</label>
              <input
                type="date"
                value={form.publicationDate}
                onChange={(event) => setForm((prev) => ({ ...prev, publicationDate: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>Prazo (dias)</label>
              <input
                type="number"
                min={0}
                value={form.deadlineDays}
                onChange={(event) => setForm((prev) => ({ ...prev, deadlineDays: event.target.value }))}
                placeholder="Ex: 5"
              />
            </div>
            <div className="publication-actions">
              <div className="deadline-preview">
                Prazo final: <strong>{deadlinePreview ? formatBrazilDate(deadlinePreview) : "--/--/----"}</strong>
              </div>
              <button className="btn" type="submit" disabled={!form.title.trim() || !form.publicationDate || !deadlinePreview}>
                Adicionar publicação
              </button>
            </div>
          </form>

          <div className="publication-list">
            <div className="publication-title">Prazos cadastrados</div>
            {orderedDeadlines.length === 0 ? (
              <div className="publication-empty">Nenhuma publicação cadastrada.</div>
            ) : (
              orderedDeadlines.map((publication) => (
                <div key={publication.id} className="publication-item">
                  <div>
                    <div className="publication-name">{publication.title}</div>
                    <div className="publication-meta">
                      Publicação {formatBrazilDate(publication.publicationDate)} · Prazo {formatBrazilDate(publication.deadlineDate)}
                    </div>
                  </div>
                  <span className="publication-tag">{publication.deadlineDays}d</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="calendar-card">
          <div className="calendar-head">
            <div className="calendar-title">{monthTitle}</div>
            <div className="calendar-actions">
              <button type="button" className="btn ghost" onClick={() => setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
                Anterior
              </button>
              <button type="button" className="btn ghost" onClick={() => setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
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
              const deadlines = deadlinesByDate[dateKey] || [];
              const hasDeadline = deadlines.length > 0;
              return (
                <div
                  key={dateKey}
                  className={`calendar-cell ${hasDeadline ? "has-deadline" : ""} ${dateKey === todayKey ? "today" : ""}`}
                >
                  <div className="calendar-day">{dayNumber}</div>
                  {hasDeadline && <div className="calendar-count">{deadlines.length} prazo{deadlines.length > 1 ? "s" : ""}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
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

const agendaSourceLabel = (source: string) => {
  if (source === "internal") return "Prazo interno";
  if (source === "google") return "Google";
  if (source === "microsoft") return "Microsoft";
  return source;
};

const formatAgendaTime = (value: string, isAllDay: boolean) => {
  if (isAllDay) return "Dia inteiro";
  const date = new Date(value);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [deadlineForm, setDeadlineForm] = useState({ title: "", dueDate: formatIsoDate(new Date()), reference: "", notes: "" });

  useEffect(() => {
    if (!inlineMessage) return;
    const timeout = window.setTimeout(() => setInlineMessage(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [inlineMessage]);

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
      if (sourceFilter === "all") return true;
      if (sourceFilter === "internal") return item.source === "internal";
      return item.source === sourceFilter;
    });
  }, [events, sourceFilter, typeFilter]);

  const eventCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredEvents.forEach((event) => {
      const start = new Date(event.starts_at);
      const end = new Date(event.ends_at);
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cursor <= endDay) {
        const key = formatIsoDate(cursor);
        counts[key] = (counts[key] || 0) + 1;
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return counts;
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

  const handleCreateDeadline = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deadlineForm.title.trim() || !deadlineForm.dueDate) return;
    setSavingDeadline(true);
    setError("");
    try {
      await apiCreateAgendaDeadline({
        title: deadlineForm.title.trim(),
        due_date: deadlineForm.dueDate,
        reference: deadlineForm.reference.trim() || undefined,
        notes: deadlineForm.notes.trim() || undefined
      });
      const dueDate = parseLocalDate(deadlineForm.dueDate);
      const dueMonth = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
      setMonth(dueMonth);
      setSelectedDate(deadlineForm.dueDate);
      setDeadlineForm((prev) => ({ ...prev, title: "", reference: "", notes: "" }));
      setInlineMessage("Prazo cadastrado com sucesso.");
      await loadAgendaData(dueMonth);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Não foi possível salvar o prazo."));
    } finally {
      setSavingDeadline(false);
    }
  };

  const handleDeleteDeadline = async (eventItem: AgendaItem) => {
    if (eventItem.kind !== "deadline") return;
    try {
      await apiDeleteAgendaDeadline(eventItem.entity_id);
      setInlineMessage("Prazo removido.");
      await loadAgendaData(month);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Não foi possível remover o prazo."));
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
                const count = eventCountByDate[dateKey] || 0;
                const isSelected = dateKey === selectedDate;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    className={`calendar-cell agenda-day-btn ${count > 0 ? "has-deadline" : ""} ${dateKey === todayKey ? "today" : ""} ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedDate(dateKey);
                      setDeadlineForm((prev) => ({ ...prev, dueDate: dateKey }));
                    }}
                  >
                    <div className="calendar-day">{dayNumber}</div>
                    {count > 0 && <div className="calendar-count">{count} item{count > 1 ? "s" : ""}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="publication-card agenda-deadline-card">
            <div className="publication-title">Novo prazo interno</div>
            <form className="publication-form agenda-deadline-form" onSubmit={handleCreateDeadline}>
              <div className="field">
                <label>Título *</label>
                <input
                  value={deadlineForm.title}
                  onChange={(event) => setDeadlineForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Ex: Contrarrazões do processo AP-002"
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
                  placeholder="Detalhes do prazo"
                />
              </div>
              <div className="publication-actions">
                <div className="deadline-preview">
                  Data selecionada: <strong>{formatBrazilDate(deadlineForm.dueDate || selectedDate)}</strong>
                </div>
                <button className="btn" type="submit" disabled={!deadlineForm.title.trim() || !deadlineForm.dueDate || savingDeadline}>
                  {savingDeadline ? "Salvando..." : "Salvar prazo"}
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
                  <option value="internal">Somente prazos</option>
                  <option value="google">Google</option>
                  <option value="microsoft">Microsoft</option>
                </select>
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | "deadline" | "meeting")}>
                  <option value="all">Todos tipos</option>
                  <option value="deadline">Prazos</option>
                  <option value="meeting">Reuniões</option>
                </select>
              </div>
            </div>

            {isLoading ? (
              <div className="publication-empty">Carregando agenda...</div>
            ) : selectedDayEvents.length === 0 ? (
              <div className="publication-empty">Nenhum compromisso para o dia selecionado.</div>
            ) : (
              <div className="publication-list agenda-event-list">
                {selectedDayEvents.map((item) => (
                  <div key={item.id} className={`publication-item agenda-event-item ${item.kind}`}>
                    <div>
                      <div className="publication-name">{item.title}</div>
                      <div className="publication-meta">
                        {formatAgendaTime(item.starts_at, item.is_all_day)} · {agendaSourceLabel(item.source)}
                        {item.reference ? ` · ${item.reference}` : ""}
                      </div>
                      {item.location && <div className="publication-meta">Local: {item.location}</div>}
                      {item.meeting_url && (
                        <a className="agenda-meeting-link" href={item.meeting_url} target="_blank" rel="noreferrer">
                          Entrar na reunião
                        </a>
                      )}
                    </div>
                    <div className="agenda-event-side">
                      <span className={`publication-tag agenda-tag ${item.kind}`}>{item.kind === "deadline" ? "Prazo" : "Reunião"}</span>
                      {item.kind === "deadline" && (
                        <button type="button" className="link-btn danger" onClick={() => handleDeleteDeadline(item)}>
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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
                  <div key={`upcoming-${item.id}`} className="publication-item agenda-upcoming-item">
                    <div>
                      <div className="publication-name">{item.title}</div>
                      <div className="publication-meta">
                        {new Date(item.starts_at).toLocaleDateString("pt-BR")} · {formatAgendaTime(item.starts_at, item.is_all_day)} ·{" "}
                        {agendaSourceLabel(item.source)}
                      </div>
                    </div>
                    <span className={`publication-tag agenda-tag ${item.kind}`}>{item.kind === "deadline" ? "Prazo" : "Reunião"}</span>
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
    action: entry.court?.trim() || "Ação judicial",
    area: entry.court?.trim().toUpperCase() || "GERAL",
    number: entry.number,
    forum: entry.forum?.trim() || "-",
    lawyer: "-",
    rawStatus: entry.status || "aberto",
    status: normalizeCaseStatus(entry.status)
  };
};

function Cases() {
  type ProcessView = "dashboard" | "list" | "detail" | "create";
  type ProcessDetailKey =
    | "area"
    | "comarca"
    | "tribunal"
    | "instancia"
    | "rito"
    | "carteira"
    | "encerramento"
    | "acordo"
    | "valor";

  const [view, setView] = useState<ProcessView>("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCaseId, setActiveCaseId] = useState(0);
  const [detailKey, setDetailKey] = useState<ProcessDetailKey>("area");
  const [caseRows, setCaseRows] = useState<CaseRow[]>([]);
  const [clientsById, setClientsById] = useState<Map<number, string>>(new Map());
  const [wallets, setWallets] = useState<ApiWallet[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [casesError, setCasesError] = useState("");
  const [showEditCase, setShowEditCase] = useState(false);
  const [editCaseForm, setEditCaseForm] = useState(emptyCaseForm);
  const [editCaseId, setEditCaseId] = useState<number | null>(null);
  const [isUpdatingCase, setIsUpdatingCase] = useState(false);
  const [updateCaseError, setUpdateCaseError] = useState("");
  const [showDeleteCaseConfirm, setShowDeleteCaseConfirm] = useState(false);
  const [isDeletingCase, setIsDeletingCase] = useState(false);
  const [deleteCaseError, setDeleteCaseError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadCases = async () => {
      setIsLoadingCases(true);
      setCasesError("");
      try {
        const [cases, clients, walletData] = await Promise.all([apiListCases(), apiListClients(), apiListWallets()]);
        if (cancelled) return;
        const clientsById = new Map<number, string>();
        clients.forEach((client) => {
          clientsById.set(client.id, client.name);
        });
        setClientsById(clientsById);
        setWallets(walletData);
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
    if (!caseRows.some((row) => row.id === activeCaseId)) {
      setActiveCaseId(caseRows[0].id);
    }
  }, [caseRows, activeCaseId]);

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

  const selectedCase = caseRows.find((row) => row.id === activeCaseId) ?? caseRows[0] ?? null;

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
    },
    {
      id: "acordo",
      title: "Acordo",
      items: ["Procedente", "Parcialmente procedente", "Improcedente", "Acordo favoravel", "Acordo desfavoravel"]
    },
    {
      id: "valor",
      title: "Valor final",
      items: ["Valor da causa", "Valor acordado/condenacao", "Situacao de pagamento"]
    }
  ];

  const activeDetail = detailSections.find((section) => section.id === detailKey) ?? detailSections[0];

  const handleSelectCase = (id: number) => {
    setActiveCaseId(id);
    setView("detail");
  };

  const handleStartEditCase = () => {
    if (!selectedCase) return;
    setEditCaseId(selectedCase.id);
    setEditCaseForm({
      process: selectedCase.number || "",
      walletId: selectedCase.walletId ? String(selectedCase.walletId) : "",
      court: selectedCase.action === "Ação judicial" ? "" : selectedCase.action,
      region: selectedCase.forum === "-" ? "" : selectedCase.forum,
      associated: "",
      counterparty: selectedCase.counterparty === "-" ? "" : selectedCase.counterparty,
      counterLawyer: "",
      oab: "",
      contact: "",
      notes: ""
    });
    setUpdateCaseError("");
    setShowEditCase(true);
  };

  const handleUpdateCase = async () => {
    if (!selectedCase || !editCaseId || !editCaseForm.process.trim()) return;
    setIsUpdatingCase(true);
    setUpdateCaseError("");
    try {
      const payload = {
        number: editCaseForm.process.trim(),
        title: `${selectedCase.client} x ${editCaseForm.counterparty.trim() || "Parte contrária"}`,
        client_id: selectedCase.clientId,
        wallet_id: editCaseForm.walletId ? Number(editCaseForm.walletId) : undefined,
        status: selectedCase.rawStatus || "aberto",
        forum: editCaseForm.region.trim() || undefined,
        court: editCaseForm.court.trim() || undefined
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
                    Data de distribuicao: xx/xx/xxxx · Ultima alteracao: xx/xx/xxxx
                  </div>
                </div>
                <div className="processes-detail-side">
                  <span className="processes-status-pill">{selectedCase.status}</span>
                  <div className="processes-detail-bubble">Aparece no site do TJ, se esta no sistema e ativo.</div>
                </div>
              </div>
              <div className="processes-detail-lines">
                <div>Polo ativo: {selectedCase.client}</div>
                <div>Polo passivo: {selectedCase.counterparty}</div>
                <div>Carteira: {selectedCase.walletName || "-"}</div>
                <div>Valor da causa: XXXX,XX</div>
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
              <div className="processes-detail-actions">
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
                <div className="processes-eyebrow">Cadastro</div>
                <h2>Novo processo</h2>
                <p>Escolha um cliente, informe dados basicos e salve para acompanhamento automatico.</p>
                <button className="btn" type="button" onClick={() => setView("dashboard")}>
                  Voltar ao resumo
                </button>
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState({ nickname: "", description: "", isActive: true });

  useEffect(() => {
    let cancelled = false;
    const loadWallets = async () => {
      setIsLoading(true);
      setError("");
      try {
        const data = await apiListWallets();
        if (cancelled) return;
        setWallets(data);
      } catch (err) {
        if (cancelled) return;
        setError(extractApiErrorMessage(err, "Não foi possível carregar as carteiras."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadWallets();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canManage && view === "create") {
      setView("list");
    }
  }, [canManage, view]);

  const totalWallets = wallets.length;
  const activeWallets = wallets.filter((wallet) => wallet.is_active).length;
  const linkedCases = wallets.reduce((sum, wallet) => sum + (wallet.case_count || 0), 0);
  const nextWalletNumber = (wallets.length ? Math.max(...wallets.map((wallet) => wallet.number)) : 0) + 1;

  const filteredWallets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return wallets;
    return wallets.filter((wallet) => `${wallet.name} ${wallet.nickname}`.toLowerCase().includes(term));
  }, [wallets, searchTerm]);

  const handleCreateWallet = async () => {
    if (!canManage) {
      setSaveError("Você não tem permissão para criar carteiras.");
      return;
    }
    if (!form.nickname.trim()) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const created = await apiCreateWallet({
        nickname: form.nickname.trim(),
        description: form.description.trim() || undefined,
        is_active: form.isActive
      });
      setWallets((prev) => [created, ...prev]);
      setForm({ nickname: "", description: "", isActive: true });
      setView("list");
    } catch (err) {
      setSaveError(extractApiErrorMessage(err, "Não foi possível cadastrar a carteira."));
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

        {view === "dashboard" && (
          <div className="processes-dashboard">
            <div className="processes-dashboard-head">
              <div>
                <div className="processes-eyebrow">Carteiras</div>
                <h2>Visão consolidada</h2>
                <p>Controle de carteiras e seus processos vinculados.</p>
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
              <button className="btn secondary small" type="button" onClick={() => setView("create")} disabled={!canManage}>
                Nova carteira
              </button>
            </div>
            <div className="processes-table">
              <div className="wallets-table-row head">
                <div>Nome</div>
                <div>Apelido</div>
                <div>Descrição</div>
                <div>Processos</div>
                <div>Status</div>
              </div>
              {isLoading ? (
                <div className="processes-empty">Carregando carteiras...</div>
              ) : filteredWallets.length === 0 ? (
                <div className="processes-empty">Nenhuma carteira cadastrada.</div>
              ) : (
                filteredWallets.map((wallet) => (
                  <div key={wallet.id} className="wallets-table-row">
                    <div>{wallet.name}</div>
                    <div>{wallet.nickname}</div>
                    <div>{wallet.description || "-"}</div>
                    <div>{wallet.case_count || 0}</div>
                    <div>{wallet.is_active ? "Ativa" : "Inativa"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === "create" && canManage && (
          <div className="wallets-form-card">
            <div className="processes-eyebrow">Cadastro</div>
            <h2>Nova carteira</h2>
            <div className="wallets-form-hint">Nome automático: sempre o último número + 1.</div>
            <div className="modal-grid">
              <div className="field">
                <label>Nome da carteira</label>
                <input value={`Carteira ${nextWalletNumber}`} readOnly />
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
            </div>
            {saveError && <div className="error">{saveError}</div>}
            <div className="modal-actions">
              <button className="btn ghost" type="button" onClick={() => setView("list")} disabled={isSaving}>
                Cancelar
              </button>
              <button className="btn" type="button" onClick={handleCreateWallet} disabled={isSaving || !form.nickname.trim()}>
                {isSaving ? "Salvando..." : "Salvar carteira"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const buildEmptyTeamForm = () => ({
  fullName: "",
  email: "",
  phone: "",
  cpf: "",
  oab: "",
  roleTitle: "",
  teamName: "",
  notes: "",
  isAdmin: false,
  allowedNavKeys: [...defaultMemberNavKeys],
  isActive: true
});

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
          apiListTeamMembers(),
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

  const normalizeCpfDigits = (value: string) => value.replace(/\D/g, "").slice(0, 11);

  const formatCpf = (value: string) => {
    const digits = normalizeCpfDigits(value);
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 11)];
    if (digits.length <= 3) return parts[0];
    if (digits.length <= 6) return `${parts[0]}.${parts[1]}`;
    if (digits.length <= 9) return `${parts[0]}.${parts[1]}.${parts[2]}`;
    return `${parts[0]}.${parts[1]}.${parts[2]}-${parts[3]}`;
  };

  const formatCpfFromDigits = (digitsValue: string) => {
    return formatCpf(digitsValue.replace(/\D/g, ""));
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatOab = (value: string) => value.toUpperCase().replace(/[^A-Z0-9/\-.\s]/g, "").slice(0, 20);

  const filteredMembers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => {
      const haystack =
        `${member.full_name} ${member.email} ${member.cpf} ${member.oab} ${member.role_title} ${member.team_name}`.toLowerCase();
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

  const requiredMissing =
    !form.fullName.trim() ||
    !form.email.trim() ||
    normalizeCpfDigits(form.cpf).length !== 11 ||
    !form.oab.trim() ||
    !form.roleTitle.trim() ||
    !form.teamName.trim() ||
    form.allowedNavKeys.length === 0;
  const createBlockedByLimit = !editingId && form.isActive && limitReached;

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
    if (requiredMissing || createBlockedByLimit) return;
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const payload = {
        full_name: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        cpf: normalizeCpfDigits(form.cpf),
        oab: form.oab.trim().toUpperCase(),
        role_title: form.roleTitle.trim(),
        team_name: form.teamName.trim(),
        notes: form.notes.trim() || undefined,
        is_admin: form.isAdmin,
        allowed_nav_keys: form.allowedNavKeys,
        is_active: form.isActive
      };
      if (editingId) {
        const updated = await apiUpdateTeamMember(editingId, payload);
        setMembers((prev) => prev.map((member) => (member.id === updated.id ? updated : member)));
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
    setSaveSuccess("");
    setEditingId(member.id);
    const memberNavKeys = normalizeNavKeys(member.allowed_nav_keys);
    const baseNavKeys = memberNavKeys.length ? memberNavKeys : [...defaultMemberNavKeys];
    setForm({
      fullName: member.full_name || "",
      email: member.email || "",
      phone: member.phone || "",
      cpf: formatCpfFromDigits(member.cpf || ""),
      oab: member.oab || "",
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
                    </div>
                    <div>{member.team_name}</div>
                    <div>{member.role_title}</div>
                    <div>{formatCpfFromDigits(member.cpf)}</div>
                    <div>{member.oab}</div>
                    <div>{member.is_active ? "Ativo" : "Inativo"}</div>
                    <div className="wallets-row-actions">
                      {canManage && (
                        <>
                          <button className="btn ghost small" type="button" onClick={() => handleEditMember(member)}>
                            Editar
                          </button>
                          <button className="btn danger small" type="button" onClick={() => setDeleteId(member.id)}>
                            Excluir
                          </button>
                        </>
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
            <div className="processes-eyebrow">Equipe</div>
            <h2>{editingId ? "Editar membro" : "Cadastrar novo membro"}</h2>
            <div className="wallets-form-hint">
              Campos obrigatórios: Nome, Email, CPF, OAB, Cargo e Equipe.
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
              </div>
              <div className="field">
                <label>OAB *</label>
                <input value={form.oab} onChange={(event) => setForm((prev) => ({ ...prev, oab: formatOab(event.target.value) }))} />
              </div>
              <div className="field">
                <label>Cargo *</label>
                <input value={form.roleTitle} onChange={(event) => setForm((prev) => ({ ...prev, roleTitle: event.target.value }))} />
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
                  <input type="checkbox" checked={form.isAdmin} onChange={(event) => handleToggleAdmin(event.target.checked)} />
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
              <button className="btn" type="button" onClick={handleSaveMember} disabled={requiredMissing || isSaving || createBlockedByLimit}>
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

function Settings({
  theme,
  onThemeChange,
  onLogout
}: {
  theme: ThemeMode;
  onThemeChange: (value: ThemeMode) => void;
  onLogout: () => void;
}) {
  const runningInTauri = typeof window !== "undefined" && isTauri();
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateMessage, setUpdateMessage] = useState("Clique em verificar atualização.");
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [calendarConnections, setCalendarConnections] = useState<CalendarConnectionStatus[]>([]);
  const [isLoadingCalendarConnections, setIsLoadingCalendarConnections] = useState(true);
  const [calendarConnectionsError, setCalendarConnectionsError] = useState("");
  const [calendarInlineMessage, setCalendarInlineMessage] = useState("");
  const [connectingProvider, setConnectingProvider] = useState<CalendarProvider | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<CalendarProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<CalendarProvider | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

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

  useEffect(() => {
    void loadCalendarConnections();
  }, []);

  useEffect(() => {
    const handleOauthDone = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "newlaw-calendar-oauth") return;
      if (event.data.status === "success") {
        setCalendarInlineMessage("Conta conectada. Você já pode atualizar a agenda.");
      } else {
        setCalendarConnectionsError("A conexão com o provedor não foi concluída.");
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
          setCalendarInlineMessage("Conta conectada. Você já pode atualizar a agenda.");
        } else {
          setCalendarInlineMessage("A conexão não foi concluída no tempo esperado.");
        }
      } catch {
        // A interface pode ser atualizada manualmente.
      }
    }, 3000);
  };

  const handleConnectProvider = async (provider: CalendarProvider) => {
    setConnectingProvider(provider);
    setCalendarConnectionsError("");
    const popup = window.open("", "newlaw-calendar-oauth", "width=580,height=760");
    if (popup) {
      popup.document.title = "NEWLAW - Conectando calendário";
      popup.document.body.innerHTML = `
        <div style="font-family:Arial,sans-serif;padding:24px;color:#0f1e3f">
          <h2 style="margin:0 0 8px 0">Conectando calendário...</h2>
          <p style="margin:0">Aguarde, estamos abrindo a autenticação.</p>
        </div>
      `;
      popup.focus();
    }
    try {
      const response = await apiStartCalendarConnection(provider);
      if (popup && !popup.closed) {
        popup.location.href = response.auth_url;
      } else {
        window.location.href = response.auth_url;
      }
      setCalendarInlineMessage(`Conclua o login ${provider === "google" ? "Google" : "Microsoft"} na janela aberta.`);
      pollConnectionUntilReady(provider);
    } catch (err) {
      if (popup && !popup.closed) {
        popup.close();
      }
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
      setCalendarInlineMessage(`Conta ${provider === "google" ? "Google" : "Microsoft"} desconectada.`);
      await loadCalendarConnections();
    } catch (err) {
      setCalendarConnectionsError(extractApiErrorMessage(err, "Falha ao desconectar o calendário."));
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const calendarConnectionMap = useMemo(() => {
    return calendarConnections.reduce<Record<string, CalendarConnectionStatus>>((acc, connection) => {
      acc[connection.provider] = connection;
      return acc;
    }, {});
  }, [calendarConnections]);

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
      const message = error instanceof Error ? error.message : "Não foi possível instalar a atualização.";
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

  const updateMeta = availableUpdate ? `Canal Estável · nova versão ${availableUpdate.version}` : "Canal Estável";
  const updateDescription = availableUpdate?.body || "As atualizações são baixadas e instaladas pelo próprio aplicativo.";

  return (
    <div className="content-card page-card settings-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Configurações</div>
          <h1 className="page-title">Preferências do sistema</h1>
          <div className="page-subtitle">Aparência, atualizações e ajustes gerais do NEWLAW.</div>
        </div>
        <div className="pill">Painel</div>
      </div>
      <div className="settings-grid">
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-title">Tema</div>
              <div className="settings-sub">Aplicação imediata da paleta azul.</div>
            </div>
            <div className="theme-options">
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
          <div className="settings-note">Paleta aplicada: branco + azul #0f1e3f.</div>
        </div>
        <div className="settings-card">
          <div className="settings-row">
            <div>
              <div className="settings-title">Sessão</div>
              <div className="settings-sub">Encerre sua sessão atual com segurança.</div>
            </div>
            <button className="btn ghost small" type="button" onClick={onLogout}>
              Encerrar sessão
            </button>
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
        <div className="settings-card update-card">
          <div className="settings-title">Central de Atualizações NEWLAW</div>
          <div className="update-shell">
            <div className="update-info">
              <img className="update-logo" src="/logo_new_law_teste.png" alt="NEWLAW" />
              <div>
                <div className="update-name">NEWLAW {appVersion}</div>
                <div className="update-meta">{updateMeta}</div>
              </div>
            </div>
            <div className="update-actions">
              <button className="btn secondary small" type="button" onClick={handleCheckForUpdates} disabled={!canCheckUpdate}>
                {updateStatus === "checking" ? "Verificando..." : "Verificar atualização"}
              </button>
              <button className="btn small" type="button" onClick={handleInstallUpdate} disabled={!canInstallUpdate}>
                {installingUpdate ? "Instalando..." : "Baixar e instalar"}
              </button>
            </div>
          </div>
          <div className="update-description">{updateDescription}</div>
          <div className="update-footer">
            <div className={`update-status ${updateStatus === "error" ? "error" : ""}`}>{updateStatusLabel}</div>
            <button className="link-btn" type="button" onClick={handleCheckForUpdates} disabled={!canCheckUpdate}>
              Verificar novamente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [active, setActive] = useState<NavKey>("people");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState<"idle" | "ok" | "error" | "checking">("idle");
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem("newlaw-theme");
    return stored === "light" || stored === "dark" ? stored : "dark";
  });

  useEffect(() => {
    const session = loadAuthSession();
    if (!session) return;
    setToken(session.accessToken);
    setUser(session.user);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("newlaw-theme", theme);
  }, [theme]);

  const navListRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const allowedNavKeys = useMemo(() => getEffectiveAllowedNavKeys(user), [user]);
  const visibleNavItems = useMemo(() => navItems.filter((item) => allowedNavKeys.includes(item.key)), [allowedNavKeys]);
  const canManageTeamAndWallets = Boolean(
    user && (user.role === "superadmin" || user.role === "owner" || user.role === "admin" || user.is_admin)
  );
  const activeNav = visibleNavItems.some((item) => item.key === active) ? active : (visibleNavItems[0]?.key ?? "settings");

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const data = await apiLogin(creds.username, creds.password);
      setToken(data.access_token);
      setUser(data.user);
      saveAuthSession({ accessToken: data.access_token, refreshToken: data.refresh_token, user: data.user });
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAuthError(message || "Login inválido.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePing = async () => {
    setApiStatus("checking");
    try {
      await ping();
      setApiStatus("ok");
    } catch {
      setApiStatus("error");
    }
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } finally {
      clearAuthSession();
      setToken(null);
      setUser(null);
    }
  };

  if (!token) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Entrar</h1>
          <p>Informe suas credenciais para acessar.</p>
          <form onSubmit={handleLogin}>
            <div className="field">
              <label>Email</label>
              <input value={creds.username} onChange={(e) => setCreds((c) => ({ ...c, username: e.target.value }))} />
            </div>
            <div className="field">
              <label>Senha</label>
              <input type="password" value={creds.password} onChange={(e) => setCreds((c) => ({ ...c, password: e.target.value }))} />
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
        return <Home />;
      case "people":
        return <People />;
      case "cases":
        return <Cases />;
      case "wallets":
        return <Wallets canManage={canManageTeamAndWallets} />;
      case "team":
        return <Team canManage={canManageTeamAndWallets} />;
      case "official":
        return <Publications />;
      case "settings":
        return <Settings theme={theme} onThemeChange={setTheme} onLogout={handleLogout} />;
      case "finance":
      case "billing":
        return <Finance />;
      case "agenda":
        return <Agenda />;
      case "service":
      case "reports":
      case "stats":
      case "progress":
      case "files":
      case "templates":
        return <Placeholder title={navItems.find((n) => n.key === activeNav)?.label || "Em breve"} />;
      default:
        return <Placeholder title="Dashboard" />;
    }
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-full">Arnaud{"\n"}Advocacia</span>
            <span className="brand-short">NL</span>
          </div>
          <button
            type="button"
            className="collapse-btn"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? "Expandir menu" : "Minimizar menu"}
            title={sidebarCollapsed ? "Expandir menu" : "Minimizar menu"}
          >
            {sidebarCollapsed ? ">" : "<"}
          </button>
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
          <div className="sidebar-user">
            {canManageTeamAndWallets ? "Administrador" : "Membro"}
            <br />
            {user?.email || "usuario@newlaw.app.br"}
          </div>
          <img className="sidebar-logo" src="/logo_new_law_teste.png" alt="New Law" />
        </div>
      </aside>
      <main className="content scroll-area" ref={contentRef}>
        {render()}
      </main>
    </div>
  );
}

export default App;
