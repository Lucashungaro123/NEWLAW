export type NavKey =
  | "home"
  | "dashboard"
  | "people"
  | "cases"
  | "finance"
  | "templates"
  | "agenda"
  | "team"
  | "billing"
  | "service"
  | "stats"
  | "official"
  | "progress"
  | "files"
  | "wallets"
  | "settings";

export interface Stat {
  label: string;
  value: string;
  tag?: string;
}

export interface Client {
  id: number;
  name: string;
  email?: string;
  document?: string;
}

export interface Case {
  id: number;
  number: string;
  title: string;
  status: string;
}

export interface LoginState {
  token: string | null;
  user: {
    email: string;
    name: string;
    phone?: string | null;
    role: string;
    organization_name?: string | null;
    role_title?: string | null;
    team_name?: string | null;
    is_admin?: boolean;
    allowed_nav_keys?: string[];
  } | null;
}
