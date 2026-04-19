"""FastAPI backend for the NEWLAW desktop app (Tauri + React + Python).

This API is started by the Tauri shell and serves the local WebView.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import smtplib
import threading
import time
import unicodedata
import zipfile
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from html import escape, unescape
from typing import Annotated, Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request as UrlRequest
from urllib.request import urlopen
from zoneinfo import ZoneInfo

import requests
from cryptography.fernet import Fernet, InvalidToken

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import func, inspect, or_, text
from sqlmodel import Session, SQLModel, create_engine, delete, select

from .models import (
    AgendaDeadline,
    CalendarConnection,
    Case,
    ClientDocument,
    CaseWallet,
    Client,
    ExternalCalendarEvent,
    FinancialEntry,
    Invoice,
    Organization,
    Plan,
    PublicationAutomationConfig,
    PublicationHandling,
    PublicationRecord,
    RefreshToken,
    TeamMember,
    Template,
    User,
    Wallet,
    WalletTeamMemberAccess,
)

DB_PATH = os.getenv("NEWLAW_DB", "sqlite:///./data.db")
STORAGE_PATH = os.getenv("NEWLAW_STORAGE", "./storage")
ADMIN_SECRET = os.getenv("NEWLAW_ADMIN_SECRET")
ENVIRONMENT = os.getenv("NEWLAW_ENV", "development")
JWT_SECRET = os.getenv("NEWLAW_JWT_SECRET", "dev-secret-change")
JWT_ALGORITHM = os.getenv("NEWLAW_JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("NEWLAW_ACCESS_TOKEN_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("NEWLAW_REFRESH_TOKEN_DAYS", "30"))
LOCKOUT_MAX_ATTEMPTS = int(os.getenv("NEWLAW_LOCKOUT_MAX_ATTEMPTS", "5"))
LOCKOUT_MINUTES = int(os.getenv("NEWLAW_LOCKOUT_MINUTES", "15"))
PASSWORD_MIN_LENGTH = int(os.getenv("NEWLAW_PASSWORD_MIN_LENGTH", "8"))
TOKEN_PEPPER = os.getenv("NEWLAW_TOKEN_PEPPER", JWT_SECRET)
DEV_RETURN_RESET_TOKEN = os.getenv("NEWLAW_DEV_RETURN_RESET_TOKEN", "0") == "1"
DEV_RETURN_INVITE_TOKEN = os.getenv("NEWLAW_DEV_RETURN_INVITE_TOKEN", "0") == "1"
INVITE_TOKEN_EXPIRE_HOURS = int(os.getenv("NEWLAW_INVITE_TOKEN_HOURS", "48"))
INVITE_BASE_URL = os.getenv("NEWLAW_INVITE_BASE_URL", "https://api.newlaw.app.br/invite")
PUBLIC_SIGNUP_ENABLED = os.getenv("NEWLAW_PUBLIC_SIGNUP_ENABLED", "1") == "1"
PUBLIC_SIGNUP_PLAN_SLUG = os.getenv("NEWLAW_PUBLIC_SIGNUP_PLAN_SLUG", "basic").strip() or "basic"
PUBLIC_WEB_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "NEWLAW_PUBLIC_WEB_ORIGINS",
        "https://newlaw.app.br,https://www.newlaw.app.br",
    ).split(",")
    if origin.strip()
]
SMTP_HOST = os.getenv("NEWLAW_SMTP_HOST", "")
SMTP_PORT = int(os.getenv("NEWLAW_SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("NEWLAW_SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("NEWLAW_SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("NEWLAW_SMTP_FROM_EMAIL", SMTP_USERNAME or "no-reply@newlaw.app.br")
SMTP_FROM_NAME = os.getenv("NEWLAW_SMTP_FROM_NAME", "NEWLAW")
SMTP_STARTTLS = os.getenv("NEWLAW_SMTP_STARTTLS", "1") == "1"
CALENDAR_REDIRECT_URI = os.getenv("NEWLAW_CALENDAR_REDIRECT_URI", "").strip()
CALENDAR_TOKEN_KEY = os.getenv("NEWLAW_CALENDAR_TOKEN_KEY", "")
GOOGLE_OAUTH_CLIENT_ID = os.getenv("NEWLAW_GOOGLE_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("NEWLAW_GOOGLE_CLIENT_SECRET", "")
MICROSOFT_OAUTH_CLIENT_ID = os.getenv("NEWLAW_MICROSOFT_CLIENT_ID", "")
MICROSOFT_OAUTH_CLIENT_SECRET = os.getenv("NEWLAW_MICROSOFT_CLIENT_SECRET", "")
MICROSOFT_OAUTH_TENANT = os.getenv("NEWLAW_MICROSOFT_TENANT", "common")
OAUTH_STATE_TTL_MINUTES = int(os.getenv("NEWLAW_OAUTH_STATE_TTL_MINUTES", "10"))
CALENDAR_SYNC_LOOKBACK_DAYS = int(os.getenv("NEWLAW_CALENDAR_LOOKBACK_DAYS", "14"))
CALENDAR_SYNC_LOOKAHEAD_DAYS = int(os.getenv("NEWLAW_CALENDAR_LOOKAHEAD_DAYS", "120"))
CALENDAR_SYNC_INTERVAL_MINUTES = int(os.getenv("NEWLAW_CALENDAR_SYNC_INTERVAL_MINUTES", "15"))

NAV_PERMISSION_KEYS = (
    "home",
    "dashboard",
    "cases",
    "wallets",
    "people",
    "team",
    "agenda",
    "finance",
    "service",
    "reports",
    "stats",
    "official",
    "files",
    "settings",
)
ADMIN_REQUIRED_NAV_KEYS = ("team", "wallets")
ADMIN_ROLES = {"superadmin", "owner", "admin"}
CALENDAR_PROVIDERS = ("google", "microsoft")
FINANCE_ENTRY_TYPES = ("receita", "despesa")
FINANCE_PAYMENT_METHODS = ("pix", "boleto", "cartao", "dinheiro", "transferencia")
FINANCE_RECURRING_OPTIONS = ("nao-recorrente", "mensal", "anual", "personalizado")
CASE_NUMBER_PATTERN = re.compile(r"^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$")
FILES_MAX_UPLOAD_BYTES = int(os.getenv("NEWLAW_FILES_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
FILES_ALLOWED_UPLOADS: dict[str, dict[str, Any]] = {
    ".pdf": {
        "content_types": ("application/pdf", "application/x-pdf", "application/octet-stream"),
        "storage_content_type": "application/pdf",
    },
    ".doc": {
        "content_types": ("application/msword", "application/octet-stream"),
        "storage_content_type": "application/msword",
    },
    ".docx": {
        "content_types": (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/zip",
            "application/octet-stream",
        ),
        "storage_content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
}
PUBLICATIONS_DEFAULT_SCHEDULE_TIME = os.getenv("NEWLAW_PUBLICATIONS_DEFAULT_SCHEDULE", "06:00")
PUBLICATIONS_LOOKBACK_DAYS = int(os.getenv("NEWLAW_PUBLICATIONS_LOOKBACK_DAYS", "7"))
PUBLICATIONS_FOLDER_LABEL = "Publicações"
PUBLICATIONS_SCHEDULER_INTERVAL_SECONDS = int(os.getenv("NEWLAW_PUBLICATIONS_SCHEDULER_INTERVAL_SECONDS", "60"))
PUBLICATIONS_HTTP_TIMEOUT_SECONDS = int(os.getenv("NEWLAW_PUBLICATIONS_HTTP_TIMEOUT_SECONDS", "30"))
PUBLICATIONS_SOURCE_DJEN = "djen_cnj"
PUBLICATIONS_HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Accept": "application/json, application/pdf, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
}

GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

MICROSOFT_OAUTH_AUTHORIZE_URL = f"https://login.microsoftonline.com/{MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/authorize"
MICROSOFT_OAUTH_TOKEN_URL = f"https://login.microsoftonline.com/{MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/token"
MICROSOFT_PROFILE_URL = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName"
MICROSOFT_EVENTS_URL = "https://graph.microsoft.com/v1.0/me/calendarView"

PENDING_OAUTH_STATES: dict[str, dict[str, Any]] = {}
PUBLICATION_SYNC_LOCKS: dict[int, threading.Lock] = {}
PUBLICATION_SYNC_LOCKS_GUARD = threading.Lock()
PUBLICATION_SCHEDULER_THREAD: threading.Thread | None = None

try:
    APP_TIMEZONE = ZoneInfo(os.getenv("NEWLAW_TIMEZONE", "America/Sao_Paulo"))
except Exception:
    APP_TIMEZONE = ZoneInfo("America/Sao_Paulo")

engine = create_engine(DB_PATH, echo=False)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def get_session() -> Session: # type: ignore
    """Provide a database session per request."""
    with Session(engine) as session:
        yield session


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw, hashed)


def validate_password_strength(raw: str) -> None:
    if len(raw) < PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Senha deve ter ao menos {PASSWORD_MIN_LENGTH} caracteres",
        )
    if not any(char.isalpha() for char in raw):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha deve conter letras")
    if not any(char.isdigit() for char in raw):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha deve conter números")


def hash_token(token: str) -> str:
    if not TOKEN_PEPPER:
        raise RuntimeError("Token pepper not configured")
    return hmac.new(TOKEN_PEPPER.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def normalize_email(value: str) -> str:
    return value.strip().lower()


def normalize_organization_name(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_nav_keys(value: str | None) -> list[str]:
    if not value:
        return []
    items = [part.strip() for part in value.split(",")]
    valid = {key for key in NAV_PERMISSION_KEYS}
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items:
        if item == "progress":
            item = "official"
        if not item or item not in valid or item in seen:
            continue
        seen.add(item)
        cleaned.append(item)
    return cleaned


def normalize_nav_keys(raw: list[str] | None, *, is_admin: bool) -> list[str]:
    if raw is None:
        keys = list(NAV_PERMISSION_KEYS)
    else:
        valid = {key for key in NAV_PERMISSION_KEYS}
        keys = []
        seen: set[str] = set()
        for key in raw:
            clean = key.strip()
            if clean == "progress":
                clean = "official"
            if clean not in valid or clean in seen:
                continue
            seen.add(clean)
            keys.append(clean)
        if not keys:
            keys = list(NAV_PERMISSION_KEYS)
    if "settings" not in keys:
        keys.append("settings")
    if is_admin:
        for key in ADMIN_REQUIRED_NAV_KEYS:
            if key not in keys:
                keys.append(key)
    return keys


def serialize_nav_keys(keys: list[str]) -> str:
    return ",".join(keys)


def can_manage_team_and_wallets(user: User) -> bool:
    return user.role in ADMIN_ROLES or bool(user.is_team_admin)


def ensure_can_manage_team_and_wallets(user: User) -> None:
    if can_manage_team_and_wallets(user):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Acesso administrativo necessário para gerenciar equipe e carteiras.",
    )


def get_effective_user_nav_keys(user: User) -> list[str]:
    if user.role in ADMIN_ROLES:
        return list(NAV_PERMISSION_KEYS)
    return normalize_nav_keys(parse_nav_keys(user.allowed_nav_keys), is_admin=bool(user.is_team_admin))


def ensure_nav_access(user: User, nav_key: str) -> None:
    if nav_key in get_effective_user_nav_keys(user):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a este módulo")


def serialize_auth_user(session: Session, user: User) -> dict:
    member = get_team_member_for_user(session, user)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.full_name,
        "role": user.role,
        "organization_id": user.organization_id,
        "is_admin": bool(user.is_team_admin),
        "allowed_nav_keys": get_effective_user_nav_keys(user),
        "oab": member.oab if member and member.is_active else None,
    }


def has_full_wallet_access(user: User) -> bool:
    return user.role in ADMIN_ROLES or bool(user.is_team_admin)


def get_team_member_for_user(session: Session, user: User) -> TeamMember | None:
    if user.organization_id is None:
        return None
    return session.exec(
        select(TeamMember).where(
            TeamMember.organization_id == user.organization_id,
            TeamMember.email == normalize_email(user.email),
        )
    ).first()


def get_accessible_wallet_ids(
    session: Session,
    user: User,
    organization_id: int | None,
) -> set[int] | None:
    if has_full_wallet_access(user):
        return None
    member = get_team_member_for_user(session, user)
    if not member or member.id is None:
        return set()
    query = (
        select(WalletTeamMemberAccess.wallet_id)
        .join(Wallet, Wallet.id == WalletTeamMemberAccess.wallet_id)
        .where(WalletTeamMemberAccess.team_member_id == member.id)
    )
    if organization_id is not None:
        query = query.where(Wallet.organization_id == organization_id)
    return set(session.exec(query).all())


def ensure_user_can_access_wallet(session: Session, user: User, wallet: Wallet) -> None:
    if wallet.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carteira inválida")
    accessible_wallet_ids = get_accessible_wallet_ids(session, user, wallet.organization_id)
    if accessible_wallet_ids is None or wallet.id in accessible_wallet_ids:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a esta carteira")


def send_system_email(to_email: str, subject: str, text_body: str, html_body: str | None = None) -> bool:
    """Send transactional email through SMTP. Returns False when not configured or on failure."""
    if not SMTP_HOST:
        return False
    message = EmailMessage()
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
            if SMTP_STARTTLS:
                smtp.starttls()
            if SMTP_USERNAME:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.send_message(message)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[NEWLAW][email] Falha ao enviar e-mail para {to_email}: {exc}")
        return False


def issue_invite_token(user: User) -> str:
    token = secrets.token_urlsafe(32)
    user.reset_token_hash = hash_token(token)
    user.reset_token_expires_at = datetime.utcnow() + timedelta(hours=INVITE_TOKEN_EXPIRE_HOURS)
    user.email_verified = False
    user.updated_at = datetime.utcnow()
    return token


def build_invite_link(token: str) -> str:
    separator = "&" if "?" in INVITE_BASE_URL else "?"
    return f"{INVITE_BASE_URL}{separator}token={token}"


def send_member_invite_email(recipient_email: str, recipient_name: str, organization_name: str, token: str) -> bool:
    invite_link = build_invite_link(token)
    subject = "NEWLAW - Convite para acesso"
    text_body = (
        f"Olá, {recipient_name}.\n\n"
        f"Você recebeu um convite para acessar a organização '{organization_name}' no NEWLAW.\n"
        f"Para criar sua senha, acesse: {invite_link}\n\n"
        f"Esse link expira em {INVITE_TOKEN_EXPIRE_HOURS} horas."
    )
    html_body = (
        f"<p>Olá, {recipient_name}.</p>"
        f"<p>Você recebeu um convite para acessar a organização <strong>{organization_name}</strong> no NEWLAW.</p>"
        f"<p><a href=\"{invite_link}\">Clique aqui para criar sua senha</a></p>"
        f"<p>Esse link expira em {INVITE_TOKEN_EXPIRE_HOURS} horas.</p>"
    )
    return send_system_email(recipient_email, subject, text_body, html_body)


def render_invite_password_page(token: str, message: str | None = None, success: bool = False) -> str:
    tone_color = "#166534" if success else "#9f1239"
    notice = f"<p style='color:{tone_color};margin:0 0 16px 0;'>{message}</p>" if message else ""
    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NEWLAW - Criar senha</title>
    <style>
      body {{
        margin: 0;
        font-family: Arial, sans-serif;
        background: #f4f6fb;
        color: #0f1e3f;
      }}
      .wrap {{
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }}
      .card {{
        width: 100%;
        max-width: 420px;
        background: #fff;
        border: 1px solid #d9e1ef;
        border-radius: 14px;
        padding: 24px;
      }}
      h1 {{
        margin: 0 0 8px 0;
        font-size: 22px;
      }}
      p {{
        margin: 0 0 16px 0;
      }}
      label {{
        display: block;
        margin: 8px 0 6px 0;
        font-weight: 700;
      }}
      input {{
        width: 100%;
        box-sizing: border-box;
        height: 42px;
        border-radius: 8px;
        border: 1px solid #c2cde3;
        padding: 0 12px;
      }}
      button {{
        margin-top: 14px;
        width: 100%;
        height: 42px;
        border-radius: 8px;
        border: none;
        background: #0f1e3f;
        color: #fff;
        font-weight: 700;
        cursor: pointer;
      }}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Definir senha</h1>
        <p>Crie sua senha para acessar o NEWLAW.</p>
        {notice}
        <form method="post" action="/invite">
          <input type="hidden" name="token" value="{token}" />
          <label>Nova senha</label>
          <input type="password" name="password" required minlength="{PASSWORD_MIN_LENGTH}" />
          <label>Confirmar senha</label>
          <input type="password" name="confirm_password" required minlength="{PASSWORD_MIN_LENGTH}" />
          <button type="submit">Salvar senha</button>
        </form>
      </div>
    </div>
  </body>
</html>"""


def build_calendar_cipher() -> Fernet:
    secret = CALENDAR_TOKEN_KEY or JWT_SECRET
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


CALENDAR_TOKEN_CIPHER = build_calendar_cipher()
MEETING_URL_PATTERN = re.compile(r"https?://[^\s<>]+", re.IGNORECASE)
MEETING_HOST_HINTS = (
    "teams.microsoft.com",
    "meet.google.com",
    "zoom.us",
    "webex.com",
    "whereby.com",
)


def encrypt_calendar_token(raw: str | None) -> str | None:
    if not raw:
        return None
    return CALENDAR_TOKEN_CIPHER.encrypt(raw.encode("utf-8")).decode("utf-8")


def decrypt_calendar_token(encrypted: str | None) -> str | None:
    if not encrypted:
        return None
    try:
        return CALENDAR_TOKEN_CIPHER.decrypt(encrypted.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao ler credenciais de calendário salvas.",
        ) from exc


def cleanup_expired_oauth_states() -> None:
    now = datetime.utcnow()
    for state, payload in list(PENDING_OAUTH_STATES.items()):
        expires_at = payload.get("expires_at")
        if isinstance(expires_at, datetime) and expires_at <= now:
            PENDING_OAUTH_STATES.pop(state, None)


def normalize_calendar_provider(raw_provider: str) -> str:
    provider = raw_provider.strip().lower()
    if provider not in CALENDAR_PROVIDERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provedor de calendário não suportado")
    return provider


def get_calendar_provider_credentials(provider: str) -> tuple[str, str]:
    if provider == "google":
        client_id = GOOGLE_OAUTH_CLIENT_ID
        client_secret = GOOGLE_OAUTH_CLIENT_SECRET
    else:
        client_id = MICROSOFT_OAUTH_CLIENT_ID
        client_secret = MICROSOFT_OAUTH_CLIENT_SECRET
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Integração {provider} não configurada no servidor.",
        )
    return client_id, client_secret


def resolve_calendar_redirect_uri(request: Request) -> str:
    if CALENDAR_REDIRECT_URI:
        return CALENDAR_REDIRECT_URI
    forwarded_proto = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    forwarded_host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc).split(",")[0].strip()
    if not forwarded_proto or not forwarded_host:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível determinar a URL de retorno do calendário.",
        )
    return f"{forwarded_proto}://{forwarded_host}/calendar/oauth/callback"


def build_calendar_oauth_url(provider: str, state: str, redirect_uri: str) -> str:
    client_id, _ = get_calendar_provider_credentials(provider)
    if provider == "google":
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/calendar.events.readonly",
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return f"{GOOGLE_OAUTH_AUTHORIZE_URL}?{urlencode(params)}"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "response_mode": "query",
        "scope": "offline_access Calendars.Read User.Read",
        "prompt": "select_account",
        "state": state,
    }
    return f"{MICROSOFT_OAUTH_AUTHORIZE_URL}?{urlencode(params)}"


def register_calendar_oauth_state(user: User, provider: str, redirect_uri: str) -> tuple[str, int]:
    if user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")
    cleanup_expired_oauth_states()
    state = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=OAUTH_STATE_TTL_MINUTES)
    PENDING_OAUTH_STATES[state] = {
        "user_id": user.id,
        "provider": provider,
        "redirect_uri": redirect_uri,
        "expires_at": expires_at,
    }
    return state, OAUTH_STATE_TTL_MINUTES * 60


def normalize_iso_datetime(value: str) -> str:
    output = value.strip()
    if output.endswith("Z"):
        output = f"{output[:-1]}+00:00"
    if "." not in output:
        return output
    head, tail = output.split(".", 1)
    tz_index = len(tail)
    plus_index = tail.find("+")
    minus_index = tail.find("-")
    if plus_index != -1:
        tz_index = min(tz_index, plus_index)
    if minus_index != -1:
        tz_index = min(tz_index, minus_index)
    fraction = tail[:tz_index]
    timezone_part = tail[tz_index:]
    if len(fraction) > 6:
        fraction = fraction[:6]
    if fraction:
        return f"{head}.{fraction}{timezone_part}"
    return f"{head}{timezone_part}"


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(normalize_iso_datetime(value))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def parse_datetime_query(value: str, field_name: str) -> datetime:
    raw = value.strip()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} é obrigatório")
    if len(raw) == 10:
        try:
            return datetime.fromisoformat(raw)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} inválido") from exc
    parsed = parse_iso_datetime(raw)
    if not parsed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} inválido")
    return parsed


def to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        aware = value.replace(tzinfo=timezone.utc)
    else:
        aware = value.astimezone(timezone.utc)
    return aware.isoformat().replace("+00:00", "Z")


def perform_json_request(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
) -> dict[str, Any]:
    request_headers = {"Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    request = UrlRequest(url, data=body, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=20) as response:
            payload = response.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")
        print(f"[NEWLAW][calendar] HTTP {exc.code} em {url}: {detail[:300]}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Falha ao conectar com o provedor de calendário.",
        ) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível alcançar o provedor de calendário.",
        ) from exc
    if not payload:
        return {}
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return {}


def post_form_request(url: str, form_data: dict[str, str]) -> dict[str, Any]:
    encoded = urlencode(form_data).encode("utf-8")
    return perform_json_request(
        "POST",
        url,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=encoded,
    )


def get_meeting_url(*candidates: str | None) -> str | None:
    for candidate in candidates:
        if not candidate:
            continue
        for match in MEETING_URL_PATTERN.findall(candidate):
            cleaned = match.rstrip(".,);")
            if any(host in cleaned.lower() for host in MEETING_HOST_HINTS):
                return cleaned
    return None


def exchange_calendar_oauth_code(provider: str, code: str, redirect_uri: str) -> dict[str, Any]:
    client_id, client_secret = get_calendar_provider_credentials(provider)
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if provider == "google":
        return post_form_request(GOOGLE_OAUTH_TOKEN_URL, payload)
    payload["scope"] = "offline_access Calendars.Read User.Read"
    return post_form_request(MICROSOFT_OAUTH_TOKEN_URL, payload)


def refresh_calendar_access_token(provider: str, refresh_token: str) -> dict[str, Any]:
    client_id, client_secret = get_calendar_provider_credentials(provider)
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if provider == "google":
        return post_form_request(GOOGLE_OAUTH_TOKEN_URL, payload)
    payload["scope"] = "offline_access Calendars.Read User.Read"
    return post_form_request(MICROSOFT_OAUTH_TOKEN_URL, payload)


def fetch_provider_profile_email(provider: str, access_token: str) -> str | None:
    auth = {"Authorization": f"Bearer {access_token}"}
    if provider == "google":
        data = perform_json_request("GET", GOOGLE_USERINFO_URL, headers=auth)
        email = data.get("email")
        return email if isinstance(email, str) else None
    data = perform_json_request("GET", MICROSOFT_PROFILE_URL, headers=auth)
    email = data.get("mail") or data.get("userPrincipalName")
    return email if isinstance(email, str) else None


def get_calendar_connection(
    session: Session,
    user_id: int,
    provider: str,
) -> CalendarConnection | None:
    return session.exec(
        select(CalendarConnection).where(
            CalendarConnection.user_id == user_id,
            CalendarConnection.provider == provider,
        )
    ).first()


def save_calendar_connection_tokens(
    session: Session,
    connection: CalendarConnection,
    token_payload: dict[str, Any],
    provider_email: str | None,
) -> CalendarConnection:
    access_token = token_payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resposta inválida do provedor de calendário")
    refresh_token = token_payload.get("refresh_token")
    expires_in = token_payload.get("expires_in")
    scope = token_payload.get("scope")
    connection.access_token_encrypted = encrypt_calendar_token(access_token) or ""
    if isinstance(refresh_token, str) and refresh_token:
        connection.refresh_token_encrypted = encrypt_calendar_token(refresh_token)
    if isinstance(expires_in, int):
        connection.token_expires_at = datetime.utcnow() + timedelta(seconds=max(expires_in - 60, 0))
    else:
        connection.token_expires_at = datetime.utcnow() + timedelta(minutes=50)
    if isinstance(scope, str) and scope.strip():
        connection.scope = scope.strip()
    if provider_email is not None:
        connection.provider_email = provider_email
    elif connection.provider == "google":
        # Google no longer asks for profile scopes in this flow.
        connection.provider_email = None
    connection.is_active = True
    connection.sync_error = None
    connection.updated_at = datetime.utcnow()
    session.add(connection)
    session.commit()
    session.refresh(connection)
    return connection


def ensure_calendar_access_token(session: Session, connection: CalendarConnection) -> str:
    now = datetime.utcnow()
    token_expires_at = connection.token_expires_at
    if token_expires_at and token_expires_at > now + timedelta(minutes=2):
        current_token = decrypt_calendar_token(connection.access_token_encrypted)
        if current_token:
            return current_token
    refresh_token = decrypt_calendar_token(connection.refresh_token_encrypted)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Reconecte seu calendário para atualizar os eventos.",
        )
    refreshed = refresh_calendar_access_token(connection.provider, refresh_token)
    provider_email = None
    if connection.provider != "google" and refreshed.get("access_token"):
        provider_email = fetch_provider_profile_email(connection.provider, refreshed.get("access_token", ""))
    updated = save_calendar_connection_tokens(session, connection, refreshed, provider_email)
    access_token = decrypt_calendar_token(updated.access_token_encrypted)
    if not access_token:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao recuperar token de calendário")
    return access_token


def parse_google_event_datetime(item: dict[str, Any], field: str) -> tuple[datetime | None, bool]:
    block = item.get(field) if isinstance(item.get(field), dict) else {}
    date_time = block.get("dateTime")
    if isinstance(date_time, str):
        return parse_iso_datetime(date_time), False
    date_value = block.get("date")
    if isinstance(date_value, str):
        return parse_iso_datetime(f"{date_value}T00:00:00+00:00"), True
    return None, False


def fetch_google_calendar_events(access_token: str, window_start: datetime, window_end: datetime) -> list[dict[str, Any]]:
    params = {
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": "2500",
        "timeMin": to_utc_iso(window_start),
        "timeMax": to_utc_iso(window_end),
    }
    url = f"{GOOGLE_EVENTS_URL}?{urlencode(params)}"
    data = perform_json_request("GET", url, headers={"Authorization": f"Bearer {access_token}"})
    items = data.get("items", [])
    if not isinstance(items, list):
        return []
    events: list[dict[str, Any]] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        external_event_id = raw.get("id")
        if not isinstance(external_event_id, str) or not external_event_id:
            continue
        starts_at, start_all_day = parse_google_event_datetime(raw, "start")
        ends_at, end_all_day = parse_google_event_datetime(raw, "end")
        if not starts_at:
            continue
        is_all_day = start_all_day or end_all_day
        if not ends_at:
            ends_at = starts_at + (timedelta(days=1) if is_all_day else timedelta(hours=1))
        if is_all_day and ends_at <= starts_at:
            ends_at = starts_at + timedelta(days=1)
        if is_all_day and ends_at > starts_at:
            ends_at = ends_at - timedelta(seconds=1)
        description = raw.get("description")
        location = raw.get("location")
        events.append(
            {
                "source_key": f"google:{external_event_id}",
                "external_event_id": external_event_id,
                "calendar_id": "primary",
                "title": raw.get("summary") or "(Sem título)",
                "description": description if isinstance(description, str) else None,
                "location": location if isinstance(location, str) else None,
                "starts_at": starts_at,
                "ends_at": ends_at,
                "is_all_day": is_all_day,
                "is_cancelled": raw.get("status") == "cancelled",
                "organizer_email": ((raw.get("organizer") or {}).get("email") if isinstance(raw.get("organizer"), dict) else None),
                "meeting_url": raw.get("hangoutLink") if isinstance(raw.get("hangoutLink"), str) else get_meeting_url(description, location),
                "status": raw.get("status") if isinstance(raw.get("status"), str) else None,
                "updated_remote_at": parse_iso_datetime(raw.get("updated") if isinstance(raw.get("updated"), str) else None),
            }
        )
    return events


def parse_microsoft_event_datetime(block: dict[str, Any] | None) -> datetime | None:
    if not isinstance(block, dict):
        return None
    date_time = block.get("dateTime")
    time_zone_name = block.get("timeZone")
    if not isinstance(date_time, str):
        return None
    if "+" not in date_time and "Z" not in date_time and isinstance(time_zone_name, str) and time_zone_name.upper() == "UTC":
        date_time = f"{date_time}+00:00"
    return parse_iso_datetime(date_time)


def fetch_microsoft_calendar_events(access_token: str, window_start: datetime, window_end: datetime) -> list[dict[str, Any]]:
    params = {
        "startDateTime": to_utc_iso(window_start),
        "endDateTime": to_utc_iso(window_end),
        "$top": "500",
        "$select": "id,subject,bodyPreview,start,end,location,isAllDay,onlineMeeting,webLink,organizer,lastModifiedDateTime,isCancelled,showAs",
    }
    next_url = f"{MICROSOFT_EVENTS_URL}?{urlencode(params)}"
    events: list[dict[str, Any]] = []
    fetched_pages = 0
    while next_url and fetched_pages < 5:
        fetched_pages += 1
        data = perform_json_request("GET", next_url, headers={"Authorization": f"Bearer {access_token}"})
        items = data.get("value", [])
        if isinstance(items, list):
            for raw in items:
                if not isinstance(raw, dict):
                    continue
                external_event_id = raw.get("id")
                if not isinstance(external_event_id, str) or not external_event_id:
                    continue
                starts_at = parse_microsoft_event_datetime(raw.get("start"))
                ends_at = parse_microsoft_event_datetime(raw.get("end"))
                is_all_day = bool(raw.get("isAllDay"))
                if not starts_at:
                    continue
                if not ends_at:
                    ends_at = starts_at + (timedelta(days=1) if is_all_day else timedelta(hours=1))
                if is_all_day and ends_at <= starts_at:
                    ends_at = starts_at + timedelta(days=1)
                if is_all_day and ends_at > starts_at:
                    ends_at = ends_at - timedelta(seconds=1)
                organizer = raw.get("organizer") if isinstance(raw.get("organizer"), dict) else {}
                email_address = organizer.get("emailAddress") if isinstance(organizer.get("emailAddress"), dict) else {}
                location = raw.get("location") if isinstance(raw.get("location"), dict) else {}
                online_meeting = raw.get("onlineMeeting") if isinstance(raw.get("onlineMeeting"), dict) else {}
                body_preview = raw.get("bodyPreview")
                location_name = location.get("displayName") if isinstance(location.get("displayName"), str) else None
                web_link = raw.get("webLink") if isinstance(raw.get("webLink"), str) else None
                join_url = online_meeting.get("joinUrl") if isinstance(online_meeting.get("joinUrl"), str) else None
                events.append(
                    {
                        "source_key": f"microsoft:{external_event_id}",
                        "external_event_id": external_event_id,
                        "calendar_id": "primary",
                        "title": raw.get("subject") or "(Sem título)",
                        "description": body_preview if isinstance(body_preview, str) else None,
                        "location": location_name,
                        "starts_at": starts_at,
                        "ends_at": ends_at,
                        "is_all_day": is_all_day,
                        "is_cancelled": bool(raw.get("isCancelled")),
                        "organizer_email": email_address.get("address") if isinstance(email_address.get("address"), str) else None,
                        "meeting_url": join_url or get_meeting_url(body_preview, web_link, location_name),
                        "status": raw.get("showAs") if isinstance(raw.get("showAs"), str) else None,
                        "updated_remote_at": parse_iso_datetime(
                            raw.get("lastModifiedDateTime") if isinstance(raw.get("lastModifiedDateTime"), str) else None
                        ),
                    }
                )
        next_link = data.get("@odata.nextLink")
        next_url = next_link if isinstance(next_link, str) else ""
    return events


def upsert_external_calendar_events(
    session: Session,
    connection: CalendarConnection,
    events: list[dict[str, Any]],
    window_start: datetime,
    window_end: datetime,
) -> int:
    source_keys = [event["source_key"] for event in events if isinstance(event.get("source_key"), str)]
    existing_map: dict[str, ExternalCalendarEvent] = {}
    if source_keys:
        existing_records = session.exec(
            select(ExternalCalendarEvent).where(
                ExternalCalendarEvent.user_id == connection.user_id,
                ExternalCalendarEvent.provider == connection.provider,
                ExternalCalendarEvent.source_key.in_(source_keys),
            )
        ).all()
        existing_map = {record.source_key: record for record in existing_records}

    for payload in events:
        source_key = payload["source_key"]
        record = existing_map.get(source_key)
        if not record:
            record = ExternalCalendarEvent(
                connection_id=connection.id,
                user_id=connection.user_id,
                organization_id=connection.organization_id,
                provider=connection.provider,
                source_key=source_key,
                external_event_id=payload["external_event_id"],
                calendar_id=payload.get("calendar_id"),
                title=payload["title"],
                description=payload.get("description"),
                location=payload.get("location"),
                starts_at=payload["starts_at"],
                ends_at=payload["ends_at"],
                is_all_day=payload.get("is_all_day", False),
                is_cancelled=payload.get("is_cancelled", False),
                organizer_email=payload.get("organizer_email"),
                meeting_url=payload.get("meeting_url"),
                status=payload.get("status"),
                updated_remote_at=payload.get("updated_remote_at"),
            )
            session.add(record)
            continue
        record.connection_id = connection.id
        record.organization_id = connection.organization_id
        record.title = payload["title"]
        record.description = payload.get("description")
        record.location = payload.get("location")
        record.starts_at = payload["starts_at"]
        record.ends_at = payload["ends_at"]
        record.is_all_day = payload.get("is_all_day", False)
        record.is_cancelled = payload.get("is_cancelled", False)
        record.organizer_email = payload.get("organizer_email")
        record.meeting_url = payload.get("meeting_url")
        record.status = payload.get("status")
        record.updated_remote_at = payload.get("updated_remote_at")
        record.updated_at = datetime.utcnow()
        session.add(record)

    visible_records = session.exec(
        select(ExternalCalendarEvent).where(
            ExternalCalendarEvent.user_id == connection.user_id,
            ExternalCalendarEvent.provider == connection.provider,
            ExternalCalendarEvent.starts_at <= window_end,
            ExternalCalendarEvent.ends_at >= window_start,
        )
    ).all()
    visible_keys = set(source_keys)
    for record in visible_records:
        if record.source_key not in visible_keys and not record.is_cancelled:
            record.is_cancelled = True
            record.updated_at = datetime.utcnow()
            session.add(record)

    session.commit()
    return len(events)


def sync_calendar_connection_events(
    session: Session,
    connection: CalendarConnection,
    window_start: datetime,
    window_end: datetime,
) -> int:
    try:
        token = ensure_calendar_access_token(session, connection)
        if connection.provider == "google":
            events = fetch_google_calendar_events(token, window_start, window_end)
        else:
            events = fetch_microsoft_calendar_events(token, window_start, window_end)
        total = upsert_external_calendar_events(session, connection, events, window_start, window_end)
        connection.last_synced_at = datetime.utcnow()
        connection.sync_error = None
        connection.updated_at = datetime.utcnow()
        session.add(connection)
        session.commit()
        return total
    except HTTPException as exc:
        connection.sync_error = str(exc.detail)
        connection.updated_at = datetime.utcnow()
        session.add(connection)
        session.commit()
        raise
    except Exception as exc:  # noqa: BLE001
        connection.sync_error = f"Falha inesperada: {exc}"
        connection.updated_at = datetime.utcnow()
        session.add(connection)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao sincronizar eventos do calendário.",
        ) from exc


def ensure_calendar_data_fresh(
    session: Session,
    user: User,
    window_start: datetime,
    window_end: datetime,
    force: bool = False,
) -> None:
    if user.id is None:
        return
    connections = session.exec(
        select(CalendarConnection).where(
            CalendarConnection.user_id == user.id,
            CalendarConnection.is_active == True,  # noqa: E712
        )
    ).all()
    now = datetime.utcnow()
    for connection in connections:
        should_sync = force or not connection.last_synced_at or (
            connection.last_synced_at <= now - timedelta(minutes=CALENDAR_SYNC_INTERVAL_MINUTES)
        )
        if not should_sync:
            continue
        try:
            sync_calendar_connection_events(session, connection, window_start, window_end)
        except HTTPException:
            # Falhas de um provedor não devem bloquear o carregamento dos demais dados da agenda.
            continue


def parse_agenda_window(start: str | None, end: str | None) -> tuple[datetime, datetime]:
    today = datetime.utcnow()
    default_start = datetime(today.year, today.month, 1)
    if today.month == 12:
        default_end = datetime(today.year + 1, 2, 1)
    else:
        default_end = datetime(today.year, today.month + 2, 1)
    window_start = parse_datetime_query(start, "start") if start else default_start
    window_end = parse_datetime_query(end, "end") if end else default_end
    if window_end <= window_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Período da agenda inválido")
    return window_start, window_end


def parse_deadline_due_date(raw_value: str) -> datetime:
    value = raw_value.strip()
    if not value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data do prazo é obrigatória")
    if len(value) == 10:
        try:
            return datetime.fromisoformat(value)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data do prazo inválida") from exc
    parsed = parse_iso_datetime(value)
    if not parsed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data do prazo inválida")
    return parsed


INTERNAL_AGENDA_EVENT_TYPES = {"deadline", "meeting", "hearing", "audit"}


def normalize_internal_agenda_event_type(raw_value: str | None) -> str:
    value = (raw_value or "").strip().lower()
    aliases = {
        "prazo": "deadline",
        "reuniao": "meeting",
        "reunião": "meeting",
        "audiencia": "hearing",
        "audiência": "hearing",
        "auditoria": "audit",
    }
    normalized = aliases.get(value, value or "deadline")
    return normalized if normalized in INTERNAL_AGENDA_EVENT_TYPES else "deadline"


def normalize_internal_agenda_time(raw_value: str | None) -> str | None:
    value = (raw_value or "").strip()
    if not value:
        return None
    try:
        parsed = datetime.strptime(value, "%H:%M")
    except ValueError:
        return None
    return parsed.strftime("%H:%M")


def parse_internal_agenda_metadata(raw_notes: str | None) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "notes": None,
        "event_type": "deadline",
        "meeting_url": None,
        "assignees": None,
        "end_time": None,
        "assignee_id": None,
        "assignee_name": None,
        "is_all_day": True,
        "publication_source_key": None,
        "publication_process_number": None,
        "publication_detail_url": None,
        "created_via": None,
    }
    if not raw_notes:
        return metadata
    try:
        parsed = json.loads(raw_notes)
    except (TypeError, json.JSONDecodeError):
        metadata["notes"] = raw_notes.strip() or None
        return metadata
    if not isinstance(parsed, dict) or not parsed.get("_agenda_internal"):
        metadata["notes"] = raw_notes.strip() or None
        return metadata
    metadata["notes"] = parsed.get("notes").strip() if isinstance(parsed.get("notes"), str) and parsed.get("notes").strip() else None
    metadata["event_type"] = normalize_internal_agenda_event_type(parsed.get("event_type"))
    metadata["meeting_url"] = (
        parsed.get("meeting_url").strip() if isinstance(parsed.get("meeting_url"), str) and parsed.get("meeting_url").strip() else None
    )
    metadata["assignees"] = (
        parsed.get("assignees").strip() if isinstance(parsed.get("assignees"), str) and parsed.get("assignees").strip() else None
    )
    metadata["end_time"] = normalize_internal_agenda_time(parsed.get("end_time") if isinstance(parsed.get("end_time"), str) else None)
    metadata["assignee_id"] = parsed.get("assignee_id") if isinstance(parsed.get("assignee_id"), int) else None
    metadata["assignee_name"] = (
        parsed.get("assignee_name").strip()
        if isinstance(parsed.get("assignee_name"), str) and parsed.get("assignee_name").strip()
        else None
    )
    metadata["is_all_day"] = bool(parsed.get("is_all_day", True))
    metadata["publication_source_key"] = (
        parsed.get("publication_source_key").strip()
        if isinstance(parsed.get("publication_source_key"), str) and parsed.get("publication_source_key").strip()
        else None
    )
    metadata["publication_process_number"] = (
        parsed.get("publication_process_number").strip()
        if isinstance(parsed.get("publication_process_number"), str) and parsed.get("publication_process_number").strip()
        else None
    )
    metadata["publication_detail_url"] = (
        parsed.get("publication_detail_url").strip()
        if isinstance(parsed.get("publication_detail_url"), str) and parsed.get("publication_detail_url").strip()
        else None
    )
    metadata["created_via"] = (
        parsed.get("created_via").strip()
        if isinstance(parsed.get("created_via"), str) and parsed.get("created_via").strip()
        else None
    )
    return metadata


def serialize_internal_agenda_metadata(
    *,
    notes: str | None,
    event_type: str,
    meeting_url: str | None,
    assignees: str | None,
    end_time: str | None,
    assignee_id: int | None,
    assignee_name: str | None,
    is_all_day: bool,
    publication_source_key: str | None = None,
    publication_process_number: str | None = None,
    publication_detail_url: str | None = None,
    created_via: str | None = None,
) -> str | None:
    payload = {
        "_agenda_internal": True,
        "notes": (notes or "").strip() or None,
        "event_type": normalize_internal_agenda_event_type(event_type),
        "meeting_url": (meeting_url or "").strip() or None,
        "assignees": (assignees or "").strip() or None,
        "end_time": normalize_internal_agenda_time(end_time),
        "assignee_id": assignee_id,
        "assignee_name": (assignee_name or "").strip() or None,
        "is_all_day": bool(is_all_day),
        "publication_source_key": (publication_source_key or "").strip() or None,
        "publication_process_number": (publication_process_number or "").strip() or None,
        "publication_detail_url": (publication_detail_url or "").strip() or None,
        "created_via": (created_via or "").strip() or None,
    }
    if not any(value for key, value in payload.items() if key != "_agenda_internal") and is_all_day:
        return None
    return json.dumps(payload, ensure_ascii=False)


def serialize_calendar_connection_status(provider: str, connection: CalendarConnection | None) -> dict[str, Any]:
    return {
        "provider": provider,
        "connected": bool(connection and connection.is_active),
        "provider_email": connection.provider_email if connection else None,
        "last_synced_at": connection.last_synced_at if connection else None,
        "sync_error": connection.sync_error if connection else None,
    }


def serialize_deadline(deadline: AgendaDeadline) -> dict[str, Any]:
    metadata = parse_internal_agenda_metadata(deadline.notes)
    event_type = normalize_internal_agenda_event_type(metadata.get("event_type"))
    is_all_day = bool(metadata.get("is_all_day", True))
    assignees = metadata.get("assignees") or metadata.get("assignee_name")
    ends_at = deadline.due_at + timedelta(hours=1)
    end_time = normalize_internal_agenda_time(metadata.get("end_time"))
    if not is_all_day and end_time:
        hour, minute = map(int, end_time.split(":"))
        ends_at = deadline.due_at.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if ends_at <= deadline.due_at:
            ends_at = ends_at + timedelta(days=1)
    return {
        "id": f"deadline-{deadline.id}",
        "entity_id": deadline.id,
        "kind": "deadline" if event_type == "deadline" else "meeting",
        "source": "internal",
        "title": deadline.title,
        "starts_at": deadline.due_at.isoformat(timespec="seconds"),
        "ends_at": ends_at.isoformat(timespec="seconds"),
        "is_all_day": is_all_day,
        "location": None,
        "meeting_url": metadata.get("meeting_url"),
        "reference": deadline.reference,
        "description": metadata.get("notes"),
        "status": "concluido" if deadline.is_completed else "pendente",
        "event_type": event_type,
        "assignee_name": assignees,
        "assignees": assignees,
        "publication_source_key": metadata.get("publication_source_key"),
        "publication_process_number": metadata.get("publication_process_number"),
        "publication_detail_url": metadata.get("publication_detail_url"),
        "created_via": metadata.get("created_via"),
    }


def serialize_external_datetime(value: datetime, *, is_all_day: bool) -> str:
    # All-day items are represented as date-local midnight for UI grouping.
    if is_all_day:
        return value.isoformat(timespec="seconds")
    # Timed items are stored as UTC-naive and must be tagged as UTC for correct client rendering.
    return to_utc_iso(value)


def serialize_external_event(event: ExternalCalendarEvent) -> dict[str, Any]:
    return {
        "id": f"external-{event.id}",
        "entity_id": event.id,
        "kind": "meeting",
        "source": event.provider,
        "title": event.title,
        "starts_at": serialize_external_datetime(event.starts_at, is_all_day=event.is_all_day),
        "ends_at": serialize_external_datetime(event.ends_at, is_all_day=event.is_all_day),
        "is_all_day": event.is_all_day,
        "location": event.location,
        "meeting_url": event.meeting_url,
        "reference": event.organizer_email,
        "description": event.description,
        "status": "cancelado" if event.is_cancelled else (event.status or "confirmado"),
    }


def agenda_item_sort_key(item: dict[str, Any]) -> tuple[datetime, str]:
    raw_start = item.get("starts_at")
    parsed_start = parse_iso_datetime(raw_start) if isinstance(raw_start, str) else None
    if parsed_start is None:
        parsed_start = datetime.min
    raw_kind = item.get("kind")
    kind = raw_kind if isinstance(raw_kind, str) else ""
    return parsed_start, kind


def render_calendar_callback_page(success: bool, message: str) -> str:
    state = "success" if success else "error"
    safe_message = escape(message)
    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NEWLAW - Integração de calendário</title>
    <style>
      body {{
        margin: 0;
        font-family: Arial, sans-serif;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f4f6fb;
        color: #0f1e3f;
      }}
      .card {{
        width: min(420px, 92vw);
        background: white;
        border-radius: 14px;
        border: 1px solid #dbe2f3;
        padding: 24px;
      }}
      .title {{
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 8px;
      }}
      .message {{
        color: {"#166534" if success else "#9f1239"};
        font-weight: 600;
      }}
      .hint {{
        margin-top: 14px;
        color: #526287;
        font-size: 13px;
      }}
      .actions {{
        margin-top: 16px;
        display: flex;
        justify-content: flex-start;
      }}
      .btn {{
        height: 40px;
        border-radius: 10px;
        border: 1px solid #0f1e3f;
        background: #0f1e3f;
        color: #ffffff;
        font-weight: 700;
        font-size: 14px;
        padding: 0 14px;
        cursor: pointer;
      }}
    </style>
  </head>
  <body>
    <div class="card">
      <div class="title">Integração de calendário</div>
      <div class="message">{safe_message}</div>
      <div class="hint" id="callbackHint">Você já pode voltar para o NEWLAW.</div>
      <div class="actions">
        <button class="btn" type="button" onclick="backToApp()">Voltar ao app</button>
      </div>
    </div>
    <script>
      function notifyOpener() {{
        try {{
          if (window.opener) {{
            window.opener.postMessage({{ type: "newlaw-calendar-oauth", status: "{state}" }}, "*");
            window.opener.focus();
          }}
        }} catch (err) {{}}
      }}

      function backToApp() {{
        notifyOpener();
        try {{
          window.close();
        }} catch (err) {{}}
        if (window.opener) return;
        if (window.history.length > 1) {{
          // OAuth can run inside the same webview tab; jump back to the first
          // history entry (usually the NEWLAW app) instead of only one step.
          window.history.go(-(window.history.length - 1));
          return;
        }}
        var hint = document.getElementById("callbackHint");
        if (hint) {{
          hint.textContent = "Retorne manualmente para a janela principal do NEWLAW.";
        }}
      }}

      notifyOpener();
      if (window.opener) {{
        setTimeout(function() {{
          try {{
            window.close();
          }} catch (err) {{}}
        }}, 1200);
      }}
    </script>
  </body>
</html>"""


def create_access_token(user: User) -> str:
    expires = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "type": "access",
        "exp": expires,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(
    user: User,
    session: Session,
    user_agent: Optional[str],
    ip_address: Optional[str],
) -> str:
    expires = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user.id),
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
        "exp": expires,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    token_hash = hash_token(token)
    refresh = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    session.add(refresh)
    session.commit()
    session.refresh(refresh)
    return token


def issue_auth_tokens(
    session: Session,
    user: User,
    request: Request,
    user_agent: Optional[str],
) -> TokenPairResponse:
    access_token = create_access_token(user)
    refresh_token = create_refresh_token(user, session, user_agent, get_client_ip(request))
    user.last_login_at = datetime.utcnow()
    user.failed_login_count = 0
    user.locked_until = None
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return TokenPairResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=serialize_auth_user(session, user),
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido") from exc


def get_client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def ensure_user_not_locked(user: User) -> None:
    if user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Conta temporariamente bloqueada por tentativas inválidas",
        )


def mark_failed_login(user: User, session: Session) -> None:
    user.failed_login_count += 1
    if user.failed_login_count >= LOCKOUT_MAX_ATTEMPTS:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()


def revoke_refresh_tokens(session: Session, user_id: int) -> None:
    tokens = session.exec(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at == None)  # noqa: E712
    ).all()
    if not tokens:
        return
    now = datetime.utcnow()
    for token in tokens:
        token.revoked_at = now
    session.add_all(tokens)
    session.commit()


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais ausentes")
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user = session.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo")
    return user


def validate_security_config() -> None:
    if ENVIRONMENT == "production" and JWT_SECRET == "dev-secret-change":
        raise RuntimeError("NEWLAW_JWT_SECRET precisa ser definido em produção")
    if ENVIRONMENT == "production" and not ADMIN_SECRET:
        raise RuntimeError("NEWLAW_ADMIN_SECRET precisa ser definido em produção")


def require_admin_secret(x_admin_secret: Annotated[str | None, Header()] = None) -> None:
    if not ADMIN_SECRET:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Admin secret not configured")
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin secret")


def seed_master_admin(session: Session) -> None:
    """Ensure there is at least one master admin user linked to a default organization."""
    email = os.getenv("NEWLAW_MASTER_EMAIL", "master@newlaw.app.br")
    password = os.getenv("NEWLAW_MASTER_PASSWORD", "Newlaw#2026!Master")
    full_name = os.getenv("NEWLAW_MASTER_NAME", "Administrador")
    organization_name = os.getenv("NEWLAW_MASTER_ORGANIZATION_NAME", "Organização Principal")
    default_plan_slug = os.getenv("NEWLAW_MASTER_PLAN_SLUG", "dev")

    plan = session.exec(select(Plan).where(Plan.slug == default_plan_slug, Plan.is_active == True)).first()  # noqa: E712
    if not plan:
        plan = session.exec(select(Plan).where(Plan.is_active == True)).first()  # noqa: E712

    organization = session.exec(select(Organization).where(Organization.name == organization_name)).first()
    if not organization:
        organization = Organization(
            name=organization_name,
            plan_id=plan.id if plan else None,
            is_active=True,
        )
        session.add(organization)
        session.commit()
        session.refresh(organization)
    elif not organization.is_active:
        organization.is_active = True
        if organization.plan_id is None and plan:
            organization.plan_id = plan.id
        session.add(organization)
        session.commit()
        session.refresh(organization)

    organization_id = get_organization_pk(organization)
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        updated = False
        if existing.organization_id is None:
            existing.organization_id = organization_id
            updated = True
        if not existing.is_active:
            existing.is_active = True
            updated = True
        if updated:
            existing.updated_at = datetime.utcnow()
            session.add(existing)
            session.commit()
        return
    validate_password_strength(password)
    admin = User(
        organization_id=organization_id,
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        role="superadmin",
        is_active=True,
    )
    session.add(admin)
    session.commit()


def seed_templates(session: Session) -> None:
    """Insert a couple of demo templates to be used in the UI."""
    if session.exec(select(Template)).first():
        return
    base = Template(
        slug="peticao-inicial",
        name="Peticão Inicial Padrão",
        description="Modelo base com dados do cliente e do processo.",
        content="""
        Prezado(a) {{ cliente.nome }},

        Segue a petição referente ao processo {{ processo.numero }}.

        Atenciosamente,
        {{ advogado }}
        """.strip(),
    )
    session.add(base)
    session.commit()


def seed_plans(session: Session) -> None:
    """Upsert basic plan presets."""
    plan_presets = [
        ("basic", "Basic", 3),
        ("team", "Team", 10),
        ("enterprise", "Enterprise", 50),
        ("dev", "Dev", 50),
    ]
    updated = False
    for slug, name, user_limit in plan_presets:
        existing = session.exec(select(Plan).where(Plan.slug == slug)).first()
        if existing:
            if existing.name != name or existing.user_limit != user_limit or not existing.is_active:
                existing.name = name
                existing.user_limit = user_limit
                existing.is_active = True
                session.add(existing)
                updated = True
            continue
        session.add(Plan(slug=slug, name=name, user_limit=user_limit, is_active=True))
        updated = True
    if updated:
        session.commit()


def ensure_schema_columns() -> None:
    """Add newly introduced columns for existing installations without migrations."""
    dialect = engine.url.get_backend_name()
    boolean_type = "BOOLEAN NOT NULL DEFAULT FALSE" if dialect == "postgresql" else "INTEGER NOT NULL DEFAULT 0"
    text_type = "TEXT"

    table_user = User.__table__.name
    table_team_member = TeamMember.__table__.name

    required_columns = {
        table_user: {
            "is_team_admin": boolean_type,
            "allowed_nav_keys": text_type,
        },
        table_team_member: {
            "is_team_admin": boolean_type,
            "allowed_nav_keys": text_type,
        },
    }

    with engine.begin() as connection:
        inspector = inspect(connection)
        for table_name, columns in required_columns.items():
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_definition in columns.items():
                if column_name in existing:
                    continue
                connection.execute(
                    text(f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {column_definition}')
                )


def ensure_finance_schema() -> None:
    """Create finance storage for installations that predate the shared finance table."""
    SQLModel.metadata.create_all(engine, tables=[FinancialEntry.__table__])


def init_db() -> None:
    os.makedirs(STORAGE_PATH, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    ensure_schema_columns()
    ensure_finance_schema()
    with Session(engine) as session:
        seed_plans(session)
        seed_master_admin(session)
        seed_templates(session)


app = FastAPI(
    title="NEWLAW Local API",
    description="API local usada pelo app desktop (Tauri) para dados e autenticação.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "tauri://localhost",  # Tauri webview
        "http://tauri.localhost",
        "https://tauri.localhost",
        "http://localhost",
        "https://localhost",
        *PUBLIC_WEB_ORIGINS,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class LicenseResponse(BaseModel):
    status: str
    plan: str
    expires_at: str | None = None
    message: str | None = None


class CreateOrganizationRequest(BaseModel):
    organization_name: str
    plan_slug: str
    owner_email: str
    owner_password: str
    owner_full_name: str
    owner_phone: str | None = None
    user_limit_override: int | None = None


class PublicOfficeSignupRequest(BaseModel):
    office_name: str
    owner_full_name: str
    owner_email: str
    owner_password: str
    owner_phone: str | None = None


class CreateUserRequest(BaseModel):
    organization_id: int
    email: str
    password: str
    full_name: str
    phone: str | None = None
    role: str = "member"


class CreateClientRequest(BaseModel):
    name: str
    document: str | None = None
    email: str | None = None
    phone: str | None = None
    notes: str | None = None
    organization_id: int | None = None


class UpdateClientRequest(BaseModel):
    name: str
    document: str | None = None
    email: str | None = None
    phone: str | None = None
    notes: str | None = None
    organization_id: int | None = None


class CreateCaseRequest(BaseModel):
    number: str
    title: str
    client_id: int | None = None
    wallet_id: int | None = None
    status: str = "aberto"
    forum: str | None = None
    court: str | None = None
    value: float | None = None
    organization_id: int | None = None


class UpdateCaseRequest(BaseModel):
    number: str
    title: str
    client_id: int | None = None
    wallet_id: int | None = None
    status: str = "aberto"
    forum: str | None = None
    court: str | None = None
    value: float | None = None
    organization_id: int | None = None


class CreateWalletRequest(BaseModel):
    nickname: str
    description: str | None = None
    is_active: bool = True
    team_member_ids: list[int] | None = None
    organization_id: int | None = None


class UpdateWalletRequest(BaseModel):
    nickname: str
    description: str | None = None
    is_active: bool = True
    team_member_ids: list[int] | None = None
    organization_id: int | None = None


class CreateTeamMemberRequest(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    cpf: str
    oab: str
    role_title: str
    team_name: str
    notes: str | None = None
    is_admin: bool = False
    allowed_nav_keys: list[str] | None = None
    is_active: bool = True
    organization_id: int | None = None


class UpdateTeamMemberRequest(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    cpf: str
    oab: str
    role_title: str
    team_name: str
    notes: str | None = None
    is_admin: bool = False
    allowed_nav_keys: list[str] | None = None
    is_active: bool = True
    organization_id: int | None = None


class TeamMembersCapacityResponse(BaseModel):
    organization_id: int
    plan_slug: str | None = None
    plan_name: str | None = None
    user_limit: int | None = None
    active_users: int
    available_slots: int | None = None


class CalendarConnectionStartResponse(BaseModel):
    provider: str
    auth_url: str
    state: str
    expires_in_seconds: int


class CalendarConnectionStatusResponse(BaseModel):
    provider: str
    connected: bool
    provider_email: str | None = None
    last_synced_at: datetime | None = None
    sync_error: str | None = None


class AgendaDeadlineCreateRequest(BaseModel):
    title: str
    due_date: str
    reference: str | None = None
    notes: str | None = None
    event_type: str | None = None
    meeting_url: str | None = None
    assignees: str | None = None
    end_time: str | None = None
    is_all_day: bool = True


class AgendaSyncResponse(BaseModel):
    provider: str
    synced_events: int
    last_synced_at: datetime


class FinanceEntryCreateRequest(BaseModel):
    entry_type: str
    category: str
    amount: float
    due_date: str
    client_id: int | None = None
    case_id: int | None = None
    client_name: str | None = None
    case_number: str | None = None
    payment_date: str | None = None
    payment_method: str | None = None
    expense_type: str | None = None
    recurring: str | None = None
    paid_amount: float | None = None
    installments: int | None = None
    attachment_name: str | None = None
    organization_id: int | None = None


class FinanceEntryUpdateRequest(BaseModel):
    payment_date: str | None = None
    payment_method: str | None = None
    paid_amount: float | None = None
    organization_id: int | None = None


class FinanceEntryResponse(BaseModel):
    id: int
    organization_id: int
    created_by_user_id: int | None = None
    entry_type: str
    category: str
    client_id: int | None = None
    case_id: int | None = None
    client_name: str | None = None
    case_number: str | None = None
    amount: float
    due_date: str
    payment_date: str | None = None
    payment_method: str | None = None
    expense_type: str | None = None
    recurring: str | None = None
    paid_amount: float | None = None
    installments: int | None = None
    attachment_name: str | None = None


class ClientDocumentResponse(BaseModel):
    id: int
    organization_id: int | None = None
    client_id: int
    case_id: int | None = None
    folder_label: str
    original_name: str
    content_type: str
    size_bytes: int
    created_at: datetime
    updated_at: datetime


class PublicationAutomationUpdateRequest(BaseModel):
    is_enabled: bool
    schedule_time: str


class PublicationRecordSummaryResponse(BaseModel):
    id: int
    title: str
    publication_date: datetime
    client_name: str | None = None
    case_number: str | None = None
    matched_via: str | None = None
    created_at: datetime


class PublicationAutomationConfigResponse(BaseModel):
    organization_id: int
    is_enabled: bool
    schedule_time: str
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    last_status: str | None = None
    last_message: str | None = None
    last_new_records: int = 0
    last_existing_records: int = 0
    last_failed_records: int = 0
    is_running: bool = False
    recent_records: list[PublicationRecordSummaryResponse] = []


class PublicationAutomationRunResponse(BaseModel):
    started_at: datetime
    finished_at: datetime
    new_records: int
    existing_records: int
    failed_records: int
    message: str
    config: PublicationAutomationConfigResponse


class TodayPublicationItemResponse(BaseModel):
    id: int
    hash: str
    title: str
    publication_date: str
    tribunal: str | None = None
    court_name: str | None = None
    process_number: str | None = None
    communication_type: str | None = None
    detail_url: str
    summary: str | None = None


class TodayPublicationsResponse(BaseModel):
    member_name: str
    member_email: str
    oab: str
    publication_date: str
    count: int
    items: list[TodayPublicationItemResponse]


class PublicationSearchByOabRequest(BaseModel):
    oab_number: str
    oab_uf: str
    member_name: str
    member_email: str
    publication_date: str


class PublicationContextRequestItem(BaseModel):
    source_key: str
    process_number: str | None = None


class PublicationContextRequest(BaseModel):
    items: list[PublicationContextRequestItem]


class PublicationResponsibleResponse(BaseModel):
    name: str
    email: str


class PublicationContextResponseItem(BaseModel):
    source_key: str
    status: str | None = None
    handled_at: datetime | None = None
    has_registered_case: bool = False
    case_id: int | None = None
    case_number: str | None = None
    wallet_id: int | None = None
    wallet_name: str | None = None
    allow_additional_responsibles: bool = False
    allowed_responsibles: list[PublicationResponsibleResponse] = []
    warning: str | None = None


class PublicationContextResponse(BaseModel):
    items: list[PublicationContextResponseItem]


class PublicationHandleRequest(BaseModel):
    source_key: str
    publication_title: str
    publication_date: str
    process_number: str | None = None
    detail_url: str
    summary: str | None = None
    action: str
    task_title: str | None = None
    task_details: str | None = None
    due_date: str | None = None
    responsible_emails: list[str] | None = None
    include_actor_responsible: bool = True
    allow_office_wide_responsibles: bool = False


class PublicationHandleResponse(BaseModel):
    source_key: str
    status: str
    handled_at: datetime
    created_agenda_items: int = 0
    message: str


def resolve_organization_scope(
    user: User,
    session: Session,
    requested_organization_id: int | None = None,
) -> int | None:
    if user.role == "superadmin":
        if requested_organization_id is None and user.organization_id:
            requested_organization_id = user.organization_id
        if requested_organization_id is None:
            return None
        organization = session.get(Organization, requested_organization_id)
        if not organization or not organization.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização inválida")
        return organization.id

    if not user.organization_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário sem organização vinculada")

    if requested_organization_id is not None and requested_organization_id != user.organization_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para esta organização")

    return user.organization_id


def resolve_existing_record_scope(
    user: User,
    session: Session,
    record_organization_id: int | None,
) -> int | None:
    return resolve_organization_scope(user, session, record_organization_id)


def resolve_organization_entity(
    user: User,
    session: Session,
    requested_organization_id: int | None = None,
) -> Organization:
    scope_organization_id = resolve_organization_scope(user, session, requested_organization_id)
    if scope_organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe organization_id para contexto de organização",
        )
    organization = session.get(Organization, scope_organization_id)
    if not organization or not organization.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização inválida")
    return organization


def get_organization_pk(organization: Organization) -> int:
    if organization.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Organização sem identificador")
    return organization.id


def get_organization_user_limit(session: Session, organization: Organization) -> tuple[int | None, str | None, str | None]:
    plan_slug: str | None = None
    plan_name: str | None = None
    user_limit = organization.user_limit_override
    if organization.plan_id:
        plan = session.get(Plan, organization.plan_id)
        if plan:
            plan_slug = plan.slug
            plan_name = plan.name
            if user_limit is None:
                user_limit = plan.user_limit
    return user_limit, plan_slug, plan_name


def count_active_organization_users(session: Session, organization_id: int, ignore_user_id: int | None = None) -> int:
    query = select(User).where(User.organization_id == organization_id, User.is_active == True)  # noqa: E712
    if ignore_user_id is not None:
        query = query.where(User.id != ignore_user_id)
    return len(session.exec(query).all())


def ensure_organization_user_capacity(
    session: Session,
    organization: Organization,
    additional_slots: int = 1,
    ignore_user_id: int | None = None,
) -> None:
    organization_id = get_organization_pk(organization)
    user_limit, _, _ = get_organization_user_limit(session, organization)
    if user_limit is None:
        return
    active_users = count_active_organization_users(session, organization_id, ignore_user_id=ignore_user_id)
    if active_users + additional_slots > user_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limite de usuários ativos do plano atingido ({active_users}/{user_limit}).",
        )


def serialize_team_members_capacity(session: Session, organization: Organization) -> dict:
    organization_id = get_organization_pk(organization)
    user_limit, plan_slug, plan_name = get_organization_user_limit(session, organization)
    active_users = count_active_organization_users(session, organization_id)
    return TeamMembersCapacityResponse(
        organization_id=organization_id,
        plan_slug=plan_slug,
        plan_name=plan_name,
        user_limit=user_limit,
        active_users=active_users,
        available_slots=None if user_limit is None else max(user_limit - active_users, 0),
    ).model_dump()


def build_wallet_case_count_map(session: Session, wallet_ids: list[int]) -> dict[int, int]:
    if not wallet_ids:
        return {}
    links = session.exec(select(CaseWallet).where(CaseWallet.wallet_id.in_(wallet_ids))).all()
    counts: dict[int, int] = {}
    for link in links:
        counts[link.wallet_id] = counts.get(link.wallet_id, 0) + 1
    return counts


def normalize_wallet_team_member_ids(raw_ids: list[int] | None) -> list[int]:
    cleaned: list[int] = []
    seen: set[int] = set()
    for raw_id in raw_ids or []:
        try:
            member_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Membros inválidos para esta carteira") from exc
        if member_id <= 0 or member_id in seen:
            continue
        seen.add(member_id)
        cleaned.append(member_id)
    return cleaned


def resolve_wallet_team_members(session: Session, organization_id: int | None, raw_ids: list[int] | None) -> list[TeamMember]:
    member_ids = normalize_wallet_team_member_ids(raw_ids)
    if not member_ids:
        return []
    query = select(TeamMember).where(TeamMember.id.in_(member_ids))
    if organization_id is None:
        query = query.where(TeamMember.organization_id == None)  # noqa: E711
    else:
        query = query.where(TeamMember.organization_id == organization_id)
    members = session.exec(query).all()
    member_map = {member.id: member for member in members if member.id is not None}
    ordered = [member_map[member_id] for member_id in member_ids if member_id in member_map]
    if len(ordered) != len(member_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Membros inválidos para esta carteira")
    return ordered


def serialize_wallet_team_member(member: TeamMember) -> dict:
    return {
        "id": member.id,
        "full_name": member.full_name,
        "email": member.email,
        "team_name": member.team_name,
        "role_title": member.role_title,
        "is_active": member.is_active,
    }


def get_wallet_team_member_lookup(session: Session, wallet_ids: list[int]) -> dict[int, list[TeamMember]]:
    if not wallet_ids:
        return {}
    access_rows = session.exec(select(WalletTeamMemberAccess).where(WalletTeamMemberAccess.wallet_id.in_(wallet_ids))).all()
    if not access_rows:
        return {}
    member_ids = list({row.team_member_id for row in access_rows})
    members = session.exec(select(TeamMember).where(TeamMember.id.in_(member_ids))).all()
    member_map = {member.id: member for member in members if member.id is not None}
    lookup: dict[int, list[TeamMember]] = {}
    for row in access_rows:
        member = member_map.get(row.team_member_id)
        if not member:
            continue
        lookup.setdefault(row.wallet_id, []).append(member)
    for members_list in lookup.values():
        members_list.sort(key=lambda item: (item.full_name or "").lower())
    return lookup


def sync_wallet_team_member_access(session: Session, wallet: Wallet, team_member_ids: list[int]) -> None:
    if wallet.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carteira inválida")
    desired_ids = set(normalize_wallet_team_member_ids(team_member_ids))
    existing_rows = session.exec(select(WalletTeamMemberAccess).where(WalletTeamMemberAccess.wallet_id == wallet.id)).all()
    existing_ids = {row.team_member_id for row in existing_rows}
    for row in existing_rows:
        if row.team_member_id not in desired_ids:
            session.delete(row)
    for member_id in desired_ids - existing_ids:
        session.add(WalletTeamMemberAccess(wallet_id=wallet.id, team_member_id=member_id))


def serialize_wallet(wallet: Wallet, case_count: int = 0, team_members: list[TeamMember] | None = None) -> dict:
    assigned_members = team_members or []
    return {
        "id": wallet.id,
        "organization_id": wallet.organization_id,
        "number": wallet.number,
        "name": wallet.name,
        "nickname": wallet.nickname,
        "description": wallet.description,
        "is_active": wallet.is_active,
        "case_count": case_count,
        "team_member_ids": [member.id for member in assigned_members if member.id is not None],
        "team_members": [serialize_wallet_team_member(member) for member in assigned_members],
        "created_at": wallet.created_at,
        "updated_at": wallet.updated_at,
    }


def get_next_wallet_number(session: Session, organization_id: int | None) -> int:
    query = select(Wallet.number)
    if organization_id is not None:
        query = query.where(Wallet.organization_id == organization_id)
    current = session.exec(query).all()
    return (max(current) if current else 0) + 1


def resolve_wallet_for_case(
    session: Session,
    wallet_id: int | None,
    case_organization_id: int | None,
    user: User | None = None,
) -> Wallet | None:
    if wallet_id is None:
        return None
    wallet = session.get(Wallet, wallet_id)
    if not wallet or not wallet.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carteira inválida")
    if wallet.organization_id != case_organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Carteira inválida para esta organização")
    if user is not None:
        ensure_user_can_access_wallet(session, user, wallet)
    return wallet


def sync_case_wallet_assignment(session: Session, case_id: int, wallet_id: int | None) -> None:
    existing_links = session.exec(select(CaseWallet).where(CaseWallet.case_id == case_id)).all()
    if wallet_id is None:
        for existing_link in existing_links:
            session.delete(existing_link)
        session.flush()
        return
    existing = existing_links[0] if existing_links else None
    if existing:
        existing.wallet_id = wallet_id
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        for duplicate_link in existing_links[1:]:
            session.delete(duplicate_link)
        return
    session.add(CaseWallet(case_id=case_id, wallet_id=wallet_id))


def get_case_wallet_lookup(session: Session, case_ids: list[int]) -> dict[int, Wallet]:
    if not case_ids:
        return {}
    links = session.exec(select(CaseWallet).where(CaseWallet.case_id.in_(case_ids))).all()
    if not links:
        return {}
    wallet_ids = list({link.wallet_id for link in links})
    wallets = session.exec(select(Wallet).where(Wallet.id.in_(wallet_ids))).all()
    wallet_map = {wallet.id: wallet for wallet in wallets if wallet.id is not None}
    lookup: dict[int, Wallet] = {}
    for link in links:
        wallet = wallet_map.get(link.wallet_id)
        if wallet:
            lookup[link.case_id] = wallet
    return lookup


def serialize_case(case: Case, wallet: Wallet | None = None) -> dict:
    return {
        "id": case.id,
        "organization_id": case.organization_id,
        "number": case.number,
        "title": case.title,
        "client_id": case.client_id,
        "status": case.status,
        "forum": case.forum,
        "court": case.court,
        "value": case.value,
        "wallet_id": wallet.id if wallet else None,
        "wallet_name": wallet.name if wallet else None,
        "wallet_nickname": wallet.nickname if wallet else None,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
    }


def serialize_case_list(session: Session, cases: list[Case], wallet_lookup: dict[int, Wallet] | None = None) -> list[dict]:
    lookup = wallet_lookup if wallet_lookup is not None else get_case_wallet_lookup(session, [case.id for case in cases if case.id is not None])
    output: list[dict] = []
    for case in cases:
        wallet = lookup.get(case.id) if case.id is not None else None
        output.append(serialize_case(case, wallet))
    return output


def validate_case_payload(payload: CreateCaseRequest | UpdateCaseRequest) -> dict[str, Any]:
    number = (payload.number or "").strip()
    if not CASE_NUMBER_PATTERN.fullmatch(number):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe o número completo do processo no padrão 0000000-00.0000.0.00.0000",
        )
    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Título é obrigatório")
    if payload.client_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cliente é obrigatório")
    if payload.wallet_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Carteira é obrigatória")
    forum = (payload.forum or "").strip().upper()
    if not forum:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comarca é obrigatória")
    court = (payload.court or "").strip().upper()
    if not court:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vara é obrigatória")
    status_value = (payload.status or "aberto").strip() or "aberto"
    return {
        "number": number,
        "title": title,
        "forum": forum,
        "court": court,
        "status": status_value,
    }


def parse_finance_date(raw_value: str | None, field_name: str, *, required: bool = False) -> datetime | None:
    if raw_value is None:
        if required:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} é obrigatório")
        return None
    value = raw_value.strip()
    if not value:
        if required:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} é obrigatório")
        return None
    if len(value) == 10:
        try:
            return datetime.fromisoformat(value)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} inválido") from exc
    parsed = parse_iso_datetime(value)
    if parsed is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} inválido")
    return parsed


def resolve_finance_client(session: Session, organization_id: int, client_id: int | None) -> Client | None:
    if client_id is None:
        return None
    client = session.get(Client, client_id)
    if not client or client.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pessoa/cliente inválido para este lançamento")
    return client


def resolve_finance_case(session: Session, organization_id: int, case_id: int | None) -> Case | None:
    if case_id is None:
        return None
    case = session.get(Case, case_id)
    if not case or case.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo inválido para este lançamento")
    return case


def serialize_financial_entry(entry: FinancialEntry, client: Client | None = None, case: Case | None = None) -> dict[str, Any]:
    client_name = entry.client_name_snapshot or (client.name if client else None)
    case_number = entry.case_number_snapshot or (case.number if case else None)
    return {
        "id": entry.id,
        "organization_id": entry.organization_id,
        "created_by_user_id": entry.created_by_user_id,
        "entry_type": entry.entry_type,
        "category": entry.category,
        "client_id": entry.client_id,
        "case_id": entry.case_id,
        "client_name": client_name,
        "case_number": case_number,
        "amount": entry.amount,
        "due_date": entry.due_date.date().isoformat(),
        "payment_date": entry.payment_date.date().isoformat() if entry.payment_date else None,
        "payment_method": entry.payment_method,
        "expense_type": entry.expense_type,
        "recurring": entry.recurring,
        "paid_amount": entry.paid_amount,
        "installments": entry.installments,
        "attachment_name": entry.attachment_name,
    }


def normalize_document_folder_label(raw_value: str) -> str:
    label = (raw_value or "").strip()
    if not label:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecione a pasta de destino")
    if len(label) > 80:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome da pasta muito longo")
    if "/" in label or "\\" in label:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome da pasta inválido")
    return label


def slugify_storage_segment(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return cleaned.strip("-") or "arquivo"


def resolve_client_for_documents(session: Session, user: User, client_id: int) -> Client:
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado")
    resolve_existing_record_scope(user, session, client.organization_id)
    return client


def resolve_case_for_documents(session: Session, user: User, case_id: int | None) -> Case | None:
    if case_id is None:
        return None
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    resolve_existing_record_scope(user, session, case.organization_id)
    return case


def serialize_client_document(document: ClientDocument) -> dict[str, Any]:
    return {
        "id": document.id,
        "organization_id": document.organization_id,
        "client_id": document.client_id,
        "case_id": document.case_id,
        "folder_label": document.folder_label,
        "original_name": document.original_name,
        "content_type": document.content_type,
        "size_bytes": document.size_bytes,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
    }


def get_documents_root_path() -> str:
    root = os.path.join(STORAGE_PATH, "documents")
    os.makedirs(root, exist_ok=True)
    return root


def build_document_storage_relative_path(client: Client, case: Case | None, folder_label: str, extension: str = ".pdf") -> tuple[str, str]:
    if client.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Cliente sem identificador")
    organization_segment = f"org_{client.organization_id}" if client.organization_id is not None else "org_shared"
    folder_segment = slugify_storage_segment(folder_label)
    stored_name = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(8)}{extension}"
    relative_path = os.path.join(
        organization_segment,
        f"client_{client.id}",
        f"case_{case.id}" if case and case.id is not None else "client_root",
        folder_segment,
        stored_name,
    )
    absolute_directory = os.path.dirname(os.path.join(get_documents_root_path(), relative_path))
    os.makedirs(absolute_directory, exist_ok=True)
    return stored_name, relative_path


def get_allowed_document_extension(original_name: str) -> str | None:
    extension = os.path.splitext(original_name.lower())[1]
    if extension in FILES_ALLOWED_UPLOADS:
        return extension
    return None


def get_document_storage_content_type(extension: str) -> str:
    config = FILES_ALLOWED_UPLOADS.get(extension)
    if not config:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de documento não suportado")
    return str(config["storage_content_type"])


def validate_uploaded_document_content(extension: str, content: bytes) -> None:
    if extension == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo inválido. Envie um PDF válido")
        return
    if extension == ".doc":
        if not content.startswith(b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo inválido. Envie um documento Word válido")
        return
    if extension == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                file_names = set(archive.namelist())
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo inválido. Envie um documento Word válido") from exc
        if "[Content_Types].xml" not in file_names or "word/document.xml" not in file_names:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo inválido. Envie um documento Word válido")
        return
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de documento não suportado")


def get_document_absolute_path(storage_relative_path: str) -> str:
    documents_root = os.path.abspath(get_documents_root_path())
    absolute_path = os.path.abspath(os.path.join(documents_root, storage_relative_path))
    if absolute_path != documents_root and not absolute_path.startswith(f"{documents_root}{os.sep}"):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Caminho de arquivo inválido")
    return absolute_path


def remove_document_file(storage_relative_path: str) -> None:
    absolute_path = get_document_absolute_path(storage_relative_path)
    if os.path.exists(absolute_path):
        os.remove(absolute_path)
    stop_path = os.path.abspath(get_documents_root_path())
    current_dir = os.path.dirname(absolute_path)
    while current_dir.startswith(stop_path) and current_dir != stop_path:
        try:
            os.rmdir(current_dir)
        except OSError:
            break
        current_dir = os.path.dirname(current_dir)


def purge_documents(session: Session, documents: list[ClientDocument]) -> None:
    for document in documents:
        remove_document_file(document.storage_path)
        session.delete(document)


def get_publication_sync_lock(organization_id: int) -> threading.Lock:
    with PUBLICATION_SYNC_LOCKS_GUARD:
        lock = PUBLICATION_SYNC_LOCKS.get(organization_id)
        if lock is None:
            lock = threading.Lock()
            PUBLICATION_SYNC_LOCKS[organization_id] = lock
        return lock


def is_publication_sync_running(organization_id: int) -> bool:
    return get_publication_sync_lock(organization_id).locked()


def get_local_now() -> datetime:
    return datetime.now(APP_TIMEZONE).replace(tzinfo=None)


def validate_publication_schedule_time(raw_value: str | None) -> str:
    value = (raw_value or "").strip()
    if not re.fullmatch(r"\d{2}:\d{2}", value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Horário inválido. Use o formato HH:MM")
    hours, minutes = value.split(":")
    hour = int(hours)
    minute = int(minutes)
    if hour > 23 or minute > 59:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Horário inválido. Use um horário entre 00:00 e 23:59")
    return f"{hour:02d}:{minute:02d}"


def parse_publication_schedule_time(value: str) -> tuple[int, int]:
    clean = validate_publication_schedule_time(value)
    hours, minutes = clean.split(":")
    return int(hours), int(minutes)


def compute_next_publication_run_at(config: PublicationAutomationConfig, now_local: datetime | None = None) -> datetime:
    reference = now_local or get_local_now()
    hour, minute = parse_publication_schedule_time(config.schedule_time)
    next_run = reference.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if config.last_run_at and config.last_run_at.date() == reference.date() and config.last_run_at >= next_run:
        next_run = next_run + timedelta(days=1)
    elif reference > next_run:
        next_run = next_run + timedelta(days=1)
    return next_run


def should_run_publication_sync(config: PublicationAutomationConfig, now_local: datetime | None = None) -> bool:
    if not config.is_enabled:
        return False
    reference = now_local or get_local_now()
    hour, minute = parse_publication_schedule_time(config.schedule_time)
    scheduled_for_today = reference.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if reference < scheduled_for_today:
        return False
    if config.last_run_at and config.last_run_at.date() == reference.date() and config.last_run_at >= scheduled_for_today:
        return False
    return True


def get_or_create_publication_config(session: Session, organization_id: int) -> PublicationAutomationConfig:
    config = session.exec(
        select(PublicationAutomationConfig).where(PublicationAutomationConfig.organization_id == organization_id)
    ).first()
    if config:
        return config
    config = PublicationAutomationConfig(
        organization_id=organization_id,
        is_enabled=False,
        schedule_time=PUBLICATIONS_DEFAULT_SCHEDULE_TIME,
    )
    session.add(config)
    session.commit()
    session.refresh(config)
    return config


def strip_html_text(value: str | None) -> str:
    if not value:
        return ""
    without_tags = re.sub(r"<[^>]+>", " ", value)
    normalized = re.sub(r"\s+", " ", unescape(without_tags)).strip()
    return normalized


def normalize_case_number_digits(value: str | None) -> str:
    return "".join(char for char in (value or "") if char.isdigit())


def format_case_number_from_digits(value: str | None) -> str | None:
    digits = normalize_case_number_digits(value)
    if len(digits) != 20:
        return None
    return f"{digits[:7]}-{digits[7:9]}.{digits[9:13]}.{digits[13]}.{digits[14:16]}.{digits[16:]}"


def normalize_publication_match_text(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.upper()
    normalized = re.sub(r"[^A-Z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def parse_team_member_oab(value: str | None) -> dict[str, str] | None:
    raw = (value or "").strip().upper()
    if not raw:
        return None
    compact = re.sub(r"\s+", "", raw)
    match = re.search(r"(?P<number>\d+)[^A-Z0-9]?(?P<uf>[A-Z]{2})$", compact)
    if match:
        number = match.group("number")
        uf = match.group("uf")
    else:
        number = "".join(char for char in compact if char.isdigit())
        letters = "".join(char for char in compact if char.isalpha())
        uf = letters[-2:] if len(letters) >= 2 else ""
    if not number:
        return None
    normalized = f"{number}/{uf}" if uf else number
    return {
        "number": number,
        "uf": uf,
        "normalized": normalized,
    }


def make_publication_file_name(title: str, publication_date: datetime) -> str:
    slug = slugify_storage_segment(strip_html_text(title)[:90])
    return f"publicacao-{publication_date.date().isoformat()}-{slug}.pdf"


def store_internal_client_document_pdf(
    session: Session,
    *,
    client: Client,
    case: Case | None,
    folder_label: str,
    original_name: str,
    content: bytes,
) -> ClientDocument:
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo de publicação inválido")
    label = normalize_document_folder_label(folder_label)
    stored_name, storage_relative_path = build_document_storage_relative_path(client, case, label, ".pdf")
    absolute_path = get_document_absolute_path(storage_relative_path)
    with open(absolute_path, "wb") as buffer:
        buffer.write(content)
    document = ClientDocument(
        organization_id=client.organization_id,
        uploaded_by_user_id=None,
        client_id=client.id,
        case_id=case.id if case and case.id is not None else None,
        folder_label=label,
        original_name=original_name,
        stored_name=stored_name,
        storage_path=storage_relative_path,
        content_type="application/pdf",
        size_bytes=len(content),
    )
    session.add(document)
    session.flush()
    return document


def publication_record_has_local_document(session: Session, record: PublicationRecord) -> bool:
    if not record.document_storage_path:
        return False
    try:
        absolute_path = get_document_absolute_path(record.document_storage_path)
    except HTTPException:
        return False
    if not os.path.exists(absolute_path):
        return False
    if record.document_id is None:
        return False
    return session.get(ClientDocument, record.document_id) is not None


def serialize_publication_record_summary(record: PublicationRecord) -> dict[str, Any]:
    return PublicationRecordSummaryResponse(
        id=record.id or 0,
        title=record.title,
        publication_date=record.publication_date,
        client_name=record.client_name_snapshot,
        case_number=record.case_number_snapshot,
        matched_via=record.matched_via,
        created_at=record.created_at,
    ).model_dump()


def build_publication_config_response(
    session: Session,
    config: PublicationAutomationConfig,
) -> dict[str, Any]:
    recent_records = session.exec(
        select(PublicationRecord)
        .where(PublicationRecord.organization_id == config.organization_id)
        .order_by(PublicationRecord.created_at.desc())
    ).all()[:5]
    return PublicationAutomationConfigResponse(
        organization_id=config.organization_id,
        is_enabled=config.is_enabled,
        schedule_time=config.schedule_time,
        last_run_at=config.last_run_at,
        next_run_at=compute_next_publication_run_at(config),
        last_status=config.last_status,
        last_message=config.last_message,
        last_new_records=config.last_new_records,
        last_existing_records=config.last_existing_records,
        last_failed_records=config.last_failed_records,
        is_running=is_publication_sync_running(config.organization_id),
        recent_records=[serialize_publication_record_summary(record) for record in recent_records],
    ).model_dump()


def build_publication_search_targets(
    session: Session,
    organization_id: int,
) -> tuple[list[dict[str, Any]], list[str]]:
    members = session.exec(
        select(TeamMember).where(
            TeamMember.organization_id == organization_id,
            TeamMember.is_active == True,  # noqa: E712
        )
    ).all()
    targets: list[dict[str, Any]] = []
    skipped_members: list[str] = []
    seen: set[tuple[str, str]] = set()

    for member in members:
        parsed_oab = parse_team_member_oab(member.oab)
        if parsed_oab is None or not parsed_oab["uf"]:
            skipped_members.append(member.full_name)
            continue
        key = (parsed_oab["number"], parsed_oab["uf"])
        if key in seen:
            continue
        seen.add(key)
        targets.append(
            {
                "number": parsed_oab["number"],
                "uf": parsed_oab["uf"],
                "oab": parsed_oab["normalized"],
                "member_name": member.full_name,
            }
        )

    return targets, skipped_members


def build_publication_case_lookup(session: Session, organization_id: int) -> dict[str, tuple[Case, Client]]:
    clients = session.exec(select(Client).where(Client.organization_id == organization_id)).all()
    client_map = {client.id: client for client in clients if client.id is not None}
    cases = session.exec(select(Case).where(Case.organization_id == organization_id)).all()
    lookup: dict[str, tuple[Case, Client]] = {}

    for case in cases:
        if case.id is None or case.client_id is None:
            continue
        client = client_map.get(case.client_id)
        if client is None:
            continue
        digits = normalize_case_number_digits(case.number)
        if digits and digits not in lookup:
            lookup[digits] = (case, client)

    return lookup


def build_publication_client_name_lookup(session: Session, organization_id: int) -> dict[str, Client]:
    clients = session.exec(select(Client).where(Client.organization_id == organization_id)).all()
    lookup: dict[str, Client] = {}
    for client in clients:
        if client.id is None:
            continue
        normalized_name = normalize_publication_match_text(client.name)
        if normalized_name and normalized_name not in lookup:
            lookup[normalized_name] = client
    return lookup


PUBLICATION_HANDLING_STATUSES = {"task_created", "read_no_action"}


def normalize_publication_source_key(raw_value: str) -> str:
    value = (raw_value or "").strip()
    if not value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identificador da publicação é obrigatório")
    return value


def normalize_publication_handling_status(raw_value: str | None) -> str | None:
    value = (raw_value or "").strip().lower()
    return value if value in PUBLICATION_HANDLING_STATUSES else None


def parse_publication_date_value(raw_value: str) -> datetime:
    value = (raw_value or "").strip()
    if not value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data da publicação é obrigatória")
    if len(value) == 10:
        try:
            return datetime.fromisoformat(value)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data da publicação inválida") from exc
    parsed = parse_iso_datetime(value)
    if not parsed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data da publicação inválida")
    return parsed


def get_publication_handling_lookup(
    session: Session,
    organization_id: int,
    source_keys: list[str],
) -> dict[str, PublicationHandling]:
    cleaned_source_keys = [normalize_publication_source_key(item) for item in source_keys if (item or "").strip()]
    if not cleaned_source_keys:
        return {}
    records = session.exec(
        select(PublicationHandling).where(
            PublicationHandling.organization_id == organization_id,
            PublicationHandling.source_key.in_(cleaned_source_keys),
        )
    ).all()
    return {record.source_key: record for record in records}


def build_publication_responsible_options(
    session: Session,
    organization_id: int,
    members: list[TeamMember],
) -> list[dict[str, str]]:
    options: list[dict[str, str]] = []
    seen_emails: set[str] = set()
    for member in members:
        if not member.is_active:
            continue
        email = normalize_email(member.email)
        if not email or email in seen_emails:
            continue
        linked_user = get_user_by_email(session, email)
        if not linked_user or linked_user.id is None or not linked_user.is_active or linked_user.organization_id != organization_id:
            continue
        seen_emails.add(email)
        label = (member.full_name or "").strip() or linked_user.full_name or email
        options.append(PublicationResponsibleResponse(name=label, email=email).model_dump())
    options.sort(key=lambda item: normalize_publication_match_text(item["name"]))
    return options


def build_publication_context_items(
    session: Session,
    organization_id: int,
    items: list[PublicationContextRequestItem],
) -> list[dict[str, Any]]:
    if not items:
        return []

    handling_lookup = get_publication_handling_lookup(session, organization_id, [item.source_key for item in items])
    case_lookup = build_publication_case_lookup(session, organization_id)
    matched_cases = [match[0] for match in case_lookup.values() if match and match[0].id is not None]
    wallet_lookup = get_case_wallet_lookup(session, [case.id for case in matched_cases if case.id is not None])
    wallet_ids = [wallet.id for wallet in wallet_lookup.values() if wallet.id is not None]
    wallet_member_lookup = get_wallet_team_member_lookup(session, wallet_ids)

    response_items: list[dict[str, Any]] = []
    for item in items:
        source_key = normalize_publication_source_key(item.source_key)
        handling = handling_lookup.get(source_key)
        process_digits = normalize_case_number_digits(item.process_number)
        matched = case_lookup.get(process_digits) if process_digits else None
        matched_case = matched[0] if matched else None
        wallet = wallet_lookup.get(matched_case.id) if matched_case and matched_case.id is not None else None
        allowed_responsibles = (
            build_publication_responsible_options(session, organization_id, wallet_member_lookup.get(wallet.id, []))
            if wallet and wallet.id is not None
            else []
        )

        warning: str | None = None
        if matched_case is None:
            warning = "Processo não cadastrado. Você pode gerar apenas um evento no seu calendário."
        elif wallet is None:
            warning = "Processo cadastrado sem carteira vinculada. A tarefa ficará apenas no seu calendário."
        elif not allowed_responsibles:
            warning = "Nenhum outro responsável com acesso à carteira possui login ativo."

        response_items.append(
            PublicationContextResponseItem(
                source_key=source_key,
                status=normalize_publication_handling_status(handling.status if handling else None),
                handled_at=handling.handled_at if handling else None,
                has_registered_case=matched_case is not None,
                case_id=matched_case.id if matched_case and matched_case.id is not None else None,
                case_number=matched_case.number if matched_case else None,
                wallet_id=wallet.id if wallet and wallet.id is not None else None,
                wallet_name=wallet.name if wallet else None,
                allow_additional_responsibles=bool(wallet and allowed_responsibles),
                allowed_responsibles=allowed_responsibles,
                warning=warning,
            ).model_dump()
        )
    return response_items


def upsert_publication_handling_record(
    session: Session,
    *,
    organization_id: int,
    source_key: str,
    publication_title: str,
    publication_date: datetime,
    process_number: str | None,
    detail_url: str,
    summary: str | None,
    matched_case: Case | None,
    wallet: Wallet | None,
) -> PublicationHandling:
    record = session.exec(
        select(PublicationHandling).where(
            PublicationHandling.organization_id == organization_id,
            PublicationHandling.source_key == source_key,
        )
    ).first()
    if record is None:
        record = PublicationHandling(
            organization_id=organization_id,
            source_key=source_key,
            title=publication_title,
            publication_date=publication_date,
            process_number_snapshot=(process_number or "").strip() or None,
            case_id=matched_case.id if matched_case and matched_case.id is not None else None,
            wallet_id=wallet.id if wallet and wallet.id is not None else None,
            detail_url=(detail_url or "").strip() or None,
            summary=(summary or "").strip() or None,
        )
    else:
        record.title = publication_title
        record.publication_date = publication_date
        record.process_number_snapshot = (process_number or "").strip() or None
        record.case_id = matched_case.id if matched_case and matched_case.id is not None else None
        record.wallet_id = wallet.id if wallet and wallet.id is not None else None
        record.detail_url = (detail_url or "").strip() or None
        record.summary = (summary or "").strip() or None
        record.updated_at = datetime.utcnow()
    session.add(record)
    return record


def resolve_publication_task_assignees(
    session: Session,
    *,
    organization_id: int,
    actor_user: User,
    matched_case: Case | None,
    wallet: Wallet | None,
    raw_emails: list[str] | None,
    include_actor_responsible: bool = True,
    allow_office_wide_responsibles: bool = False,
) -> tuple[list[User], list[str], list[str]]:
    if actor_user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")

    actor_email = normalize_email(actor_user.email)
    actor_name = (actor_user.full_name or "").strip() or actor_email
    requested_emails: list[str] = []
    seen_requested: set[str] = set()

    if include_actor_responsible and actor_email:
        requested_emails.append(actor_email)
        seen_requested.add(actor_email)

    for raw_email in raw_emails or []:
        email = normalize_email(raw_email)
        if not email or email in seen_requested:
            continue
        seen_requested.add(email)
        requested_emails.append(email)

    if not requested_emails:
        requested_emails = [actor_email]

    selected_users: list[User] = []
    selected_names: list[str] = []
    selected_emails: list[str] = []

    if allow_office_wide_responsibles:
        team_member_lookup = {
            normalize_email(member.email): member
            for member in session.exec(select(TeamMember).where(TeamMember.organization_id == organization_id)).all()
            if member.email
        }
        for email in requested_emails:
            linked_user = actor_user if email == actor_email else get_user_by_email(session, email)
            if not linked_user or linked_user.id is None or not linked_user.is_active or linked_user.organization_id != organization_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"O responsável {email} não possui login ativo para receber o prazo.",
                )
            member = team_member_lookup.get(email)
            label = (member.full_name or "").strip() if member else ""
            label = label or (linked_user.full_name or "").strip() or email
            selected_users.append(linked_user)
            selected_names.append(label)
            selected_emails.append(email)
        return selected_users, selected_names, selected_emails

    additional_emails = [email for email in requested_emails if email != actor_email]
    if additional_emails:
        if matched_case is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Processo não cadastrado. Não é possível adicionar outros responsáveis.",
            )
        if wallet is None or wallet.id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O processo precisa estar vinculado a uma carteira para compartilhar a tarefa.",
            )

    allowed_names: dict[str, str] = {}
    if additional_emails and wallet and wallet.id is not None:
        allowed_options = build_publication_responsible_options(
            session,
            organization_id,
            get_wallet_team_member_lookup(session, [wallet.id]).get(wallet.id, []),
        )
        allowed_names = {option["email"]: option["name"] for option in allowed_options}

    for email in requested_emails:
        if email == actor_email:
            selected_users.append(actor_user)
            selected_names.append(actor_name)
            selected_emails.append(email)
            continue
        if email not in allowed_names:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Os responsáveis adicionais precisam ter acesso à carteira do processo.",
            )
        linked_user = get_user_by_email(session, email)
        if not linked_user or linked_user.id is None or not linked_user.is_active or linked_user.organization_id != organization_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"O responsável {email} não possui login ativo para receber a tarefa.",
            )
        selected_users.append(linked_user)
        selected_names.append(allowed_names[email])
        selected_emails.append(email)

    return selected_users, selected_names, selected_emails


def create_publication_agenda_deadlines(
    session: Session,
    *,
    assignee_users: list[User],
    assignee_names: list[str],
    due_at: datetime,
    task_title: str,
    task_details: str | None,
    source_key: str,
    process_number: str | None,
    detail_url: str,
) -> int:
    assignees_label = "; ".join(name for name in assignee_names if name)
    reference = f"[Publicação] Processo {process_number}" if (process_number or "").strip() else "[Publicação]"
    created_items = 0

    for assignee_user in assignee_users:
        if assignee_user.id is None:
            continue
        deadline = AgendaDeadline(
            user_id=assignee_user.id,
            organization_id=None,
            title=task_title,
            due_at=due_at,
            reference=reference,
            notes=serialize_internal_agenda_metadata(
                notes=task_details,
                event_type="deadline",
                meeting_url=None,
                assignees=assignees_label or None,
                end_time=None,
                assignee_id=assignee_user.id,
                assignee_name=(assignee_user.full_name or "").strip() or assignee_user.email,
                is_all_day=True,
                publication_source_key=source_key,
                publication_process_number=(process_number or "").strip() or None,
                publication_detail_url=(detail_url or "").strip() or None,
                created_via="publication",
            ),
            is_completed=False,
        )
        session.add(deadline)
        created_items += 1

    return created_items


def request_publications_json(
    http: requests.Session,
    *,
    url: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    for attempt in range(2):
        response = http.get(url, params=params, timeout=PUBLICATIONS_HTTP_TIMEOUT_SECONDS)
        if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS and attempt == 0:
            time.sleep(60)
            continue
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, dict):
            return payload
        raise RuntimeError("O DJEN retornou uma resposta inválida")
    raise RuntimeError("O DJEN excedeu o limite de requisições")


def search_djen_publications(
    http: requests.Session,
    *,
    oab_number: str,
    oab_uf: str,
    publish_from: datetime,
    publish_to: datetime,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    page = 1
    per_page = 100

    while True:
        payload = request_publications_json(
            http,
            url="https://comunicaapi.pje.jus.br/api/v1/comunicacao",
            params={
                "numeroOab": oab_number,
                "ufOab": oab_uf,
                "dataDisponibilizacaoInicio": publish_from.date().isoformat(),
                "dataDisponibilizacaoFim": publish_to.date().isoformat(),
                "itensPorPagina": per_page,
                "pagina": page,
                "meio": "D",
            },
        )
        batch = payload.get("items")
        if not isinstance(batch, list) or not batch:
            break
        items.extend(item for item in batch if isinstance(item, dict))
        total_raw = payload.get("count")
        total = int(total_raw) if isinstance(total_raw, (int, float)) else None
        if len(batch) < per_page or (total is not None and len(items) >= total):
            break
        page += 1

    return items


def build_djen_publication_title(item: dict[str, Any]) -> str:
    process_number = (
        str(item.get("numeroprocessocommascara") or "").strip()
        or format_case_number_from_digits(str(item.get("numero_processo") or "").strip())
        or "sem processo identificado"
    )
    communication_type = str(item.get("tipoComunicacao") or item.get("tipoDocumento") or "Publicação").strip() or "Publicação"
    tribunal = str(item.get("siglaTribunal") or "").strip()
    if tribunal:
        return f"{communication_type} · Processo {process_number} · {tribunal}"
    return f"{communication_type} · Processo {process_number}"


def extract_djen_certified_pdf_url(item: dict[str, Any]) -> str:
    communication_hash = str(item.get("hash") or "").strip()
    if not communication_hash:
        raise RuntimeError("A publicação não informou o hash da certidão")
    return f"https://comunicaapi.pje.jus.br/api/v1/comunicacao/{communication_hash}/certidao"


def download_djen_certified_pdf(http: requests.Session, certified_url: str) -> bytes:
    response = http.get(certified_url, timeout=PUBLICATIONS_HTTP_TIMEOUT_SECONDS)
    response.raise_for_status()
    content = response.content
    if not content.startswith(b"%PDF-"):
        raise RuntimeError("A certidão do DJEN retornou um arquivo inválido")
    return content


def match_publication_target(
    item: dict[str, Any],
    *,
    case_lookup: dict[str, tuple[Case, Client]],
    client_name_lookup: dict[str, Client],
) -> dict[str, Any] | None:
    process_digits = normalize_case_number_digits(
        str(item.get("numeroprocessocommascara") or "").strip() or str(item.get("numero_processo") or "").strip()
    )
    if process_digits:
        matched_case = case_lookup.get(process_digits)
        if matched_case is not None:
            case, client = matched_case
            return {
                "client": client,
                "case": case,
                "matched_via": "case_number",
                "matched_query": case.number,
            }

    for recipient in item.get("destinatarios") or []:
        if not isinstance(recipient, dict):
            continue
        recipient_name = normalize_publication_match_text(str(recipient.get("nome") or ""))
        if not recipient_name:
            continue
        client = client_name_lookup.get(recipient_name)
        if client is None:
            continue
        return {
            "client": client,
            "case": None,
            "matched_via": "client_name",
            "matched_query": client.name,
        }

    return None


def get_publication_match_priority(match: dict[str, Any] | None) -> int:
    if not match:
        return 0
    if match.get("case") is not None:
        return 2
    if match.get("client") is not None:
        return 1
    return 0


def serialize_today_publication_item(item: dict[str, Any]) -> dict[str, Any]:
    process_number = (
        str(item.get("numeroprocessocommascara") or "").strip()
        or format_case_number_from_digits(str(item.get("numero_processo") or "").strip())
    )
    detail_url = str(item.get("link") or "").strip() or "https://comunica.pje.jus.br/"
    summary = strip_html_text(str(item.get("texto") or "").strip()) or None
    publication_date = str(item.get("data_disponibilizacao") or "").strip()
    return TodayPublicationItemResponse(
        id=int(item.get("id") or 0),
        hash=str(item.get("hash") or "").strip(),
        title=build_djen_publication_title(item),
        publication_date=publication_date,
        tribunal=str(item.get("siglaTribunal") or "").strip() or None,
        court_name=str(item.get("nomeOrgao") or "").strip() or None,
        process_number=process_number or None,
        communication_type=str(item.get("tipoComunicacao") or item.get("tipoDocumento") or "").strip() or None,
        detail_url=detail_url,
        summary=summary,
    ).model_dump()


def fetch_djen_publications_for_member_oab(
    *,
    member_name: str,
    member_email: str,
    oab_number: str,
    oab_uf: str,
    publication_date: date,
) -> dict[str, Any]:
    target_datetime = datetime.combine(publication_date, datetime.min.time())
    try:
        with requests.Session() as http:
            http.headers.update(PUBLICATIONS_HTTP_HEADERS)
            raw_items = search_djen_publications(
                http,
                oab_number=oab_number,
                oab_uf=oab_uf,
                publish_from=target_datetime,
                publish_to=target_datetime,
            )
    except (requests.RequestException, RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Não foi possível consultar o DJEN no momento. {exc}",
        ) from exc

    unique_items: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    for item in raw_items:
        item_hash = str(item.get("hash") or "").strip()
        if item_hash and item_hash in seen_hashes:
            continue
        if item_hash:
            seen_hashes.add(item_hash)
        unique_items.append(item)

    unique_items.sort(
        key=lambda item: (
            str(item.get("siglaTribunal") or "").strip(),
            str(item.get("numeroprocessocommascara") or item.get("numero_processo") or "").strip(),
            str(item.get("hash") or "").strip(),
        )
    )

    return TodayPublicationsResponse(
        member_name=member_name,
        member_email=member_email,
        oab=f"{oab_number}/{oab_uf}",
        publication_date=publication_date.isoformat(),
        count=len(unique_items),
        items=[serialize_today_publication_item(item) for item in unique_items],
    ).model_dump()


def sync_publications_for_organization(
    session: Session,
    organization: Organization,
) -> dict[str, Any]:
    organization_id = get_organization_pk(organization)
    config = get_or_create_publication_config(session, organization_id)
    targets, skipped_members = build_publication_search_targets(session, organization_id)
    started_at = get_local_now()

    if not targets:
        config.last_run_at = started_at
        config.last_status = "warning"
        config.last_message = (
            "Nenhuma OAB ativa com UF foi encontrada na equipe para consulta automática."
            if skipped_members
            else "Nenhuma OAB ativa foi encontrada na equipe para consulta automática."
        )
        config.last_new_records = 0
        config.last_existing_records = 0
        config.last_failed_records = 0
        config.updated_at = datetime.utcnow()
        session.add(config)
        session.commit()
        session.refresh(config)
        return {
            "started_at": started_at,
            "finished_at": get_local_now(),
            "new_records": 0,
            "existing_records": 0,
            "failed_records": 0,
            "message": config.last_message,
            "config": build_publication_config_response(session, config),
        }

    publish_to = started_at
    publish_from = started_at - timedelta(days=max(PUBLICATIONS_LOOKBACK_DAYS - 1, 0))
    case_lookup = build_publication_case_lookup(session, organization_id)
    client_name_lookup = build_publication_client_name_lookup(session, organization_id)
    candidate_hits: dict[str, dict[str, Any]] = {}
    query_errors: list[str] = []

    with requests.Session() as http:
        http.headers.update(PUBLICATIONS_HTTP_HEADERS)
        for target in targets:
            try:
                results = search_djen_publications(
                    http,
                    oab_number=target["number"],
                    oab_uf=target["uf"],
                    publish_from=publish_from,
                    publish_to=publish_to,
                )
            except (requests.RequestException, RuntimeError, ValueError) as exc:
                query_errors.append(f'{target["oab"]}: {exc}')
                continue

            for item in results:
                source_identifier = str(item.get("hash") or item.get("id") or item.get("numeroComunicacao") or "").strip()
                if not source_identifier:
                    continue
                source_key = f"{PUBLICATIONS_SOURCE_DJEN}:{source_identifier}"
                match = match_publication_target(item, case_lookup=case_lookup, client_name_lookup=client_name_lookup)
                existing = candidate_hits.get(source_key)
                if existing is None or get_publication_match_priority(match) > get_publication_match_priority(existing.get("match")):
                    candidate_hits[source_key] = {
                        "item": item,
                        "match": match,
                        "oab": target["oab"],
                    }

        new_records = 0
        existing_records = 0
        failed_records = 0
        unmatched_records = 0
        errors: list[str] = []

        for source_key, candidate in candidate_hits.items():
            item = candidate["item"]
            existing_record = session.exec(
                select(PublicationRecord).where(
                    PublicationRecord.organization_id == organization_id,
                    PublicationRecord.source_key == source_key,
                )
            ).first()
            if existing_record and publication_record_has_local_document(session, existing_record):
                existing_records += 1
                continue

            match = candidate.get("match")
            if not match:
                unmatched_records += 1
                continue

            client: Client = match["client"]
            case: Case | None = match["case"]
            if client.id is None:
                unmatched_records += 1
                continue

            detail_url = str(item.get("link") or "").strip() or "https://comunica.pje.jus.br/"
            title = build_djen_publication_title(item)
            summary = strip_html_text(str(item.get("texto") or "").strip()) or None
            publication_date_raw = str(item.get("data_disponibilizacao") or "").strip()
            try:
                publication_date = datetime.strptime(publication_date_raw, "%Y-%m-%d")
            except ValueError:
                publication_date = started_at

            document: ClientDocument | None = None
            try:
                certified_url = extract_djen_certified_pdf_url(item)
                pdf_content = download_djen_certified_pdf(http, certified_url)
                document = store_internal_client_document_pdf(
                    session,
                    client=client,
                    case=case,
                    folder_label=PUBLICATIONS_FOLDER_LABEL,
                    original_name=make_publication_file_name(title, publication_date),
                    content=pdf_content,
                )
                if existing_record:
                    old_document = session.get(ClientDocument, existing_record.document_id) if existing_record.document_id else None
                    if old_document:
                        remove_document_file(old_document.storage_path)
                        session.delete(old_document)
                    existing_record.client_id = client.id
                    existing_record.case_id = case.id if case and case.id is not None else None
                    existing_record.document_id = document.id
                    existing_record.document_storage_path = document.storage_path
                    existing_record.client_name_snapshot = client.name
                    existing_record.case_number_snapshot = case.number if case else format_case_number_from_digits(str(item.get("numero_processo") or "").strip())
                    existing_record.source = PUBLICATIONS_SOURCE_DJEN
                    existing_record.matched_via = match["matched_via"]
                    existing_record.matched_query = match["matched_query"]
                    existing_record.title = title
                    existing_record.summary = summary
                    existing_record.detail_url = detail_url
                    existing_record.certified_url = certified_url
                    existing_record.publication_date = publication_date
                    existing_record.edition_number = str(item.get("numeroComunicacao") or "").strip() or None
                    existing_record.section_name = str(item.get("nomeOrgao") or item.get("siglaTribunal") or "").strip() or None
                    existing_record.page_number = None
                    existing_record.updated_at = datetime.utcnow()
                    session.add(existing_record)
                else:
                    session.add(
                        PublicationRecord(
                            organization_id=organization_id,
                            client_id=client.id,
                            case_id=case.id if case and case.id is not None else None,
                            document_id=document.id,
                            client_name_snapshot=client.name,
                            case_number_snapshot=case.number if case else format_case_number_from_digits(str(item.get("numero_processo") or "").strip()),
                            source=PUBLICATIONS_SOURCE_DJEN,
                            source_key=source_key,
                            matched_via=match["matched_via"],
                            matched_query=match["matched_query"],
                            title=title,
                            summary=summary,
                            detail_url=detail_url,
                            certified_url=certified_url,
                            publication_date=publication_date,
                            edition_number=str(item.get("numeroComunicacao") or "").strip() or None,
                            section_name=str(item.get("nomeOrgao") or item.get("siglaTribunal") or "").strip() or None,
                            page_number=None,
                            document_storage_path=document.storage_path,
                        )
                    )
                session.commit()
                new_records += 1
            except Exception as exc:
                session.rollback()
                if document and document.storage_path:
                    try:
                        remove_document_file(document.storage_path)
                    except HTTPException:
                        pass
                failed_records += 1
                errors.append(f"{title}: {exc}")

    config = get_or_create_publication_config(session, organization_id)
    finished_at = get_local_now()
    message_parts = [f"{new_records} nova(s) publicação(ões) baixada(s).", f"{existing_records} já existiam."]
    if unmatched_records:
        message_parts.append(f"{unmatched_records} não puderam ser vinculadas a cliente/processo.")
    if skipped_members:
        message_parts.append(f"{len(skipped_members)} colaborador(es) sem OAB completa foram ignorados.")
    if failed_records:
        message_parts.append(f"{failed_records} falharam.")
    if not candidate_hits and not query_errors:
        message_parts = ["Nenhuma publicação nova foi localizada nas OABs da equipe no período consultado."]
        if skipped_members:
            message_parts.append(f"{len(skipped_members)} colaborador(es) sem OAB completa foram ignorados.")
    if query_errors and not candidate_hits:
        message_parts = ["A consulta ao DJEN falhou para as OABs configuradas."]

    if failed_records or query_errors:
        last_status = "error" if new_records == 0 and existing_records == 0 else "warning"
    elif unmatched_records or skipped_members:
        last_status = "warning"
    else:
        last_status = "success"

    config.last_run_at = finished_at
    config.last_status = last_status
    config.last_message = " ".join(message_parts)
    if errors:
        config.last_message = f'{config.last_message} Último erro: {errors[0]}'
    elif query_errors:
        config.last_message = f'{config.last_message} Último erro: {query_errors[0]}'
    config.last_new_records = new_records
    config.last_existing_records = existing_records
    config.last_failed_records = failed_records
    config.updated_at = datetime.utcnow()
    session.add(config)
    session.commit()
    session.refresh(config)

    return {
        "started_at": started_at,
        "finished_at": finished_at,
        "new_records": new_records,
        "existing_records": existing_records,
        "failed_records": failed_records,
        "message": config.last_message,
        "config": build_publication_config_response(session, config),
    }


def run_publication_sync_for_organization(
    session: Session,
    organization: Organization,
) -> dict[str, Any]:
    organization_id = get_organization_pk(organization)
    lock = get_publication_sync_lock(organization_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A rotina de publicações já está em execução.")
    try:
        return sync_publications_for_organization(session, organization)
    finally:
        lock.release()


def normalize_cpf_digits(value: str | None) -> str:
    return "".join(char for char in (value or "") if char.isdigit())


def is_valid_cpf_digits(value: str | None) -> bool:
    cpf = normalize_cpf_digits(value)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False

    def calculate_check_digit(digits: str, factor: int) -> int:
        total = sum(int(digit) * (factor - index) for index, digit in enumerate(digits))
        remainder = total % 11
        return 0 if remainder < 2 else 11 - remainder

    first_digit = calculate_check_digit(cpf[:9], 10)
    second_digit = calculate_check_digit(cpf[:10], 11)
    return cpf == f"{cpf[:9]}{first_digit}{second_digit}"


def normalize_cnpj_digits(value: str | None) -> str:
    return "".join(char for char in (value or "") if char.isdigit())


def is_valid_cnpj_digits(value: str | None) -> bool:
    cnpj = normalize_cnpj_digits(value)
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False

    def calculate_check_digit(digits: str) -> int:
        weights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] if len(digits) == 12 else [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        total = sum(int(digit) * weights[index] for index, digit in enumerate(digits))
        remainder = total % 11
        return 0 if remainder < 2 else 11 - remainder

    first_digit = calculate_check_digit(cnpj[:12])
    second_digit = calculate_check_digit(f"{cnpj[:12]}{first_digit}")
    return cnpj == f"{cnpj[:12]}{first_digit}{second_digit}"


def extract_client_kind(notes: str | None) -> str | None:
    if not notes:
        return None
    try:
        parsed = json.loads(notes)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, dict):
        return None
    kind = parsed.get("kind")
    return kind if kind in {"PF", "PJ"} else None


def sanitize_client_payload(payload: CreateClientRequest | UpdateClientRequest) -> dict[str, Any]:
    name = (payload.name or "").strip()
    document = (payload.document or "").strip() or None
    email = (payload.email or "").strip().lower() or None
    phone = (payload.phone or "").strip() or None
    notes = (payload.notes or "").strip() or None

    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome é obrigatório")

    client_kind = extract_client_kind(notes)
    if client_kind == "PF":
        if not document:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CPF é obrigatório")
        if not is_valid_cpf_digits(document):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe um CPF válido")
    elif client_kind == "PJ":
        if not document:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CNPJ é obrigatório")
        if not is_valid_cnpj_digits(document):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe um CNPJ válido")
    elif document:
        document_digits = "".join(char for char in document if char.isdigit())
        if len(document_digits) == 11 and not is_valid_cpf_digits(document_digits):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe um CPF válido")
        if len(document_digits) == 14 and not is_valid_cnpj_digits(document_digits):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe um CNPJ válido")

    return {
        "name": name,
        "document": document,
        "email": email,
        "phone": phone,
        "notes": notes,
    }


def sanitize_team_member_payload(payload: CreateTeamMemberRequest | UpdateTeamMemberRequest) -> dict:
    full_name = payload.full_name.strip()
    email = payload.email.strip().lower()
    cpf = normalize_cpf_digits(payload.cpf)
    oab = payload.oab.strip().upper()
    parsed_oab = parse_team_member_oab(oab)
    if parsed_oab:
        oab = parsed_oab["normalized"]
    role_title = payload.role_title.strip()
    team_name = payload.team_name.strip()
    phone = (payload.phone or "").strip() or None
    notes = (payload.notes or "").strip() or None
    is_admin = bool(payload.is_admin)
    allowed_nav_keys = normalize_nav_keys(payload.allowed_nav_keys, is_admin=is_admin)

    if not full_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome é obrigatório")
    if not email or "@" not in email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email é obrigatório")
    if not cpf:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CPF é obrigatório")
    if not is_valid_cpf_digits(cpf):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe um CPF válido")
    if not parsed_oab or len(parsed_oab["number"]) != 6 or not parsed_oab["uf"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe a OAB com 6 números e UF")
    if not role_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cargo é obrigatório")
    if not team_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipe é obrigatória")

    return {
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "cpf": cpf,
        "oab": oab,
        "role_title": role_title,
        "team_name": team_name,
        "notes": notes,
        "is_admin": is_admin,
        "allowed_nav_keys": allowed_nav_keys,
        "is_active": payload.is_active,
    }


def ensure_unique_team_member_cpf(
    session: Session,
    cpf: str,
    organization_id: int | None,
    ignore_id: int | None = None,
) -> None:
    query = select(TeamMember).where(TeamMember.cpf == cpf)
    if organization_id is None:
        query = query.where(TeamMember.organization_id == None)  # noqa: E711
    else:
        query = query.where(TeamMember.organization_id == organization_id)
    existing = session.exec(query).first()
    if existing and existing.id != ignore_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CPF já cadastrado na equipe")


def ensure_unique_team_member_email(
    session: Session,
    email: str,
    organization_id: int | None,
    ignore_id: int | None = None,
) -> None:
    query = select(TeamMember).where(TeamMember.email == email)
    if organization_id is None:
        query = query.where(TeamMember.organization_id == None)  # noqa: E711
    else:
        query = query.where(TeamMember.organization_id == organization_id)
    existing = session.exec(query).first()
    if existing and existing.id != ignore_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email já cadastrado na equipe")


def get_user_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == normalize_email(email))).first()


def serialize_team_member(member: TeamMember, *, invite_email_sent: bool = False, invite_token: str | None = None) -> dict:
    payload = member.model_dump()
    payload.pop("is_team_admin", None)
    payload["is_admin"] = bool(member.is_team_admin)
    payload["allowed_nav_keys"] = normalize_nav_keys(parse_nav_keys(member.allowed_nav_keys), is_admin=bool(member.is_team_admin))
    payload["invite_email_sent"] = invite_email_sent
    if invite_token and DEV_RETURN_INVITE_TOKEN:
        payload["invite_token"] = invite_token
    return payload


def serialize_master_account_as_team_member(user: User) -> dict:
    return {
        "id": -((user.id or 0) + 1_000_000),
        "organization_id": user.organization_id,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "cpf": "",
        "oab": "",
        "role_title": "Responsável master",
        "team_name": "Conta master",
        "notes": "Conta principal do escritório",
        "is_admin": True,
        "allowed_nav_keys": get_effective_user_nav_keys(user),
        "is_active": bool(user.is_active),
        "invite_email_sent": False,
        "is_read_only": True,
        "is_master_account": True,
        "account_role": user.role,
    }


def sync_user_from_team_member(
    session: Session,
    organization: Organization,
    *,
    old_member_email: str | None,
    full_name: str,
    email: str,
    phone: str | None,
    is_admin: bool,
    allowed_nav_keys: list[str],
    is_active: bool,
    force_invite: bool = False,
) -> tuple[User, str | None]:
    """Create or update member login account linked to TeamMember."""
    organization_id = get_organization_pk(organization)
    normalized_email = normalize_email(email)
    normalized_old_email = normalize_email(old_member_email) if old_member_email else None
    existing_new = get_user_by_email(session, normalized_email)
    existing_old = get_user_by_email(session, normalized_old_email) if normalized_old_email and normalized_old_email != normalized_email else None

    if existing_new and existing_old and existing_new.id != existing_old.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email já está em uso por outro usuário")

    user = existing_old or existing_new
    if user and user.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email já está vinculado a outra organização")
    if user and user.role in {"superadmin", "owner", "admin"} and user.email != normalized_old_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email pertence a uma conta administrativa")

    previous_active = bool(user.is_active) if user else False
    should_consume_slot = is_active and (not user or not previous_active)
    if should_consume_slot:
        ensure_organization_user_capacity(session, organization, additional_slots=1, ignore_user_id=user.id if user else None)

    if not user:
        temp_password = f"Tmp{secrets.token_urlsafe(24)}1"
        user = User(
            organization_id=organization_id,
            email=normalized_email,
            hashed_password=hash_password(temp_password),
            full_name=full_name,
            phone=phone,
            role="member",
            is_team_admin=is_admin,
            allowed_nav_keys=serialize_nav_keys(allowed_nav_keys),
            is_active=is_active,
            email_verified=False,
        )
        session.add(user)
    else:
        if user.role != "member":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Somente contas do tipo membro podem ser vinculadas à equipe")
        user.email = normalized_email
        user.full_name = full_name
        user.phone = phone
        user.is_team_admin = is_admin
        user.allowed_nav_keys = serialize_nav_keys(allowed_nav_keys)
        user.is_active = is_active
        user.updated_at = datetime.utcnow()
        session.add(user)

    invite_token: str | None = None
    should_issue_invite = is_active and (force_invite or not previous_active or not user.email_verified or normalized_old_email != normalized_email)
    if should_issue_invite:
        invite_token = issue_invite_token(user)
        session.add(user)

    return user, invite_token


def publication_scheduler_loop() -> None:
    while True:
        try:
            now_local = get_local_now()
            with Session(engine) as session:
                configs = session.exec(
                    select(PublicationAutomationConfig).where(PublicationAutomationConfig.is_enabled == True)  # noqa: E712
                ).all()
                due_organization_ids = [
                    config.organization_id
                    for config in configs
                    if should_run_publication_sync(config, now_local)
                ]

            for organization_id in due_organization_ids:
                with Session(engine) as session:
                    organization = session.get(Organization, organization_id)
                    if not organization or not organization.is_active:
                        continue
                    lock = get_publication_sync_lock(organization_id)
                    if not lock.acquire(blocking=False):
                        continue
                    try:
                        sync_publications_for_organization(session, organization)
                    finally:
                        lock.release()
        except Exception:
            # O scheduler deve continuar tentando mesmo que uma execução falhe.
            pass
        time.sleep(PUBLICATIONS_SCHEDULER_INTERVAL_SECONDS)


def start_publication_scheduler() -> None:
    global PUBLICATION_SCHEDULER_THREAD
    if PUBLICATION_SCHEDULER_THREAD and PUBLICATION_SCHEDULER_THREAD.is_alive():
        return
    PUBLICATION_SCHEDULER_THREAD = threading.Thread(
        target=publication_scheduler_loop,
        name="newlaw-publication-scheduler",
        daemon=True,
    )
    PUBLICATION_SCHEDULER_THREAD.start()


@app.on_event("startup")
def on_startup() -> None:
    validate_security_config()
    init_db()
    start_publication_scheduler()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/login", response_model=TokenPairResponse)
def login(
    payload: LoginRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    user_agent: Annotated[str | None, Header()] = None,
) -> TokenPairResponse:
    user = session.exec(select(User).where(User.email == normalize_email(payload.username))).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")
    ensure_user_not_locked(user)
    if not verify_password(payload.password, user.hashed_password):
        mark_failed_login(user, session)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo")
    return issue_auth_tokens(session, user, request, user_agent)


@app.post("/auth/register-office", response_model=TokenPairResponse)
def register_office(
    payload: PublicOfficeSignupRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    user_agent: Annotated[str | None, Header()] = None,
) -> TokenPairResponse:
    if not PUBLIC_SIGNUP_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cadastro público indisponível no momento")

    office_name = normalize_organization_name(payload.office_name)
    owner_name = normalize_organization_name(payload.owner_full_name)
    owner_email = normalize_email(payload.owner_email)
    owner_phone = payload.owner_phone.strip() if payload.owner_phone else None

    if len(office_name) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o nome do escritório")
    if len(owner_name) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o nome do responsável")
    if not owner_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o e-mail do responsável")
    if session.exec(select(User).where(User.email == owner_email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email já cadastrado")
    existing_organization = session.exec(select(Organization).where(func.lower(Organization.name) == office_name.lower())).first()
    if existing_organization:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Já existe um escritório com esse nome")

    validate_password_strength(payload.owner_password)

    plan = session.exec(select(Plan).where(Plan.slug == PUBLIC_SIGNUP_PLAN_SLUG, Plan.is_active == True)).first()  # noqa: E712
    if not plan:
        plan = session.exec(select(Plan).where(Plan.is_active == True)).first()  # noqa: E712
    if not plan:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Nenhum plano disponível para cadastro")

    organization = Organization(
        name=office_name,
        plan_id=plan.id,
        is_active=True,
    )
    session.add(organization)
    session.commit()
    session.refresh(organization)

    owner = User(
        organization_id=organization.id,
        email=owner_email,
        hashed_password=hash_password(payload.owner_password),
        full_name=owner_name,
        phone=owner_phone,
        role="owner",
        is_active=True,
        email_verified=False,
    )
    session.add(owner)
    session.commit()
    session.refresh(owner)

    return issue_auth_tokens(session, owner, request, user_agent)


@app.get("/auth/me")
def auth_me(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    return serialize_auth_user(session, user)


@app.post("/auth/refresh", response_model=TokenPairResponse)
def refresh_token(
    payload: RefreshRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    user_agent: Annotated[str | None, Header()] = None,
) -> TokenPairResponse:
    payload_data = decode_token(payload.refresh_token)
    if payload_data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user_id = payload_data.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    token_hash = hash_token(payload.refresh_token)
    stored = session.exec(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at == None)  # noqa: E712
    ).first()
    if not stored or stored.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")
    if stored.user_id != int(user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = session.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo")

    stored.revoked_at = datetime.utcnow()
    stored.last_used_at = datetime.utcnow()
    session.add(stored)
    session.commit()

    access_token = create_access_token(user)
    new_refresh_token = create_refresh_token(user, session, user_agent, get_client_ip(request))
    return TokenPairResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=serialize_auth_user(session, user),
    )


@app.post("/auth/logout")
def logout(payload: RefreshRequest, session: Annotated[Session, Depends(get_session)]) -> dict:
    token_hash = hash_token(payload.refresh_token)
    stored = session.exec(select(RefreshToken).where(RefreshToken.token_hash == token_hash)).first()
    if stored and not stored.revoked_at:
        stored.revoked_at = datetime.utcnow()
        session.add(stored)
        session.commit()
    return {"status": "ok"}


@app.post("/auth/password/request-reset")
def request_password_reset(payload: PasswordResetRequest, session: Annotated[Session, Depends(get_session)]) -> dict:
    user = session.exec(select(User).where(User.email == normalize_email(payload.email))).first()
    if not user:
        return {"status": "ok"}
    reset_token = secrets.token_urlsafe(32)
    user.reset_token_hash = hash_token(reset_token)
    user.reset_token_expires_at = datetime.utcnow() + timedelta(hours=1)
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    if DEV_RETURN_RESET_TOKEN:
        return {"status": "ok", "reset_token": reset_token}
    return {"status": "ok"}


@app.post("/auth/password/confirm-reset")
def confirm_password_reset(payload: PasswordResetConfirm, session: Annotated[Session, Depends(get_session)]) -> dict:
    token_hash = hash_token(payload.token)
    user = session.exec(select(User).where(User.reset_token_hash == token_hash)).first()
    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token inválido ou expirado")
    validate_password_strength(payload.new_password)
    user.hashed_password = hash_password(payload.new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    user.failed_login_count = 0
    user.locked_until = None
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    revoke_refresh_tokens(session, user.id)
    return {"status": "ok"}


@app.post("/auth/invite/accept")
def accept_invite(payload: PasswordResetConfirm, session: Annotated[Session, Depends(get_session)]) -> dict:
    token_hash = hash_token(payload.token)
    user = session.exec(select(User).where(User.reset_token_hash == token_hash)).first()
    if not user or not user.reset_token_expires_at or user.reset_token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convite inválido ou expirado")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo")
    validate_password_strength(payload.new_password)
    user.hashed_password = hash_password(payload.new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    user.email_verified = True
    user.failed_login_count = 0
    user.locked_until = None
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    revoke_refresh_tokens(session, user.id)
    return {"status": "ok"}


@app.get("/invite", response_class=HTMLResponse)
def invite_password_page(token: str = "") -> HTMLResponse:
    if not token:
        return HTMLResponse(render_invite_password_page("", message="Link de convite inválido.", success=False), status_code=400)
    return HTMLResponse(render_invite_password_page(token))


@app.post("/invite", response_class=HTMLResponse)
def invite_password_submit(
    token: Annotated[str, Form()],
    password: Annotated[str, Form()],
    confirm_password: Annotated[str, Form()],
    session: Annotated[Session, Depends(get_session)],
) -> HTMLResponse:
    if password != confirm_password:
        return HTMLResponse(
            render_invite_password_page(token, message="As senhas não conferem.", success=False),
            status_code=400,
        )
    try:
        accept_invite(PasswordResetConfirm(token=token, new_password=password), session)
    except HTTPException as exc:
        return HTMLResponse(
            render_invite_password_page(token, message=str(exc.detail), success=False),
            status_code=exc.status_code,
        )
    return HTMLResponse(
        render_invite_password_page("", message="Senha definida com sucesso. Você já pode entrar no NEWLAW.", success=True),
        status_code=200,
    )


@app.post("/auth/password/change")
def change_password(
    payload: PasswordChangeRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha atual incorreta")
    validate_password_strength(payload.new_password)
    user.hashed_password = hash_password(payload.new_password)
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    revoke_refresh_tokens(session, user.id)
    return {"status": "ok"}


@app.get("/calendar/connections", response_model=list[CalendarConnectionStatusResponse])
def list_calendar_connections(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[dict[str, Any]]:
    if user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")
    records = session.exec(select(CalendarConnection).where(CalendarConnection.user_id == user.id)).all()
    by_provider = {record.provider: record for record in records}
    return [serialize_calendar_connection_status(provider, by_provider.get(provider)) for provider in CALENDAR_PROVIDERS]


@app.post("/calendar/connections/{provider}/start", response_model=CalendarConnectionStartResponse)
def start_calendar_connection(
    provider: str,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
) -> CalendarConnectionStartResponse:
    provider_name = normalize_calendar_provider(provider)
    redirect_uri = resolve_calendar_redirect_uri(request)
    state, expires_in_seconds = register_calendar_oauth_state(user, provider_name, redirect_uri)
    auth_url = build_calendar_oauth_url(provider_name, state, redirect_uri)
    return CalendarConnectionStartResponse(
        provider=provider_name,
        auth_url=auth_url,
        state=state,
        expires_in_seconds=expires_in_seconds,
    )


@app.get("/calendar/oauth/callback", response_class=HTMLResponse)
def complete_calendar_connection(
    session: Annotated[Session, Depends(get_session)],
    state: str = "",
    code: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
) -> HTMLResponse:
    cleanup_expired_oauth_states()
    if not state:
        return HTMLResponse(
            render_calendar_callback_page(False, "Estado da conexão ausente."),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    oauth_state = PENDING_OAUTH_STATES.pop(state, None)
    if not oauth_state:
        return HTMLResponse(
            render_calendar_callback_page(False, "Conexão expirada. Inicie novamente no NEWLAW."),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    expires_at = oauth_state.get("expires_at")
    if not isinstance(expires_at, datetime) or expires_at <= datetime.utcnow():
        return HTMLResponse(
            render_calendar_callback_page(False, "Conexão expirada. Inicie novamente no NEWLAW."),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    user_id = oauth_state.get("user_id")
    provider_name = normalize_calendar_provider(str(oauth_state.get("provider", "")))
    redirect_uri = str(oauth_state.get("redirect_uri") or "").strip()
    if not isinstance(user_id, int):
        return HTMLResponse(
            render_calendar_callback_page(False, "Sessão inválida para concluir a conexão."),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if not redirect_uri:
        return HTMLResponse(
            render_calendar_callback_page(False, "URL de retorno ausente para concluir a conexão."),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    user = session.get(User, user_id)
    if not user or not user.is_active:
        return HTMLResponse(
            render_calendar_callback_page(False, "Usuário inválido para concluir a conexão."),
            status_code=status.HTTP_403_FORBIDDEN,
        )
    if error:
        detail = error_description or error
        return HTMLResponse(
            render_calendar_callback_page(False, f"Conexão não autorizada: {detail}."),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if not code:
        return HTMLResponse(
            render_calendar_callback_page(False, "Código de autorização ausente."),
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    try:
        token_payload = exchange_calendar_oauth_code(provider_name, code, redirect_uri)
        access_token = token_payload.get("access_token")
        provider_email = None
        if provider_name != "google" and isinstance(access_token, str):
            provider_email = fetch_provider_profile_email(provider_name, access_token)
        if user.id is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")
        connection = get_calendar_connection(session, user.id, provider_name)
        if not connection:
            connection = CalendarConnection(
                user_id=user.id,
                organization_id=user.organization_id,
                provider=provider_name,
                access_token_encrypted="",
                is_active=True,
            )
            session.add(connection)
            session.commit()
            session.refresh(connection)
        connection.organization_id = user.organization_id
        connection = save_calendar_connection_tokens(session, connection, token_payload, provider_email)
        window_start = datetime.utcnow() - timedelta(days=CALENDAR_SYNC_LOOKBACK_DAYS)
        window_end = datetime.utcnow() + timedelta(days=CALENDAR_SYNC_LOOKAHEAD_DAYS)
        try:
            sync_calendar_connection_events(session, connection, window_start, window_end)
        except HTTPException:
            # A conexão é válida mesmo se a primeira sincronização falhar.
            pass
    except HTTPException as exc:
        return HTMLResponse(
            render_calendar_callback_page(False, str(exc.detail)),
            status_code=exc.status_code,
        )
    return HTMLResponse(render_calendar_callback_page(True, "Conta conectada com sucesso."), status_code=status.HTTP_200_OK)


@app.post("/calendar/connections/{provider}/sync", response_model=AgendaSyncResponse)
def sync_calendar_connection(
    provider: str,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> AgendaSyncResponse:
    provider_name = normalize_calendar_provider(provider)
    if user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")
    connection = get_calendar_connection(session, user.id, provider_name)
    if not connection or not connection.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta não conectada")
    window_start = datetime.utcnow() - timedelta(days=CALENDAR_SYNC_LOOKBACK_DAYS)
    window_end = datetime.utcnow() + timedelta(days=CALENDAR_SYNC_LOOKAHEAD_DAYS)
    total = sync_calendar_connection_events(session, connection, window_start, window_end)
    session.refresh(connection)
    return AgendaSyncResponse(
        provider=provider_name,
        synced_events=total,
        last_synced_at=connection.last_synced_at or datetime.utcnow(),
    )


@app.delete("/calendar/connections/{provider}")
def disconnect_calendar_connection(
    provider: str,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, str]:
    provider_name = normalize_calendar_provider(provider)
    if user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")
    connection = get_calendar_connection(session, user.id, provider_name)
    if not connection:
        return {"status": "ok", "provider": provider_name}
    if connection.id is not None:
        session.exec(delete(ExternalCalendarEvent).where(ExternalCalendarEvent.connection_id == connection.id))
    else:
        session.exec(
            delete(ExternalCalendarEvent).where(
                ExternalCalendarEvent.user_id == user.id,
                ExternalCalendarEvent.provider == provider_name,
            )
        )
    session.commit()
    session.delete(connection)
    session.commit()
    return {"status": "ok", "provider": provider_name}


@app.get("/agenda/deadlines")
def list_agenda_deadlines(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[dict[str, Any]]:
    if user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")
    query = select(AgendaDeadline)
    if user.organization_id is not None:
        query = query.where(or_(AgendaDeadline.organization_id == user.organization_id, AgendaDeadline.user_id == user.id))
    else:
        query = query.where(AgendaDeadline.user_id == user.id)
    query = query.order_by(AgendaDeadline.due_at.asc())
    deadlines = session.exec(query).all()
    return [serialize_deadline(deadline) for deadline in deadlines]


@app.post("/agenda/deadlines")
def create_agenda_deadline(
    payload: AgendaDeadlineCreateRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    if user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Título do prazo é obrigatório")
    event_type = normalize_internal_agenda_event_type(payload.event_type)
    deadline = AgendaDeadline(
        user_id=user.id,
        organization_id=user.organization_id,
        title=title,
        due_at=parse_deadline_due_date(payload.due_date),
        reference=(payload.reference or "").strip() or None,
        notes=serialize_internal_agenda_metadata(
            notes=payload.notes,
            event_type=event_type,
            meeting_url=payload.meeting_url,
            assignees=payload.assignees,
            end_time=payload.end_time,
            assignee_id=None,
            assignee_name=None,
            is_all_day=payload.is_all_day,
        ),
        is_completed=False,
    )
    session.add(deadline)
    session.commit()
    session.refresh(deadline)
    return serialize_deadline(deadline)


@app.delete("/agenda/deadlines/{deadline_id}")
def delete_agenda_deadline(
    deadline_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    deadline = session.get(AgendaDeadline, deadline_id)
    if not deadline:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prazo não encontrado")
    if user.organization_id is not None and deadline.organization_id != user.organization_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este prazo")
    if user.organization_id is None and user.id != deadline.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este prazo")
    session.delete(deadline)
    session.commit()
    return {"status": "ok", "id": deadline_id}


@app.get("/agenda/events")
def list_agenda_events(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    start: str | None = None,
    end: str | None = None,
    refresh_external: bool = False,
) -> list[dict[str, Any]]:
    if user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")
    window_start, window_end = parse_agenda_window(start, end)
    sync_start = window_start - timedelta(days=1)
    sync_end = window_end + timedelta(days=1)
    ensure_calendar_data_fresh(session, user, sync_start, sync_end, force=refresh_external)

    deadline_query = select(AgendaDeadline).where(AgendaDeadline.due_at >= window_start, AgendaDeadline.due_at <= window_end)
    if user.organization_id is not None:
        deadline_query = deadline_query.where(or_(AgendaDeadline.organization_id == user.organization_id, AgendaDeadline.user_id == user.id))
    else:
        deadline_query = deadline_query.where(AgendaDeadline.user_id == user.id)
    deadlines = session.exec(deadline_query).all()

    external_query = select(ExternalCalendarEvent).where(
        ExternalCalendarEvent.user_id == user.id,
        ExternalCalendarEvent.starts_at <= window_end,
        ExternalCalendarEvent.ends_at >= window_start,
        ExternalCalendarEvent.is_cancelled == False,  # noqa: E712
    )
    external_events = session.exec(external_query).all()

    unified = [serialize_deadline(deadline) for deadline in deadlines]
    unified.extend(serialize_external_event(event) for event in external_events)
    unified.sort(key=agenda_item_sort_key)
    return unified


@app.post("/admin/organizations")
def create_organization(
    payload: CreateOrganizationRequest,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[None, Depends(require_admin_secret)],
) -> dict:
    owner_email = normalize_email(payload.owner_email)
    if session.exec(select(User).where(User.email == owner_email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email já cadastrado")
    validate_password_strength(payload.owner_password)
    plan = session.exec(select(Plan).where(Plan.slug == payload.plan_slug)).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plano inválido")
    organization = Organization(
        name=payload.organization_name,
        plan_id=plan.id,
        user_limit_override=payload.user_limit_override,
        is_active=True,
    )
    session.add(organization)
    session.commit()
    session.refresh(organization)
    owner = User(
        organization_id=organization.id,
        email=owner_email,
        hashed_password=hash_password(payload.owner_password),
        full_name=payload.owner_full_name,
        phone=payload.owner_phone,
        role="owner",
        is_active=True,
    )
    session.add(owner)
    session.commit()
    session.refresh(owner)
    return {
        "organization": {
            "id": organization.id,
            "name": organization.name,
            "plan_id": organization.plan_id,
            "user_limit_override": organization.user_limit_override,
        },
        "owner": {
            "id": owner.id,
            "email": owner.email,
            "name": owner.full_name,
            "role": owner.role,
        },
    }


@app.post("/admin/users")
def create_user(
    payload: CreateUserRequest,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[None, Depends(require_admin_secret)],
) -> dict:
    normalized_email = normalize_email(payload.email)
    if session.exec(select(User).where(User.email == normalized_email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email já cadastrado")
    validate_password_strength(payload.password)
    organization = session.get(Organization, payload.organization_id)
    if not organization or not organization.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização inválida")
    ensure_organization_user_capacity(session, organization, additional_slots=1)
    user = User(
        organization_id=organization.id,
        email=normalized_email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=payload.role,
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.full_name,
        "role": user.role,
        "organization_id": user.organization_id,
    }


@app.get("/license/verify", response_model=LicenseResponse)
def license_verify() -> LicenseResponse:
    # Placeholder: em produção validar contra backend remoto/Stripe.
    return LicenseResponse(status="active", plan="pro", expires_at=None, message="Licença local de teste.")


@app.get("/wallets")
def list_wallets(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    organization_id: int | None = None,
) -> list[dict]:
    scope_organization_id = resolve_organization_scope(user, session, organization_id)
    query = select(Wallet)
    if scope_organization_id is not None:
        query = query.where(Wallet.organization_id == scope_organization_id)
    wallets = session.exec(query).all()
    accessible_wallet_ids = get_accessible_wallet_ids(session, user, scope_organization_id)
    if accessible_wallet_ids is not None:
        wallets = [wallet for wallet in wallets if wallet.id is not None and wallet.id in accessible_wallet_ids]
    counts = build_wallet_case_count_map(session, [wallet.id for wallet in wallets if wallet.id is not None])
    member_lookup = get_wallet_team_member_lookup(session, [wallet.id for wallet in wallets if wallet.id is not None])
    return [serialize_wallet(wallet, counts.get(wallet.id or 0, 0), member_lookup.get(wallet.id or 0, [])) for wallet in wallets]


@app.post("/wallets")
def create_wallet(
    payload: CreateWalletRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    ensure_can_manage_team_and_wallets(user)
    scope_organization_id = resolve_organization_scope(user, session, payload.organization_id)
    assigned_members = resolve_wallet_team_members(session, scope_organization_id, payload.team_member_ids)
    next_number = get_next_wallet_number(session, scope_organization_id)
    wallet = Wallet(
        organization_id=scope_organization_id,
        number=next_number,
        name=f"Carteira {next_number}",
        nickname=payload.nickname.strip(),
        description=(payload.description or "").strip() or None,
        is_active=payload.is_active,
    )
    session.add(wallet)
    session.commit()
    session.refresh(wallet)
    sync_wallet_team_member_access(session, wallet, [member.id for member in assigned_members if member.id is not None])
    session.commit()
    return serialize_wallet(wallet, 0, assigned_members)


@app.put("/wallets/{wallet_id}")
def update_wallet(
    wallet_id: int,
    payload: UpdateWalletRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    ensure_can_manage_team_and_wallets(user)
    wallet = session.get(Wallet, wallet_id)
    if not wallet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carteira não encontrada")
    current_scope = resolve_existing_record_scope(user, session, wallet.organization_id)
    if current_scope is not None and wallet.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para esta carteira")

    target_organization_id = wallet.organization_id
    if payload.organization_id is not None:
        target_organization_id = resolve_organization_scope(user, session, payload.organization_id)
        if target_organization_id != wallet.organization_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é permitido mover carteira entre organizações",
            )

    assigned_members = resolve_wallet_team_members(session, target_organization_id, payload.team_member_ids)
    wallet.nickname = payload.nickname.strip()
    wallet.description = (payload.description or "").strip() or None
    wallet.is_active = payload.is_active
    wallet.updated_at = datetime.utcnow()
    session.add(wallet)
    sync_wallet_team_member_access(session, wallet, [member.id for member in assigned_members if member.id is not None])
    session.commit()
    session.refresh(wallet)
    case_count = build_wallet_case_count_map(session, [wallet.id]).get(wallet.id, 0)
    return serialize_wallet(wallet, case_count, assigned_members)


@app.delete("/wallets/{wallet_id}")
def delete_wallet(
    wallet_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    ensure_can_manage_team_and_wallets(user)
    wallet = session.get(Wallet, wallet_id)
    if not wallet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carteira não encontrada")
    current_scope = resolve_existing_record_scope(user, session, wallet.organization_id)
    if current_scope is not None and wallet.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para esta carteira")
    linked = session.exec(select(CaseWallet).where(CaseWallet.wallet_id == wallet.id)).first()
    if linked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Carteira possui processos vinculados. Remova os vínculos antes de excluir.",
        )
    access_rows = session.exec(select(WalletTeamMemberAccess).where(WalletTeamMemberAccess.wallet_id == wallet.id)).all()
    for row in access_rows:
        session.delete(row)
    session.delete(wallet)
    session.commit()
    return {"status": "ok", "id": wallet_id}


@app.get("/team-members")
def list_team_members(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    organization_id: int | None = None,
    include_master_accounts: bool = False,
) -> list[dict]:
    scope_organization_id = resolve_organization_scope(user, session, organization_id)
    query = select(TeamMember)
    if scope_organization_id is None:
        query = query.where(TeamMember.organization_id == None)  # noqa: E711
    else:
        query = query.where(TeamMember.organization_id == scope_organization_id)
    members = session.exec(query).all()
    payload = [serialize_team_member(member) for member in members]
    if include_master_accounts and scope_organization_id is not None:
        known_emails = {normalize_email(member.email) for member in members}
        master_users = session.exec(
            select(User).where(
                User.organization_id == scope_organization_id,
                User.role == "owner",
            )
        ).all()
        for master_user in master_users:
            if normalize_email(master_user.email) in known_emails:
                continue
            payload.append(serialize_master_account_as_team_member(master_user))
    payload.sort(key=lambda item: ((item.get("full_name") or "").lower(), (item.get("email") or "").lower()))
    return payload


@app.get("/team-members/capacity", response_model=TeamMembersCapacityResponse)
def get_team_members_capacity(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    organization_id: int | None = None,
) -> dict:
    organization = resolve_organization_entity(user, session, organization_id)
    return serialize_team_members_capacity(session, organization)


@app.post("/team-members")
def create_team_member(
    payload: CreateTeamMemberRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    ensure_can_manage_team_and_wallets(user)
    organization = resolve_organization_entity(user, session, payload.organization_id)
    organization_id = get_organization_pk(organization)
    clean = sanitize_team_member_payload(payload)
    ensure_unique_team_member_cpf(session, clean["cpf"], organization_id)
    ensure_unique_team_member_email(session, clean["email"], organization_id)
    member = TeamMember(
        organization_id=organization_id,
        full_name=clean["full_name"],
        email=clean["email"],
        phone=clean["phone"],
        cpf=clean["cpf"],
        oab=clean["oab"],
        role_title=clean["role_title"],
        team_name=clean["team_name"],
        notes=clean["notes"],
        is_team_admin=clean["is_admin"],
        allowed_nav_keys=serialize_nav_keys(clean["allowed_nav_keys"]),
        is_active=clean["is_active"],
    )
    _, invite_token = sync_user_from_team_member(
        session,
        organization,
        old_member_email=None,
        full_name=clean["full_name"],
        email=clean["email"],
        phone=clean["phone"],
        is_admin=clean["is_admin"],
        allowed_nav_keys=clean["allowed_nav_keys"],
        is_active=clean["is_active"],
        force_invite=True,
    )
    session.add(member)
    session.commit()
    session.refresh(member)
    invite_email_sent = False
    if invite_token and clean["is_active"]:
        invite_email_sent = send_member_invite_email(clean["email"], clean["full_name"], organization.name, invite_token)
    return serialize_team_member(member, invite_email_sent=invite_email_sent, invite_token=invite_token)


@app.put("/team-members/{member_id}")
def update_team_member(
    member_id: int,
    payload: UpdateTeamMemberRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    ensure_can_manage_team_and_wallets(user)
    member = session.get(TeamMember, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro não encontrado")
    current_scope = resolve_existing_record_scope(user, session, member.organization_id)
    if current_scope is not None and member.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este membro")

    target_organization_id = member.organization_id
    organization = session.get(Organization, target_organization_id) if target_organization_id is not None else None
    if not organization or not organization.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização inválida")
    if payload.organization_id is not None:
        target_organization_id = resolve_organization_scope(user, session, payload.organization_id)
        if target_organization_id != member.organization_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é permitido mover membro entre organizações",
            )

    clean = sanitize_team_member_payload(payload)
    ensure_unique_team_member_cpf(session, clean["cpf"], target_organization_id, ignore_id=member.id)
    ensure_unique_team_member_email(session, clean["email"], target_organization_id, ignore_id=member.id)

    old_member_email = member.email
    old_member_active = member.is_active
    _, invite_token = sync_user_from_team_member(
        session,
        organization,
        old_member_email=old_member_email,
        full_name=clean["full_name"],
        email=clean["email"],
        phone=clean["phone"],
        is_admin=clean["is_admin"],
        allowed_nav_keys=clean["allowed_nav_keys"],
        is_active=clean["is_active"],
        force_invite=old_member_email != clean["email"] or (not old_member_active and clean["is_active"]),
    )

    member.organization_id = target_organization_id
    member.full_name = clean["full_name"]
    member.email = clean["email"]
    member.phone = clean["phone"]
    member.cpf = clean["cpf"]
    member.oab = clean["oab"]
    member.role_title = clean["role_title"]
    member.team_name = clean["team_name"]
    member.notes = clean["notes"]
    member.is_team_admin = clean["is_admin"]
    member.allowed_nav_keys = serialize_nav_keys(clean["allowed_nav_keys"])
    member.is_active = clean["is_active"]
    member.updated_at = datetime.utcnow()
    session.add(member)
    session.commit()
    session.refresh(member)
    if old_member_active and not clean["is_active"]:
        linked_user = get_user_by_email(session, clean["email"])
        if linked_user and linked_user.organization_id == target_organization_id and linked_user.role == "member" and linked_user.id is not None:
            revoke_refresh_tokens(session, linked_user.id)
    invite_email_sent = False
    if invite_token and clean["is_active"]:
        invite_email_sent = send_member_invite_email(clean["email"], clean["full_name"], organization.name, invite_token)
    return serialize_team_member(member, invite_email_sent=invite_email_sent, invite_token=invite_token)


@app.post("/team-members/{member_id}/password-reset")
def reset_team_member_password(
    member_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    ensure_can_manage_team_and_wallets(user)
    member = session.get(TeamMember, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro não encontrado")
    current_scope = resolve_existing_record_scope(user, session, member.organization_id)
    if current_scope is not None and member.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este membro")
    if not member.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reative o membro antes de refazer a senha")

    organization = session.get(Organization, member.organization_id) if member.organization_id is not None else None
    if not organization or not organization.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização inválida")

    linked_user, invite_token = sync_user_from_team_member(
        session,
        organization,
        old_member_email=member.email,
        full_name=member.full_name,
        email=member.email,
        phone=member.phone,
        is_admin=bool(member.is_team_admin),
        allowed_nav_keys=normalize_nav_keys(parse_nav_keys(member.allowed_nav_keys), is_admin=bool(member.is_team_admin)),
        is_active=True,
        force_invite=True,
    )
    if not invite_token:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Não foi possível gerar um novo link de senha")

    linked_user.failed_login_count = 0
    linked_user.locked_until = None
    linked_user.updated_at = datetime.utcnow()
    session.add(linked_user)
    session.commit()

    if linked_user.id is not None:
        revoke_refresh_tokens(session, linked_user.id)

    invite_email_sent = send_member_invite_email(member.email, member.full_name, organization.name, invite_token)
    response = {
        "status": "ok",
        "id": member_id,
        "email": member.email,
        "invite_email_sent": invite_email_sent,
    }
    if invite_token and DEV_RETURN_INVITE_TOKEN:
        response["invite_token"] = invite_token
    if invite_token and (DEV_RETURN_INVITE_TOKEN or not invite_email_sent):
        response["invite_link"] = build_invite_link(invite_token)
    return response


@app.delete("/team-members/{member_id}")
def delete_team_member(
    member_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    ensure_can_manage_team_and_wallets(user)
    member = session.get(TeamMember, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membro não encontrado")
    current_scope = resolve_existing_record_scope(user, session, member.organization_id)
    if current_scope is not None and member.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este membro")
    linked_user = get_user_by_email(session, member.email)
    if linked_user and linked_user.id is not None and linked_user.organization_id == member.organization_id and linked_user.role == "member":
        linked_user.is_active = False
        linked_user.updated_at = datetime.utcnow()
        session.add(linked_user)
        active_tokens = session.exec(
            select(RefreshToken).where(RefreshToken.user_id == linked_user.id, RefreshToken.revoked_at == None)  # noqa: E712
        ).all()
        if active_tokens:
            revoked_at = datetime.utcnow()
            for token in active_tokens:
                token.revoked_at = revoked_at
            session.add_all(active_tokens)
    access_rows = session.exec(select(WalletTeamMemberAccess).where(WalletTeamMemberAccess.team_member_id == member.id)).all()
    for row in access_rows:
        session.delete(row)
    session.delete(member)
    session.commit()
    return {"status": "ok", "id": member_id}


@app.get("/clients")
def list_clients(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    organization_id: int | None = None,
) -> list[Client]:
    scope_organization_id = resolve_organization_scope(user, session, organization_id)
    query = select(Client)
    if scope_organization_id is not None:
        query = query.where(Client.organization_id == scope_organization_id)
    return session.exec(query).all()


@app.post("/clients")
def create_client(
    payload: CreateClientRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> Client:
    scope_organization_id = resolve_organization_scope(user, session, payload.organization_id)
    clean = sanitize_client_payload(payload)
    client = Client(
        organization_id=scope_organization_id,
        name=clean["name"],
        document=clean["document"],
        email=clean["email"],
        phone=clean["phone"],
        notes=clean["notes"],
    )
    session.add(client)
    session.commit()
    session.refresh(client)
    return client


@app.put("/clients/{client_id}")
def update_client(
    client_id: int,
    payload: UpdateClientRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> Client:
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado")
    current_scope = resolve_existing_record_scope(user, session, client.organization_id)
    if current_scope is not None and client.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este cliente")

    target_organization_id = client.organization_id
    if payload.organization_id is not None:
        target_organization_id = resolve_organization_scope(user, session, payload.organization_id)
    clean = sanitize_client_payload(payload)

    client.organization_id = target_organization_id
    client.name = clean["name"]
    client.document = clean["document"]
    client.email = clean["email"]
    client.phone = clean["phone"]
    client.notes = clean["notes"]
    client.updated_at = datetime.utcnow()
    session.add(client)
    session.commit()
    session.refresh(client)
    return client


@app.delete("/clients/{client_id}")
def delete_client(
    client_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    client = session.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado")
    current_scope = resolve_existing_record_scope(user, session, client.organization_id)
    if current_scope is not None and client.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este cliente")

    linked_case = session.exec(select(Case).where(Case.client_id == client.id)).first()
    if linked_case:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cliente possui processos vinculados. Exclua os processos antes de remover o cliente.",
        )

    documents = session.exec(select(ClientDocument).where(ClientDocument.client_id == client.id)).all()
    purge_documents(session, documents)
    publication_records = session.exec(select(PublicationRecord).where(PublicationRecord.client_id == client.id)).all()
    for record in publication_records:
        session.delete(record)
    session.delete(client)
    session.commit()
    return {"status": "ok", "id": client_id}


@app.get("/cases")
def list_cases(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    organization_id: int | None = None,
) -> list[dict]:
    scope_organization_id = resolve_organization_scope(user, session, organization_id)
    query = select(Case)
    if scope_organization_id is not None:
        query = query.where(Case.organization_id == scope_organization_id)
    cases = session.exec(query).all()
    wallet_lookup = get_case_wallet_lookup(session, [case.id for case in cases if case.id is not None])
    accessible_wallet_ids = get_accessible_wallet_ids(session, user, scope_organization_id)
    if accessible_wallet_ids is not None:
        cases = [
            case
            for case in cases
            if case.id is not None and (
                case.id not in wallet_lookup or wallet_lookup[case.id].id in accessible_wallet_ids
            )
        ]
    return serialize_case_list(session, cases, wallet_lookup)


@app.post("/cases")
def create_case(
    payload: CreateCaseRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    scope_organization_id = resolve_organization_scope(user, session, payload.organization_id)
    validated_payload = validate_case_payload(payload)
    client_query = select(Client).where(Client.id == payload.client_id)
    if scope_organization_id is not None:
        client_query = client_query.where(Client.organization_id == scope_organization_id)
    client = session.exec(client_query).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente inválido")

    case = Case(
        organization_id=scope_organization_id,
        number=validated_payload["number"],
        title=validated_payload["title"],
        client_id=payload.client_id,
        status=validated_payload["status"],
        forum=validated_payload["forum"],
        court=validated_payload["court"],
        value=payload.value,
    )
    session.add(case)
    session.commit()
    session.refresh(case)
    wallet = resolve_wallet_for_case(session, payload.wallet_id, case.organization_id, user)
    sync_case_wallet_assignment(session, case.id, wallet.id if wallet else None)
    session.commit()
    return serialize_case(case, wallet)


@app.put("/cases/{case_id}")
def update_case(
    case_id: int,
    payload: UpdateCaseRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    validated_payload = validate_case_payload(payload)
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    current_scope = resolve_existing_record_scope(user, session, case.organization_id)
    if current_scope is not None and case.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este processo")
    current_wallet = get_case_wallet_lookup(session, [case.id]).get(case.id)
    if current_wallet is not None:
        ensure_user_can_access_wallet(session, user, current_wallet)

    target_organization_id = case.organization_id
    if payload.organization_id is not None:
        target_organization_id = resolve_organization_scope(user, session, payload.organization_id)

    client_query = select(Client).where(Client.id == payload.client_id)
    if target_organization_id is not None:
        client_query = client_query.where(Client.organization_id == target_organization_id)
    client = session.exec(client_query).first()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente inválido")

    case.organization_id = target_organization_id
    case.number = validated_payload["number"]
    case.title = validated_payload["title"]
    case.client_id = payload.client_id
    case.status = validated_payload["status"]
    case.forum = validated_payload["forum"]
    case.court = validated_payload["court"]
    case.value = payload.value
    case.updated_at = datetime.utcnow()
    session.add(case)
    session.commit()
    session.refresh(case)
    wallet = resolve_wallet_for_case(session, payload.wallet_id, case.organization_id, user)
    sync_case_wallet_assignment(session, case.id, wallet.id if wallet else None)
    session.commit()
    return serialize_case(case, wallet)


@app.delete("/cases/{case_id}")
def delete_case(
    case_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    current_scope = resolve_existing_record_scope(user, session, case.organization_id)
    if current_scope is not None and case.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este processo")
    current_wallet = get_case_wallet_lookup(session, [case.id]).get(case.id)
    if current_wallet is not None:
        ensure_user_can_access_wallet(session, user, current_wallet)

    links = session.exec(select(CaseWallet).where(CaseWallet.case_id == case.id)).all()
    for link in links:
        session.delete(link)
    documents = session.exec(select(ClientDocument).where(ClientDocument.case_id == case.id)).all()
    purge_documents(session, documents)
    publication_records = session.exec(select(PublicationRecord).where(PublicationRecord.case_id == case.id)).all()
    for record in publication_records:
        session.delete(record)
    session.flush()
    session.delete(case)
    session.commit()
    return {"status": "ok", "id": case_id}


@app.get("/finance/entries", response_model=list[FinanceEntryResponse])
def list_finance_entries(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    organization_id: int | None = None,
) -> list[dict[str, Any]]:
    ensure_finance_schema()
    ensure_nav_access(user, "finance")
    organization = resolve_organization_entity(user, session, organization_id)
    organization_pk = get_organization_pk(organization)
    entries = session.exec(
        select(FinancialEntry)
        .where(FinancialEntry.organization_id == organization_pk)
        .order_by(FinancialEntry.due_date.desc(), FinancialEntry.created_at.desc())
    ).all()
    client_ids = {entry.client_id for entry in entries if entry.client_id is not None}
    case_ids = {entry.case_id for entry in entries if entry.case_id is not None}
    client_lookup = {
        client.id: client
        for client in session.exec(select(Client).where(Client.id.in_(client_ids))).all()
        if client.id is not None
    } if client_ids else {}
    case_lookup = {
        case.id: case
        for case in session.exec(select(Case).where(Case.id.in_(case_ids))).all()
        if case.id is not None
    } if case_ids else {}
    return [
        serialize_financial_entry(
            entry,
            client_lookup.get(entry.client_id) if entry.client_id is not None else None,
            case_lookup.get(entry.case_id) if entry.case_id is not None else None,
        )
        for entry in entries
    ]


@app.post("/finance/entries", response_model=FinanceEntryResponse)
def create_finance_entry(
    payload: FinanceEntryCreateRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_finance_schema()
    ensure_nav_access(user, "finance")
    organization = resolve_organization_entity(user, session, payload.organization_id)
    organization_pk = get_organization_pk(organization)
    entry_type = payload.entry_type.strip().lower()
    if entry_type not in FINANCE_ENTRY_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de lançamento inválido")
    category = payload.category.strip()
    if not category:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Categoria é obrigatória")
    if payload.amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valor deve ser maior que zero")
    if payload.payment_method and payload.payment_method not in FINANCE_PAYMENT_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Forma de pagamento inválida")
    if payload.recurring and payload.recurring not in FINANCE_RECURRING_OPTIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Recorrência inválida")
    if payload.installments is not None and payload.installments < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parcelamento inválido")
    if payload.paid_amount is not None and payload.paid_amount < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valor pago inválido")

    due_date = parse_finance_date(payload.due_date, "Data de vencimento", required=True)
    payment_date = parse_finance_date(payload.payment_date, "Data do pagamento")
    client = resolve_finance_client(session, organization_pk, payload.client_id)
    case = resolve_finance_case(session, organization_pk, payload.case_id)
    if case and client is None and case.client_id is not None:
        client = resolve_finance_client(session, organization_pk, case.client_id)
    if case and client and case.client_id and case.client_id != client.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Processo não pertence à pessoa selecionada")

    client_name = (payload.client_name or "").strip() or (client.name if client else None)
    case_number = (payload.case_number or "").strip() or (case.number if case else None)
    expense_type = (payload.expense_type or "").strip() or None
    recurring = (payload.recurring or "").strip() or None
    attachment_name = (payload.attachment_name or "").strip() or None

    entry = FinancialEntry(
        organization_id=organization_pk,
        created_by_user_id=user.id,
        entry_type=entry_type,
        category=category,
        client_id=client.id if client and client.id is not None else None,
        case_id=case.id if case and case.id is not None else None,
        client_name_snapshot=client_name,
        case_number_snapshot=case_number,
        amount=payload.amount,
        due_date=due_date,
        payment_date=payment_date,
        payment_method=payload.payment_method or None,
        expense_type=expense_type,
        recurring=recurring,
        paid_amount=payload.paid_amount,
        installments=payload.installments,
        attachment_name=attachment_name,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return serialize_financial_entry(entry, client, case)


@app.patch("/finance/entries/{entry_id}", response_model=FinanceEntryResponse)
def update_finance_entry(
    entry_id: int,
    payload: FinanceEntryUpdateRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_finance_schema()
    ensure_nav_access(user, "finance")

    entry = session.get(FinancialEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento financeiro não encontrado")

    record_organization_id = resolve_existing_record_scope(user, session, entry.organization_id)
    if payload.organization_id is not None and record_organization_id != payload.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento inválido para esta organização")

    if payload.payment_method and payload.payment_method not in FINANCE_PAYMENT_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Forma de pagamento inválida")
    if payload.paid_amount is not None and payload.paid_amount < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valor pago inválido")
    if payload.payment_date is None and payload.payment_method is None and payload.paid_amount is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe ao menos um campo para atualizar")

    if payload.payment_date is not None:
        entry.payment_date = parse_finance_date(payload.payment_date, "Data do pagamento", required=True)
    if payload.payment_method is not None:
        entry.payment_method = payload.payment_method.strip() or None
    if payload.paid_amount is not None:
        entry.paid_amount = payload.paid_amount

    entry.updated_at = datetime.utcnow()
    session.add(entry)
    session.commit()
    session.refresh(entry)

    client = session.get(Client, entry.client_id) if entry.client_id is not None else None
    case = session.get(Case, entry.case_id) if entry.case_id is not None else None
    return serialize_financial_entry(entry, client, case)


@app.delete("/finance/entries/{entry_id}")
def delete_finance_entry(
    entry_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_finance_schema()
    ensure_nav_access(user, "finance")

    entry = session.get(FinancialEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento financeiro não encontrado")

    resolve_existing_record_scope(user, session, entry.organization_id)
    session.delete(entry)
    session.commit()
    return {"status": "ok", "id": entry_id}


@app.get("/files/documents", response_model=list[ClientDocumentResponse])
def list_client_documents(
    client_id: int,
    case_id: int | None = None,
    *,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[dict[str, Any]]:
    ensure_nav_access(user, "files")
    client = resolve_client_for_documents(session, user, client_id)
    case = resolve_case_for_documents(session, user, case_id)
    if case and case.client_id != client.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Processo não pertence ao cliente selecionado")

    query = select(ClientDocument).where(ClientDocument.client_id == client.id)
    if case and case.id is not None:
        query = query.where(ClientDocument.case_id == case.id)
    documents = session.exec(query.order_by(ClientDocument.created_at.desc())).all()
    return [serialize_client_document(document) for document in documents]


@app.post("/files/documents", response_model=ClientDocumentResponse)
async def upload_client_document(
    client_id: Annotated[int, Form()],
    folder_label: Annotated[str, Form()],
    case_id: Annotated[int | None, Form()] = None,
    file: UploadFile = File(...),
    *,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_nav_access(user, "files")
    client = resolve_client_for_documents(session, user, client_id)
    case = resolve_case_for_documents(session, user, case_id)
    if case and case.client_id != client.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Processo não pertence ao cliente selecionado")

    original_name = os.path.basename((file.filename or "").strip())
    if not original_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecione um arquivo PDF ou Word")
    extension = get_allowed_document_extension(original_name)
    if not extension:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Somente arquivos PDF ou Word são aceitos")
    allowed_content_types = tuple(str(value).lower() for value in FILES_ALLOWED_UPLOADS[extension]["content_types"])
    if file.content_type and file.content_type.lower() not in allowed_content_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de arquivo inválido. Envie um PDF ou Word")

    label = normalize_document_folder_label(folder_label)
    content = await file.read(FILES_MAX_UPLOAD_BYTES + 1)
    await file.close()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio")
    if len(content) > FILES_MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Arquivo excede o limite de {FILES_MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
        )
    validate_uploaded_document_content(extension, content)

    stored_name, storage_relative_path = build_document_storage_relative_path(client, case, label, extension)
    absolute_path = get_document_absolute_path(storage_relative_path)
    with open(absolute_path, "wb") as buffer:
        buffer.write(content)

    document = ClientDocument(
        organization_id=client.organization_id,
        uploaded_by_user_id=user.id,
        client_id=client.id,
        case_id=case.id if case and case.id is not None else None,
        folder_label=label,
        original_name=original_name,
        stored_name=stored_name,
        storage_path=storage_relative_path,
        content_type=get_document_storage_content_type(extension),
        size_bytes=len(content),
    )
    session.add(document)
    session.commit()
    session.refresh(document)
    return serialize_client_document(document)


@app.get("/files/documents/{document_id}/download")
def download_client_document(
    document_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> FileResponse:
    ensure_nav_access(user, "files")
    document = session.get(ClientDocument, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")
    client = resolve_client_for_documents(session, user, document.client_id)
    case = resolve_case_for_documents(session, user, document.case_id)
    if case and case.client_id != client.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento vinculado a cliente inválido")

    absolute_path = get_document_absolute_path(document.storage_path)
    if not os.path.exists(absolute_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo não encontrado no armazenamento")
    return FileResponse(absolute_path, media_type=document.content_type, filename=document.original_name)


@app.delete("/files/documents/{document_id}")
def delete_client_document(
    document_id: int,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_nav_access(user, "files")
    document = session.get(ClientDocument, document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado")
    client = resolve_client_for_documents(session, user, document.client_id)
    case = resolve_case_for_documents(session, user, document.case_id)
    if case and case.client_id != client.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento vinculado a cliente inválido")

    remove_document_file(document.storage_path)
    session.delete(document)
    session.commit()
    return {"status": "ok", "id": document_id}


@app.get("/publications/automation", response_model=PublicationAutomationConfigResponse)
def get_publication_automation_settings(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_nav_access(user, "settings")
    organization = resolve_organization_entity(user, session, user.organization_id)
    config = get_or_create_publication_config(session, get_organization_pk(organization))
    return build_publication_config_response(session, config)


@app.get("/publications/today", response_model=TodayPublicationsResponse)
def get_today_publications_for_logged_member(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    publication_date: str | None = None,
) -> dict[str, Any]:
    ensure_nav_access(user, "official")
    member = get_team_member_for_user(session, user)
    if not member or not member.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum membro ativo da equipe com OAB cadastrada está vinculado ao e-mail logado.",
        )

    parsed_oab = parse_team_member_oab(member.oab)
    if not parsed_oab or len(parsed_oab["number"]) != 6 or not parsed_oab["uf"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A OAB do seu cadastro precisa ter 6 números e UF.",
        )

    target_date = get_local_now().date()
    if publication_date:
        try:
            target_date = datetime.strptime(publication_date, "%Y-%m-%d").date()
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A data da consulta deve estar no formato YYYY-MM-DD.",
            ) from exc

    return fetch_djen_publications_for_member_oab(
        member_name=member.full_name,
        member_email=member.email,
        oab_number=parsed_oab["number"],
        oab_uf=parsed_oab["uf"],
        publication_date=target_date,
    )


@app.post("/publications/search-by-oab", response_model=TodayPublicationsResponse)
def search_publications_by_oab(payload: PublicationSearchByOabRequest) -> dict[str, Any]:
    parsed_oab = parse_team_member_oab(f"{payload.oab_number}/{payload.oab_uf}")
    if not parsed_oab or len(parsed_oab["number"]) != 6 or not parsed_oab["uf"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A OAB informada precisa ter 6 números e UF.",
        )

    try:
        target_date = datetime.strptime(payload.publication_date, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A data da consulta deve estar no formato YYYY-MM-DD.",
        ) from exc

    member_name = payload.member_name.strip() or "Membro da equipe"
    member_email = payload.member_email.strip().lower()
    if not member_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O e-mail do membro é obrigatório para a consulta.",
        )

    return fetch_djen_publications_for_member_oab(
        member_name=member_name,
        member_email=member_email,
        oab_number=parsed_oab["number"],
        oab_uf=parsed_oab["uf"],
        publication_date=target_date,
    )


@app.post("/publications/context", response_model=PublicationContextResponse)
def get_publication_context(
    payload: PublicationContextRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_nav_access(user, "official")
    organization = resolve_organization_entity(user, session, user.organization_id)
    organization_id = get_organization_pk(organization)
    return PublicationContextResponse(
        items=build_publication_context_items(session, organization_id, payload.items)
    ).model_dump()


@app.post("/publications/handle", response_model=PublicationHandleResponse)
def handle_publication(
    payload: PublicationHandleRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_nav_access(user, "official")
    if user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")

    organization = resolve_organization_entity(user, session, user.organization_id)
    organization_id = get_organization_pk(organization)
    action = (payload.action or "").strip().lower()
    if action not in PUBLICATION_HANDLING_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ação da publicação inválida")

    source_key = normalize_publication_source_key(payload.source_key)
    publication_title = (payload.publication_title or "").strip()
    if not publication_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Título da publicação é obrigatório")

    publication_date = parse_publication_date_value(payload.publication_date)
    process_number = (payload.process_number or "").strip() or None
    detail_url = (payload.detail_url or "").strip() or "https://comunica.pje.jus.br/"
    summary = (payload.summary or "").strip() or None

    case_lookup = build_publication_case_lookup(session, organization_id)
    matched = case_lookup.get(normalize_case_number_digits(process_number)) if process_number else None
    matched_case = matched[0] if matched else None
    wallet = None
    if matched_case and matched_case.id is not None:
        wallet = get_case_wallet_lookup(session, [matched_case.id]).get(matched_case.id)

    handling = upsert_publication_handling_record(
        session,
        organization_id=organization_id,
        source_key=source_key,
        publication_title=publication_title,
        publication_date=publication_date,
        process_number=process_number,
        detail_url=detail_url,
        summary=summary,
        matched_case=matched_case,
        wallet=wallet,
    )

    current_status = normalize_publication_handling_status(handling.status)
    handled_at = get_local_now()

    if action == "read_no_action":
        if current_status == "task_created":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Esta publicação já possui uma providência cadastrada.",
            )
        handling.status = "read_no_action"
        handling.handled_by_user_id = user.id
        handling.handled_at = handled_at
        handling.task_title = None
        handling.task_details = None
        handling.task_due_at = None
        handling.task_assignees = None
        handling.updated_at = datetime.utcnow()
        session.add(handling)
        session.commit()
        return PublicationHandleResponse(
            source_key=source_key,
            status=handling.status,
            handled_at=handled_at,
            created_agenda_items=0,
            message="Publicação marcada como lida sem providências.",
        ).model_dump()

    if current_status == "task_created":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta publicação já possui uma providência cadastrada.",
        )

    task_title = (payload.task_title or "").strip()
    if not task_title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Título da tarefa é obrigatório")
    if not (payload.due_date or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data de entrega é obrigatória")

    assignee_users, assignee_names, assignee_emails = resolve_publication_task_assignees(
        session,
        organization_id=organization_id,
        actor_user=user,
        matched_case=matched_case,
        wallet=wallet,
        raw_emails=payload.responsible_emails,
        include_actor_responsible=payload.include_actor_responsible,
        allow_office_wide_responsibles=payload.allow_office_wide_responsibles,
    )
    due_at = parse_deadline_due_date(payload.due_date or "")
    created_agenda_items = create_publication_agenda_deadlines(
        session,
        assignee_users=assignee_users,
        assignee_names=assignee_names,
        due_at=due_at,
        task_title=task_title,
        task_details=(payload.task_details or "").strip() or None,
        source_key=source_key,
        process_number=matched_case.number if matched_case else process_number,
        detail_url=detail_url,
    )

    handling.status = "task_created"
    handling.handled_by_user_id = user.id
    handling.handled_at = handled_at
    handling.task_title = task_title
    handling.task_details = (payload.task_details or "").strip() or None
    handling.task_due_at = due_at
    handling.task_assignees = "; ".join(assignee_emails)
    handling.updated_at = datetime.utcnow()
    session.add(handling)
    session.commit()

    return PublicationHandleResponse(
        source_key=source_key,
        status=handling.status,
        handled_at=handled_at,
        created_agenda_items=created_agenda_items,
        message="Tarefa criada com sucesso a partir da publicação.",
    ).model_dump()


@app.put("/publications/automation", response_model=PublicationAutomationConfigResponse)
def update_publication_automation_settings(
    payload: PublicationAutomationUpdateRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_nav_access(user, "settings")
    organization = resolve_organization_entity(user, session, user.organization_id)
    config = get_or_create_publication_config(session, get_organization_pk(organization))
    config.is_enabled = bool(payload.is_enabled)
    config.schedule_time = validate_publication_schedule_time(payload.schedule_time)
    config.updated_at = datetime.utcnow()
    session.add(config)
    session.commit()
    session.refresh(config)
    return build_publication_config_response(session, config)


@app.post("/publications/automation/run", response_model=PublicationAutomationRunResponse)
def run_publication_automation_now(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    ensure_nav_access(user, "settings")
    organization = resolve_organization_entity(user, session, user.organization_id)
    result = run_publication_sync_for_organization(session, organization)
    return PublicationAutomationRunResponse(**result).model_dump()


@app.get("/invoices")
def list_invoices(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[Invoice]:
    return session.exec(select(Invoice)).all()


@app.get("/templates")
def list_templates(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[Template]:
    return session.exec(select(Template)).all()


@app.post("/templates")
def create_template(
    template: Template,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> Template:
    session.add(template)
    session.commit()
    session.refresh(template)
    return template
