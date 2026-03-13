"""FastAPI backend for the NEWLAW desktop app (Tauri + React + Python).

This API is started by the Tauri shell and serves the local WebView.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from html import escape
from typing import Annotated, Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from cryptography.fernet import Fernet, InvalidToken

from fastapi import Depends, FastAPI, Form, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, delete, select

from .models import (
    AgendaDeadline,
    CalendarConnection,
    Case,
    CaseWallet,
    Client,
    ExternalCalendarEvent,
    Invoice,
    Organization,
    Plan,
    RefreshToken,
    TeamMember,
    Template,
    User,
    Wallet,
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
SMTP_HOST = os.getenv("NEWLAW_SMTP_HOST", "")
SMTP_PORT = int(os.getenv("NEWLAW_SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("NEWLAW_SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("NEWLAW_SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("NEWLAW_SMTP_FROM_EMAIL", SMTP_USERNAME or "no-reply@newlaw.app.br")
SMTP_FROM_NAME = os.getenv("NEWLAW_SMTP_FROM_NAME", "NEWLAW")
SMTP_STARTTLS = os.getenv("NEWLAW_SMTP_STARTTLS", "1") == "1"
CALENDAR_REDIRECT_URI = os.getenv("NEWLAW_CALENDAR_REDIRECT_URI", "http://127.0.0.1:8000/calendar/oauth/callback")
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
    "progress",
    "files",
    "settings",
)
ADMIN_REQUIRED_NAV_KEYS = ("team", "wallets")
ADMIN_ROLES = {"superadmin", "owner", "admin"}
CALENDAR_PROVIDERS = ("google", "microsoft")

GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

MICROSOFT_OAUTH_AUTHORIZE_URL = f"https://login.microsoftonline.com/{MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/authorize"
MICROSOFT_OAUTH_TOKEN_URL = f"https://login.microsoftonline.com/{MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/token"
MICROSOFT_PROFILE_URL = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName"
MICROSOFT_EVENTS_URL = "https://graph.microsoft.com/v1.0/me/calendarView"

PENDING_OAUTH_STATES: dict[str, dict[str, Any]] = {}

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


def parse_nav_keys(value: str | None) -> list[str]:
    if not value:
        return []
    items = [part.strip() for part in value.split(",")]
    valid = {key for key in NAV_PERMISSION_KEYS}
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items:
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


def serialize_auth_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.full_name,
        "role": user.role,
        "organization_id": user.organization_id,
        "is_admin": bool(user.is_team_admin),
        "allowed_nav_keys": get_effective_user_nav_keys(user),
    }


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


def build_calendar_oauth_url(provider: str, state: str) -> str:
    client_id, _ = get_calendar_provider_credentials(provider)
    if provider == "google":
        params = {
            "client_id": client_id,
            "redirect_uri": CALENDAR_REDIRECT_URI,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email openid",
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return f"{GOOGLE_OAUTH_AUTHORIZE_URL}?{urlencode(params)}"
    params = {
        "client_id": client_id,
        "redirect_uri": CALENDAR_REDIRECT_URI,
        "response_type": "code",
        "response_mode": "query",
        "scope": "offline_access Calendars.Read User.Read",
        "prompt": "select_account",
        "state": state,
    }
    return f"{MICROSOFT_OAUTH_AUTHORIZE_URL}?{urlencode(params)}"


def register_calendar_oauth_state(user: User, provider: str) -> tuple[str, int]:
    if user.id is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Usuário sem identificador")
    cleanup_expired_oauth_states()
    state = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=OAUTH_STATE_TTL_MINUTES)
    PENDING_OAUTH_STATES[state] = {
        "user_id": user.id,
        "provider": provider,
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


def exchange_calendar_oauth_code(provider: str, code: str) -> dict[str, Any]:
    client_id, client_secret = get_calendar_provider_credentials(provider)
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": CALENDAR_REDIRECT_URI,
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
    connection.provider_email = provider_email or connection.provider_email
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
    provider_email = fetch_provider_profile_email(connection.provider, refreshed.get("access_token", "")) if refreshed.get("access_token") else None
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


def serialize_calendar_connection_status(provider: str, connection: CalendarConnection | None) -> dict[str, Any]:
    return {
        "provider": provider,
        "connected": bool(connection and connection.is_active),
        "provider_email": connection.provider_email if connection else None,
        "last_synced_at": connection.last_synced_at if connection else None,
        "sync_error": connection.sync_error if connection else None,
    }


def serialize_deadline(deadline: AgendaDeadline) -> dict[str, Any]:
    return {
        "id": f"deadline-{deadline.id}",
        "entity_id": deadline.id,
        "kind": "deadline",
        "source": "internal",
        "title": deadline.title,
        "starts_at": deadline.due_at.isoformat(timespec="seconds"),
        "ends_at": (deadline.due_at + timedelta(hours=1)).isoformat(timespec="seconds"),
        "is_all_day": True,
        "location": None,
        "meeting_url": None,
        "reference": deadline.reference,
        "description": deadline.notes,
        "status": "concluido" if deadline.is_completed else "pendente",
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


def init_db() -> None:
    os.makedirs(STORAGE_PATH, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    ensure_schema_columns()
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
    organization_id: int | None = None


class UpdateWalletRequest(BaseModel):
    nickname: str
    description: str | None = None
    is_active: bool = True
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


class AgendaSyncResponse(BaseModel):
    provider: str
    synced_events: int
    last_synced_at: datetime


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


def serialize_wallet(wallet: Wallet, case_count: int = 0) -> dict:
    return {
        "id": wallet.id,
        "organization_id": wallet.organization_id,
        "number": wallet.number,
        "name": wallet.name,
        "nickname": wallet.nickname,
        "description": wallet.description,
        "is_active": wallet.is_active,
        "case_count": case_count,
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
) -> Wallet | None:
    if wallet_id is None:
        return None
    wallet = session.get(Wallet, wallet_id)
    if not wallet or not wallet.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carteira inválida")
    if wallet.organization_id != case_organization_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Carteira inválida para esta organização")
    return wallet


def sync_case_wallet_assignment(session: Session, case_id: int, wallet_id: int | None) -> None:
    existing = session.exec(select(CaseWallet).where(CaseWallet.case_id == case_id)).first()
    if wallet_id is None:
        if existing:
            session.delete(existing)
        return
    if existing:
        existing.wallet_id = wallet_id
        existing.updated_at = datetime.utcnow()
        session.add(existing)
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


def serialize_case_list(session: Session, cases: list[Case]) -> list[dict]:
    lookup = get_case_wallet_lookup(session, [case.id for case in cases if case.id is not None])
    output: list[dict] = []
    for case in cases:
        wallet = lookup.get(case.id) if case.id is not None else None
        output.append(serialize_case(case, wallet))
    return output


def sanitize_team_member_payload(payload: CreateTeamMemberRequest | UpdateTeamMemberRequest) -> dict:
    full_name = payload.full_name.strip()
    email = payload.email.strip().lower()
    cpf = "".join(char for char in payload.cpf if char.isdigit())
    oab = payload.oab.strip().upper()
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
    if len(cpf) != 11:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CPF deve conter 11 dígitos")
    if not oab:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAB é obrigatória")
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


@app.on_event("startup")
def on_startup() -> None:
    validate_security_config()
    init_db()


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
        user=serialize_auth_user(user),
    )


@app.get("/auth/me")
def auth_me(user: Annotated[User, Depends(get_current_user)]) -> dict:
    return serialize_auth_user(user)


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
        user=serialize_auth_user(user),
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
    user: Annotated[User, Depends(get_current_user)],
) -> CalendarConnectionStartResponse:
    provider_name = normalize_calendar_provider(provider)
    state, expires_in_seconds = register_calendar_oauth_state(user, provider_name)
    auth_url = build_calendar_oauth_url(provider_name, state)
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
    if not isinstance(user_id, int):
        return HTMLResponse(
            render_calendar_callback_page(False, "Sessão inválida para concluir a conexão."),
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
        token_payload = exchange_calendar_oauth_code(provider_name, code)
        access_token = token_payload.get("access_token")
        provider_email = fetch_provider_profile_email(provider_name, access_token) if isinstance(access_token, str) else None
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
        query = query.where(AgendaDeadline.organization_id == user.organization_id)
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
    deadline = AgendaDeadline(
        user_id=user.id,
        organization_id=user.organization_id,
        title=title,
        due_at=parse_deadline_due_date(payload.due_date),
        reference=(payload.reference or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
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
        deadline_query = deadline_query.where(AgendaDeadline.organization_id == user.organization_id)
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
    counts = build_wallet_case_count_map(session, [wallet.id for wallet in wallets if wallet.id is not None])
    return [serialize_wallet(wallet, counts.get(wallet.id or 0, 0)) for wallet in wallets]


@app.post("/wallets")
def create_wallet(
    payload: CreateWalletRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    ensure_can_manage_team_and_wallets(user)
    scope_organization_id = resolve_organization_scope(user, session, payload.organization_id)
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
    return serialize_wallet(wallet, 0)


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

    wallet.nickname = payload.nickname.strip()
    wallet.description = (payload.description or "").strip() or None
    wallet.is_active = payload.is_active
    wallet.updated_at = datetime.utcnow()
    session.add(wallet)
    session.commit()
    session.refresh(wallet)
    case_count = build_wallet_case_count_map(session, [wallet.id]).get(wallet.id, 0)
    return serialize_wallet(wallet, case_count)


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
    session.delete(wallet)
    session.commit()
    return {"status": "ok", "id": wallet_id}


@app.get("/team-members")
def list_team_members(
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
    organization_id: int | None = None,
) -> list[dict]:
    scope_organization_id = resolve_organization_scope(user, session, organization_id)
    query = select(TeamMember)
    if scope_organization_id is None:
        query = query.where(TeamMember.organization_id == None)  # noqa: E711
    else:
        query = query.where(TeamMember.organization_id == scope_organization_id)
    members = session.exec(query).all()
    return [serialize_team_member(member) for member in members]


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
    if linked_user and linked_user.organization_id == member.organization_id and linked_user.role == "member":
        linked_user.is_active = False
        linked_user.updated_at = datetime.utcnow()
        session.add(linked_user)
    session.delete(member)
    session.commit()
    if linked_user and linked_user.organization_id == member.organization_id and linked_user.role == "member" and linked_user.id is not None:
        revoke_refresh_tokens(session, linked_user.id)
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
    client = Client(
        organization_id=scope_organization_id,
        name=payload.name,
        document=payload.document,
        email=payload.email,
        phone=payload.phone,
        notes=payload.notes,
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

    client.organization_id = target_organization_id
    client.name = payload.name
    client.document = payload.document
    client.email = payload.email
    client.phone = payload.phone
    client.notes = payload.notes
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
    return serialize_case_list(session, cases)


@app.post("/cases")
def create_case(
    payload: CreateCaseRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict:
    scope_organization_id = resolve_organization_scope(user, session, payload.organization_id)
    if payload.client_id:
        client_query = select(Client).where(Client.id == payload.client_id)
        if scope_organization_id is not None:
            client_query = client_query.where(Client.organization_id == scope_organization_id)
        client = session.exec(client_query).first()
        if not client:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente inválido")

    case = Case(
        organization_id=scope_organization_id,
        number=payload.number,
        title=payload.title,
        client_id=payload.client_id,
        status=payload.status,
        forum=payload.forum,
        court=payload.court,
        value=payload.value,
    )
    session.add(case)
    session.commit()
    session.refresh(case)
    wallet = resolve_wallet_for_case(session, payload.wallet_id, case.organization_id)
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
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    current_scope = resolve_existing_record_scope(user, session, case.organization_id)
    if current_scope is not None and case.organization_id != current_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para este processo")

    target_organization_id = case.organization_id
    if payload.organization_id is not None:
        target_organization_id = resolve_organization_scope(user, session, payload.organization_id)

    if payload.client_id is not None:
        client_query = select(Client).where(Client.id == payload.client_id)
        if target_organization_id is not None:
            client_query = client_query.where(Client.organization_id == target_organization_id)
        client = session.exec(client_query).first()
        if not client:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente inválido")

    case.organization_id = target_organization_id
    case.number = payload.number
    case.title = payload.title
    case.client_id = payload.client_id
    case.status = payload.status
    case.forum = payload.forum
    case.court = payload.court
    case.value = payload.value
    case.updated_at = datetime.utcnow()
    session.add(case)
    session.commit()
    session.refresh(case)
    wallet = resolve_wallet_for_case(session, payload.wallet_id, case.organization_id)
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

    link = session.exec(select(CaseWallet).where(CaseWallet.case_id == case.id)).first()
    if link:
        session.delete(link)
    session.delete(case)
    session.commit()
    return {"status": "ok", "id": case_id}


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
