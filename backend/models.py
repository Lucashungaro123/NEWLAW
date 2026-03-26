"""Database models for NEWLAW."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class TimestampMixin(SQLModel):
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class Plan(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    name: str
    user_limit: int = Field(default=1, description="Maximum active users per organization")
    is_active: bool = True


class Organization(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    plan_id: Optional[int] = Field(default=None, foreign_key="plan.id")
    user_limit_override: Optional[int] = None
    is_active: bool = True


class User(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    email: str = Field(index=True, unique=True)
    hashed_password: str
    full_name: str
    phone: Optional[str] = None
    role: str = Field(default="member", description="superadmin|owner|admin|member")
    is_team_admin: bool = Field(default=False, description="Permite gerenciar equipe e criar carteiras")
    allowed_nav_keys: Optional[str] = Field(default=None, description="Menus permitidos, separados por vírgula")
    is_active: bool = True
    email_verified: bool = False
    last_login_at: Optional[datetime] = None
    failed_login_count: int = 0
    locked_until: Optional[datetime] = None
    reset_token_hash: Optional[str] = None
    reset_token_expires_at: Optional[datetime] = None


class RefreshToken(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    token_hash: str = Field(index=True, unique=True)
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    user_agent: Optional[str] = None
    ip_address: Optional[str] = None


class Client(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    name: str
    document: Optional[str] = Field(default=None, description="CPF/CNPJ")
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None


class Case(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    number: str = Field(index=True, description="Número do processo")
    title: str
    client_id: Optional[int] = Field(foreign_key="client.id")
    status: str = Field(default="aberto")
    forum: Optional[str] = None
    court: Optional[str] = None
    value: Optional[float] = None


class Wallet(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    number: int = Field(index=True, description="Sequencial da carteira")
    name: str = Field(index=True, description="Nome padrão: Carteira N")
    nickname: str = Field(index=True)
    description: Optional[str] = None
    is_active: bool = True


class TeamMember(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    full_name: str = Field(index=True)
    email: str = Field(index=True)
    phone: Optional[str] = None
    cpf: str = Field(index=True, description="CPF do colaborador (somente dígitos)")
    oab: str = Field(index=True, description="Número da OAB")
    role_title: str = Field(index=True, description="Cargo na equipe")
    team_name: str = Field(index=True, description="Equipe/área")
    notes: Optional[str] = None
    is_team_admin: bool = Field(default=False, description="Permite gerenciar equipe e criar carteiras")
    allowed_nav_keys: Optional[str] = Field(default=None, description="Menus permitidos, separados por vírgula")
    is_active: bool = True


class CaseWallet(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id", index=True, unique=True)
    wallet_id: int = Field(foreign_key="wallet.id", index=True)


class WalletTeamMemberAccess(TimestampMixin, table=True):
    __table_args__ = (UniqueConstraint("wallet_id", "team_member_id", name="uq_wallet_team_member_access"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    wallet_id: int = Field(foreign_key="wallet.id", index=True)
    team_member_id: int = Field(foreign_key="teammember.id", index=True)


class Invoice(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    client_id: Optional[int] = Field(foreign_key="client.id")
    description: str
    amount: float
    due_date: Optional[datetime] = None
    paid: bool = False
    payment_date: Optional[datetime] = None


class FinancialEntry(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    entry_type: str = Field(index=True, description="receita|despesa")
    category: str = Field(index=True)
    client_id: Optional[int] = Field(default=None, foreign_key="client.id", index=True)
    case_id: Optional[int] = Field(default=None, foreign_key="case.id", index=True)
    client_name_snapshot: Optional[str] = None
    case_number_snapshot: Optional[str] = None
    amount: float
    due_date: datetime = Field(index=True)
    payment_date: Optional[datetime] = Field(default=None, index=True)
    payment_method: Optional[str] = Field(default=None, index=True)
    expense_type: Optional[str] = Field(default=None, index=True)
    recurring: Optional[str] = Field(default=None, index=True)
    paid_amount: Optional[float] = None
    installments: Optional[int] = None
    attachment_name: Optional[str] = None


class ClientDocument(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, index=True)
    uploaded_by_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    client_id: int = Field(index=True)
    case_id: Optional[int] = Field(default=None, index=True)
    folder_label: str = Field(index=True)
    original_name: str
    stored_name: str
    storage_path: str = Field(index=True)
    content_type: str
    size_bytes: int


class Template(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    slug: str = Field(index=True, unique=True)
    name: str
    description: Optional[str] = None
    content: str


class AgendaDeadline(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id", index=True)
    title: str
    due_at: datetime = Field(index=True)
    reference: Optional[str] = None
    notes: Optional[str] = None
    is_completed: bool = False


class CalendarConnection(TimestampMixin, table=True):
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_calendar_connection_user_provider"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id", index=True)
    provider: str = Field(index=True)
    provider_email: Optional[str] = Field(default=None, index=True)
    scope: Optional[str] = None
    access_token_encrypted: str
    refresh_token_encrypted: Optional[str] = None
    token_expires_at: Optional[datetime] = None
    is_active: bool = True
    last_synced_at: Optional[datetime] = None
    sync_error: Optional[str] = None


class ExternalCalendarEvent(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    connection_id: int = Field(foreign_key="calendarconnection.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id", index=True)
    provider: str = Field(index=True)
    source_key: str = Field(index=True, unique=True, description="provider:external_event_id")
    external_event_id: str = Field(index=True)
    calendar_id: Optional[str] = Field(default=None, index=True)
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    starts_at: datetime = Field(index=True)
    ends_at: datetime = Field(index=True)
    is_all_day: bool = False
    is_cancelled: bool = False
    organizer_email: Optional[str] = None
    meeting_url: Optional[str] = None
    status: Optional[str] = None
    updated_remote_at: Optional[datetime] = None
