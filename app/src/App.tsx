import { useEffect, useMemo, useRef, useState } from "react";
import { clearAuthSession, loadAuthSession, login as apiLogin, logout as apiLogout, saveAuthSession } from "./api";
import { NavKey } from "./types";

type ClientRow = { id: number; name: string; phone: string; phone2?: string; email: string; city: string; cpf: string };
type ThemeMode = "dark" | "light";

const navItems: { key: NavKey; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "dashboard", label: "Dashboard" },
  { key: "cases", label: "Processos" },
  { key: "people", label: "Pessoas" },
  { key: "team", label: "Equipe" },
  { key: "agenda", label: "Agenda" },
  { key: "finance", label: "Financeiro" },
  { key: "billing", label: "Cobrança" },
  { key: "service", label: "Atendimento" },
  { key: "reports", label: "Relatórios" },
  { key: "stats", label: "Estatísticas" },
  { key: "official", label: "Publicações" },
  { key: "progress", label: "Andamentos" },
  { key: "files", label: "Arquivos" },
  { key: "settings", label: "Configurações" }
];

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

const clientSeed: ClientRow[] = [
  { id: 1, name: "LUCAS DE ANADRADE HUNGARO", phone: "(11)94909-5020", email: "eng.lucashungaro@hotmail.com", city: "São Caetano do Sul", cpf: "456.385.258-90" },
  { id: 2, name: "GERSON HUNGARO", phone: "11981047594", email: "ghungaro@terra.com.br", city: "São Caetano do Sul", cpf: "074.368.638-19" },
  { id: 3, name: "JOYCE ARNAUD ZOCA", phone: "11946897110", email: "joycearnaudzoca@gmail.com", city: "Santo André", cpf: "526.811.008-01" },
  { id: 4, name: "NOVO CLIENTE DEMO", phone: "1111", email: "contato@cliente.com", city: "São Paulo", cpf: "999.999.999-99" }
];

const emptyClientForm = {
  name: "",
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
  court: "",
  region: "",
  associated: "",
  counterparty: "",
  counterLawyer: "",
  oab: "",
  contact: "",
  notes: ""
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
  onChange,
  onClose,
  onSave,
  onLookupCep,
  cepError
}: {
  open: boolean;
  form: typeof emptyClientForm;
  onChange: (key: keyof typeof emptyClientForm, value: string) => void;
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

  const formatName = (value: string) => {
    return value.replace(/[^A-Za-zÀ-ÿ\s]/g, "").toUpperCase();
  };

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
    onChange("name", formatName(value));
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

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <h2 className="modal-title">Cadastrar novo cliente</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-grid">
          <div className="field span-2">
            <label>Nome</label>
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
          <div className="field">
            <label>CPF</label>
            <input value={form.cpf} onChange={(e) => handleCpfChange(e.target.value)} inputMode="numeric" />
          </div>
          <div className="field">
            <label>RG</label>
            <input value={form.rg} onChange={(e) => handleRgChange(e.target.value)} inputMode="numeric" />
          </div>
          <div className="field">
            <label>CNPJ</label>
            <input value={form.cnpj} onChange={(e) => handleCnpjChange(e.target.value)} inputMode="numeric" />
          </div>
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
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="button" onClick={onSave}>
            Salvar
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
  onChange,
  onClose,
  onSave
}: {
  open: boolean;
  clientName?: string;
  form: typeof emptyCaseForm;
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
        <div className="modal-actions">
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn" type="button" onClick={onSave}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function People() {
  const [clients, setClients] = useState<ClientRow[]>(clientSeed);
  const [selectedId, setSelectedId] = useState<number>(clientSeed[0]?.id ?? 0);
  const [search, setSearch] = useState("");
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddProcess, setShowAddProcess] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [caseForm, setCaseForm] = useState(emptyCaseForm);
  const [cepError, setCepError] = useState("");

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(term));
  }, [clients, search]);

  const selectedClient = clients.find((c) => c.id === selectedId);

  const handleSaveClient = () => {
    const newEntry: ClientRow = {
      id: clients.length + 1,
      name: clientForm.name || "Cliente sem nome",
      phone: clientForm.phone1 || "-",
      email: clientForm.email || "-",
      city: clientForm.city || "-",
      cpf: clientForm.cpf || "-"
    };
    setClients((prev) => [...prev, newEntry]);
    setSelectedId(newEntry.id);
    setClientForm(emptyClientForm);
    setShowAddClient(false);
  };

  const handleSaveCase = () => {
    setCaseForm(emptyCaseForm);
    setShowAddProcess(false);
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
        <StatCard title="Clientes ativos" value="32" description="Com planos vigentes" badge="4 aguardam assinatura" />
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
            <button className="btn secondary" onClick={() => setShowAddClient(true)}>Adicionar cliente</button>
            <button className="btn secondary" disabled={!selectedClient} onClick={() => setShowAddProcess(true)}>
              Cadastrar processo
            </button>
          </div>
        </div>

        <div className="table-shell">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nome</th>
                <th>Telefone 1</th>
                <th>Email</th>
                <th>Cidade</th>
                <th>CPF</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client, idx) => (
                <tr
                  key={client.id}
                  className={selectedId === client.id ? "selected" : ""}
                  onClick={() => setSelectedId(client.id)}
                >
                  <td className="index-cell">{idx + 1}</td>
                  <td>{client.name}</td>
                  <td>{client.phone}</td>
                  <td>{client.email}</td>
                  <td>{client.city}</td>
                  <td>{client.cpf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddClientModal
        open={showAddClient}
        form={clientForm}
        onClose={() => {
          setShowAddClient(false);
          setClientForm(emptyClientForm);
          setCepError("");
        }}
        onChange={(key, value) => {
          if (key === "cep") setCepError("");
          setClientForm((prev) => ({ ...prev, [key]: value }));
        }}
        onSave={handleSaveClient}
        onLookupCep={(cepDigits) => {
          handleLookupCep(cepDigits);
        }}
        cepError={cepError}
      />
      <AddProcessModal
        open={showAddProcess}
        clientName={selectedClient?.name}
        form={caseForm}
        onChange={(key, value) => setCaseForm((prev) => ({ ...prev, [key]: value }))}
        onClose={() => {
          setShowAddProcess(false);
          setCaseForm(emptyCaseForm);
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

type CaseRow = {
  id: number;
  title: string;
  client: string;
  folder: string;
  action: string;
  area: string;
  number: string;
  forum: string;
  lawyer: string;
  status: "Ativo" | "Em andamento" | "Arquivado";
};

const caseRows: CaseRow[] = [
  {
    id: 1,
    title: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA. x VERA LUCIA MANHAS CINTRA",
    client: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA",
    folder: "ADMINISTRATIVA",
    action: "Cobranca administrativa",
    area: "ADMINISTRATIVA",
    number: "0522437/2025",
    forum: "PROCON - SP",
    lawyer: "Rincon e Sebastiani Sociedade de Advogados",
    status: "Ativo"
  },
  {
    id: 2,
    title: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA. x MATEUS OLIVEIRA BERNADES",
    client: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA",
    folder: "CIVEL",
    action: "Danos Morais",
    area: "CIVEL",
    number: "5924373-64.2025.8.09.0007",
    forum: "PROCON - SP",
    lawyer: "Rincon e Sebastiani Sociedade de Advogados",
    status: "Ativo"
  },
  {
    id: 3,
    title: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA. x ROSELI RODRIGUES LUCIO",
    client: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA",
    folder: "PROCON",
    action: "Reclamacao Procon",
    area: "PROCON",
    number: "0794070/2025",
    forum: "PROCON - SP",
    lawyer: "Rincon e Sebastiani Sociedade de Advogados",
    status: "Em andamento"
  },
  {
    id: 4,
    title: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA. x ANA CAROLINA PEREIRA RODRIGUEZ",
    client: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA",
    folder: "PROCON",
    action: "Reclamacao Procon",
    area: "PROCON",
    number: "0787744/2025",
    forum: "PROCON - SP",
    lawyer: "Rincon e Sebastiani Sociedade de Advogados",
    status: "Ativo"
  },
  {
    id: 5,
    title: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA. x EXPEDITO CORDEIRO DE MORAES",
    client: "PAYT TECNOLOGIA E EDUCACAO DIGITAL LTDA",
    folder: "PROCON",
    action: "Reclamacao Procon",
    area: "PROCON",
    number: "0788051/2025",
    forum: "PROCON - SP",
    lawyer: "Rincon e Sebastiani Sociedade de Advogados",
    status: "Arquivado"
  }
];

function Cases() {
  const [quickSearch, setQuickSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchType, setSearchType] = useState<"terms" | "exact">("terms");
  const [scope, setScope] = useState("general");
  const [menuActive, setMenuActive] = useState("cases-total");
  const [mode, setMode] = useState<"view" | "create">("view");

  const totalCases = caseRows.length;
  const activeCases = caseRows.filter((row) => row.status !== "Arquivado").length;
  const archivedCases = caseRows.filter((row) => row.status === "Arquivado").length;

  const areaSummary = useMemo(() => {
    const counts = caseRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.area] = (acc[row.area] || 0) + 1;
      return acc;
    }, {});
    const total = caseRows.length || 1;
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, []);

  const portfolioCards = [
    { name: "Carteira Consumidor", owner: "Equipe Contencioso", total: 132, fresh: 9, alerts: 8 },
    { name: "Carteira Trabalhista", owner: "Equipe RH", total: 74, fresh: 6, alerts: 4 },
    { name: "Carteira Empresarial", owner: "Equipe Contratos", total: 39, fresh: 3, alerts: 2 }
  ];

  const stalledCases = caseRows.slice(0, 3).map((row, index) => ({
    ...row,
    days: 33 + index * 7,
    lastUpdate: index === 0 ? "Aguardando manifestacao" : "Sem movimentacao registrada"
  }));

  const weeklyUpdates = [
    { title: "Audiencia marcada", caseRef: caseRows[1].number, client: caseRows[1].client, when: "Seg · 14:20" },
    { title: "Prazo reaberto", caseRef: caseRows[0].number, client: caseRows[0].client, when: "Ter · 09:12" },
    { title: "Peticao protocolada", caseRef: caseRows[2].number, client: caseRows[2].client, when: "Qua · 16:48" },
    { title: "Conclusao para despacho", caseRef: caseRows[3].number, client: caseRows[3].client, when: "Qui · 11:05" }
  ];

  const priorityCases = caseRows.slice(0, 3).map((row, index) => ({
    ...row,
    level: ["Critico", "Alto", "Alto"][index],
    due: ["Hoje", "3 dias", "6 dias"][index]
  }));

  const menuItems = [
    { id: "cases-total", title: "Total de processos", value: totalCases, meta: "Visao geral do acervo" },
    { id: "cases-active", title: "Processos ativos", value: activeCases, meta: "Em andamento no sistema" },
    { id: "cases-portfolio", title: "Carteiras", value: portfolioCards.length, meta: "Equipes e frentes ativas" },
    { id: "cases-stalled", title: "Sem movimentacao +30 dias", value: stalledCases.length, meta: "Necessitam revisao" },
    { id: "cases-weekly", title: "Movimentados na ultima semana", value: weeklyUpdates.length, meta: "Atualizacoes recentes" },
    { id: "cases-priority", title: "Marcados como prioridade", value: priorityCases.length, meta: "Casos criticos" }
  ];

  const filteredCases = useMemo(() => {
    const term = `${quickSearch} ${searchTerm}`.trim().toLowerCase();
    if (!term) return caseRows;
    return caseRows.filter((row) => {
      const haystack = `${row.title} ${row.client} ${row.number} ${row.forum} ${row.lawyer} ${row.action} ${row.area}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [quickSearch, searchTerm]);

  const handleMenuClick = (id: string) => {
    setMenuActive(id);
    if (typeof document === "undefined") return;
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="content-card page-card cases-page">
      <div className="page-header cases-header">
        <div>
          <div className="eyebrow">Processos</div>
          <h1 className="page-title">Controle de processos</h1>
          <div className="page-subtitle">Acompanhe prazos, acervo e movimentacoes com visao consolidada.</div>
        </div>
      </div>

      <div className="cases-menu">
        <div className="cases-menu-bar">
          <div className="cases-mode-switch" role="tablist" aria-label="Modo de visualizacao">
            <button
              type="button"
              className={`cases-mode-btn ${mode === "view" ? "active" : ""}`}
              onClick={() => setMode("view")}
              aria-pressed={mode === "view"}
            >
              Visualizar
            </button>
            <button
              type="button"
              className={`cases-mode-btn ${mode === "create" ? "active" : ""}`}
              onClick={() => setMode("create")}
              aria-pressed={mode === "create"}
            >
              Cadastrar
            </button>
          </div>
          <div className="cases-menu-actions">
            <div className="cases-top-search">
              <input
                value={quickSearch}
                onChange={(event) => setQuickSearch(event.target.value)}
                placeholder="Buscar por CNJ, tribunal ou orgao"
              />
              <button type="button" className="icon-btn" aria-label="Buscar">
                <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-4-4" />
                </svg>
              </button>
            </div>
            <button className="btn small" type="button">
              Novo processo
            </button>
          </div>
        </div>
        <div className="cases-menu-grid">
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`cases-menu-item ${menuActive === item.id ? "active" : ""}`}
              onClick={() => handleMenuClick(item.id)}
            >
              <span className="cases-menu-title">{item.title}</span>
              <span className="cases-menu-value">{item.value}</span>
              <span className="cases-menu-meta">{item.meta}</span>
            </button>
          ))}
        </div>
      </div>

      <section id="cases-total" className="cases-section">
        <div className="cases-section-head">
          <div>
            <div className="cases-section-label">Visao geral</div>
            <h2 className="cases-section-title">Total de processos</h2>
            <div className="cases-section-sub">Resumo das frentes e alertas do acervo.</div>
          </div>
          <button className="btn ghost small" type="button">
            Gerar relatorio
          </button>
        </div>
        <div className="cases-summary-grid">
          <div className="cases-summary-card">
            <div className="cases-summary-label">Total em carteira</div>
            <div className="cases-summary-value">{totalCases}</div>
            <div className="cases-summary-meta">Processos registrados no sistema</div>
          </div>
          <div className="cases-summary-card">
            <div className="cases-summary-label">Ativos agora</div>
            <div className="cases-summary-value">{activeCases}</div>
            <div className="cases-summary-meta">Em andamento ou com prazo</div>
          </div>
          <div className="cases-summary-card">
            <div className="cases-summary-label">Arquivados</div>
            <div className="cases-summary-value">{archivedCases}</div>
            <div className="cases-summary-meta">Finalizados ou suspensos</div>
          </div>
        </div>
        <div className="cases-summary-split">
          <div className="cases-panel">
            <div className="cases-panel-title">Distribuicao por area</div>
            <div className="cases-area-list">
              {areaSummary.map((area) => (
                <div key={area.name} className="cases-area-row">
                  <div className="cases-area-name">{area.name}</div>
                  <div className="cases-area-bar">
                    <span style={{ width: `${area.pct}%` }} />
                  </div>
                  <div className="cases-area-count">{area.count}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="cases-panel">
            <div className="cases-panel-title">Alertas do acervo</div>
            <div className="cases-alert-grid">
              <div className="cases-alert-card">
                <div className="cases-alert-title">Prazos criticos</div>
                <div className="cases-alert-value">4</div>
                <div className="cases-alert-sub">Ate 48h para resposta</div>
              </div>
              <div className="cases-alert-card">
                <div className="cases-alert-title">Pendencias internas</div>
                <div className="cases-alert-value">12</div>
                <div className="cases-alert-sub">Documentos aguardando</div>
              </div>
              <div className="cases-alert-card">
                <div className="cases-alert-title">Riscos mapeados</div>
                <div className="cases-alert-value">6</div>
                <div className="cases-alert-sub">Processos com prioridade</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="cases-active" className="cases-section">
        <div className="cases-section-head">
          <div>
            <div className="cases-section-label">Operacao</div>
            <h2 className="cases-section-title">Processos ativos</h2>
            <div className="cases-section-sub">Filtros e visao detalhada da carteira ativa.</div>
          </div>
          <div className="cases-section-actions">
            <button className="btn ghost small" type="button">
              Painel operacional
            </button>
            <button className="btn secondary small" type="button">
              Criar rotina
            </button>
          </div>
        </div>

        <div className="cases-panel cases-filter">
          <div className="cases-filter-label">Pesquisa aberta</div>
          <div className="cases-filter-row">
            <div className="cases-filter-select">
              <label>Informacoes gerais</label>
              <select value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="general">Informacoes gerais</option>
                <option value="numbers">Numero do processo</option>
                <option value="people">Titulo ou cliente</option>
              </select>
            </div>
            <div className="cases-search">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Pesquisar contendo o termo..."
              />
              <button type="button" className="icon-btn" aria-label="Pesquisar termo">
                <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-4-4" />
                </svg>
              </button>
            </div>
            <div className="cases-filter-actions">
              <div className="cases-filter-type">
                <span>Tipo de pesquisa</span>
                <label>
                  <input
                    type="radio"
                    name="searchType"
                    value="terms"
                    checked={searchType === "terms"}
                    onChange={() => setSearchType("terms")}
                  />
                  Por termos
                </label>
                <label>
                  <input
                    type="radio"
                    name="searchType"
                    value="exact"
                    checked={searchType === "exact"}
                    onChange={() => setSearchType("exact")}
                  />
                  Exata
                </label>
              </div>
              <button className="btn secondary small" type="button">
                Filtro avancado
              </button>
            </div>
          </div>
        </div>

        <div className="cases-panel cases-list">
          <div className="cases-list-head">
            <div className="cases-list-title">Processos</div>
            <div className="cases-list-actions">
              <button className="btn ghost small" type="button">
                Exportar
              </button>
              <div className="cases-pagination">
                <button className="btn ghost small" type="button" aria-label="Pagina anterior">
                  <span aria-hidden="true">‹</span>
                </button>
                <span>1 - 25 de 6226</span>
                <button className="btn ghost small" type="button" aria-label="Proxima pagina">
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            </div>
          </div>

          <div className="cases-table">
            <div className="cases-row cases-header-row">
              <div className="cases-cell checkbox">
                <input type="checkbox" aria-label="Selecionar todos" />
              </div>
              <div className="cases-cell title">Titulo/Cliente</div>
              <div className="cases-cell folder">Pasta</div>
              <div className="cases-cell action">Acao/Area</div>
              <div className="cases-cell number">Numero do processo</div>
              <div className="cases-cell forum">Foro</div>
              <div className="cases-cell lawyer">Advogado</div>
            </div>
            {filteredCases.map((row) => (
              <div key={row.id} className="cases-row">
                <div className="cases-cell checkbox">
                  <input type="checkbox" aria-label={`Selecionar ${row.title}`} />
                </div>
                <div className="cases-cell title">
                  <div className="cases-title">{row.title}</div>
                  <div className="cases-sub">{row.client}</div>
                </div>
                <div className="cases-cell folder">
                  <div className="cases-label">{row.folder}</div>
                </div>
                <div className="cases-cell action">
                  <div className="cases-label">{row.action}</div>
                  <div className="cases-sub">{row.area}</div>
                </div>
                <div className="cases-cell number">
                  <div className="cases-label">{row.number}</div>
                  <button className="link-btn" type="button">
                    Copiar
                  </button>
                </div>
                <div className="cases-cell forum">
                  <div className="cases-label">{row.forum}</div>
                </div>
                <div className="cases-cell lawyer">
                  <div className="cases-label">{row.lawyer}</div>
                  <span className={`status-badge ${row.status.replace(" ", "-").toLowerCase()}`}>{row.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="cases-portfolio" className="cases-section">
        <div className="cases-section-head">
          <div>
            <div className="cases-section-label">Carteiras</div>
            <h2 className="cases-section-title">Visao por equipes</h2>
            <div className="cases-section-sub">Distribuicao por area e responsavel.</div>
          </div>
          <button className="btn ghost small" type="button">
            Gerenciar carteiras
          </button>
        </div>
        <div className="cases-portfolio-grid">
          {portfolioCards.map((card) => (
            <article key={card.name} className="cases-portfolio-card">
              <div className="cases-portfolio-top">
                <div className="cases-portfolio-title">{card.name}</div>
                <span className="cases-portfolio-badge">{card.alerts} em alerta</span>
              </div>
              <div className="cases-portfolio-owner">{card.owner}</div>
              <div className="cases-portfolio-stats">
                <div>
                  <div className="cases-portfolio-value">{card.total}</div>
                  <div className="cases-portfolio-label">Processos</div>
                </div>
                <div>
                  <div className="cases-portfolio-value">{card.fresh}</div>
                  <div className="cases-portfolio-label">Novos na semana</div>
                </div>
              </div>
              <button className="btn secondary small" type="button">
                Abrir carteira
              </button>
            </article>
          ))}
        </div>
      </section>

      <section id="cases-stalled" className="cases-section">
        <div className="cases-section-head">
          <div>
            <div className="cases-section-label">Sem movimentacao</div>
            <h2 className="cases-section-title">Mais de 30 dias sem andamento</h2>
            <div className="cases-section-sub">Processos que precisam de revisao imediata.</div>
          </div>
          <button className="btn ghost small" type="button">
            Criar alerta
          </button>
        </div>
        <div className="cases-stalled-list">
          {stalledCases.map((row) => (
            <div key={row.id} className="cases-stalled-item">
              <div>
                <div className="cases-stalled-title">{row.title}</div>
                <div className="cases-stalled-meta">
                  {row.number} · {row.lastUpdate}
                </div>
              </div>
              <div className="cases-stalled-side">
                <div className="cases-stalled-days">{row.days} dias</div>
                <button className="btn ghost small" type="button">
                  Revisar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="cases-weekly" className="cases-section">
        <div className="cases-section-head">
          <div>
            <div className="cases-section-label">Movimentacoes</div>
            <h2 className="cases-section-title">Atualizacoes da semana</h2>
            <div className="cases-section-sub">Controle rapido das ultimas movimentacoes.</div>
          </div>
          <button className="btn ghost small" type="button">
            Ver feed completo
          </button>
        </div>
        <div className="cases-weekly-grid">
          <div className="cases-panel">
            <div className="cases-panel-title">Ultimas movimentacoes</div>
            <div className="cases-activity-list">
              {weeklyUpdates.map((item) => (
                <div key={`${item.title}-${item.caseRef}`} className="cases-activity-item">
                  <div>
                    <div className="cases-activity-title">{item.title}</div>
                    <div className="cases-activity-sub">
                      {item.caseRef} · {item.client}
                    </div>
                  </div>
                  <div className="cases-activity-time">{item.when}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="cases-panel">
            <div className="cases-panel-title">Resumo da semana</div>
            <div className="cases-weekly-summary">
              <div className="cases-weekly-card">
                <div className="cases-weekly-value">18</div>
                <div className="cases-weekly-label">Movimentacoes registradas</div>
              </div>
              <div className="cases-weekly-card">
                <div className="cases-weekly-value">7</div>
                <div className="cases-weekly-label">Novas audiencias</div>
              </div>
              <div className="cases-weekly-card">
                <div className="cases-weekly-value">5</div>
                <div className="cases-weekly-label">Prazos prorrogados</div>
              </div>
              <div className="cases-weekly-card">
                <div className="cases-weekly-value">3</div>
                <div className="cases-weekly-label">Acordos em negociacao</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="cases-priority" className="cases-section">
        <div className="cases-section-head">
          <div>
            <div className="cases-section-label">Prioridade</div>
            <h2 className="cases-section-title">Marcados como prioridade</h2>
            <div className="cases-section-sub">Casos criticos acompanhados de perto.</div>
          </div>
          <button className="btn ghost small" type="button">
            Ajustar criterios
          </button>
        </div>
        <div className="cases-priority-grid">
          <div className="cases-panel">
            <div className="cases-panel-title">Fila de prioridade</div>
            <div className="cases-priority-list">
              {priorityCases.map((row) => (
                <div key={row.id} className="cases-priority-item">
                  <div>
                    <div className="cases-priority-title">{row.title}</div>
                    <div className="cases-priority-sub">
                      {row.number} · {row.forum}
                    </div>
                  </div>
                  <div className="cases-priority-side">
                    <span className={`cases-priority-tag ${row.level.toLowerCase()}`}>{row.level}</span>
                    <span className="cases-priority-due">{row.due}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="cases-panel">
            <div className="cases-panel-title">Checklist de resposta</div>
            <div className="cases-checklist">
              <label>
                <input type="checkbox" defaultChecked />
                Documentacao revisada
              </label>
              <label>
                <input type="checkbox" />
                Contato com cliente realizado
              </label>
              <label>
                <input type="checkbox" />
                Estrategia atualizada
              </label>
              <label>
                <input type="checkbox" />
                Pendencias mapeadas
              </label>
            </div>
            <button className="btn secondary small" type="button">
              Registrar andamento
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Settings({ theme, onThemeChange }: { theme: ThemeMode; onThemeChange: (value: ThemeMode) => void }) {
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
        <div className="settings-card update-card">
          <div className="settings-title">Central de Atualizações NEWLAW</div>
          <div className="update-shell">
            <div className="update-info">
              <img className="update-logo" src="/logo_new_law_teste.png" alt="NEWLAW" />
              <div>
                <div className="update-name">NEWLAW 0.1.0</div>
                <div className="update-meta">Canal Estável · 112 MB</div>
              </div>
            </div>
            <div className="update-actions">
              <button className="btn secondary small" type="button" disabled>
                Atualizar mais tarde
              </button>
              <button className="btn small" type="button" disabled>
                Reiniciar agora
              </button>
            </div>
          </div>
          <div className="update-description">
            Atualizações automáticas estarão disponíveis quando a conexão online estiver ativa.
          </div>
          <div className="update-footer">
            <div className="update-status">Sem conexão no momento</div>
            <button className="link-btn" type="button" disabled>
              Saiba mais...
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
  const [user, setUser] = useState<{ email: string; name: string; role: string } | null>(null);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
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
              <label>Usuário</label>
              <input value={creds.username} onChange={(e) => setCreds((c) => ({ ...c, username: e.target.value }))} />
            </div>
            <div className="field">
              <label>Senha</label>
              <input type="password" value={creds.password} onChange={(e) => setCreds((c) => ({ ...c, password: e.target.value }))} />
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
    switch (active) {
      case "home":
        return <Home />;
      case "people":
        return <People />;
      case "cases":
        return <Cases />;
      case "official":
        return <Publications />;
      case "settings":
        return <Settings theme={theme} onThemeChange={setTheme} />;
      case "finance":
      case "agenda":
      case "team":
      case "billing":
      case "service":
      case "reports":
      case "stats":
      case "progress":
      case "files":
      case "templates":
        return <Placeholder title={navItems.find((n) => n.key === active)?.label || "Em breve"} />;
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
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav-btn ${active === item.key ? "active" : ""}`}
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
            Administrador
            <br />
            {user?.email || "usuario@newlaw.app.br"}
          </div>
          <button className="btn ghost small" type="button" onClick={handleLogout}>
            Sair
          </button>
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
