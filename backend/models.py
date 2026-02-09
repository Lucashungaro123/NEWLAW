"""Database models for NEWLAW."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

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


class Invoice(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    client_id: Optional[int] = Field(foreign_key="client.id")
    description: str
    amount: float
    due_date: Optional[datetime] = None
    paid: bool = False
    payment_date: Optional[datetime] = None


class Template(TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    slug: str = Field(index=True, unique=True)
    name: str
    description: Optional[str] = None
    content: str
