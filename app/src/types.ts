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
  | "reports"
  | "stats"
  | "official"
  | "progress"
  | "files"
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
  user: { email: string; name: string; role: string } | null;
}
