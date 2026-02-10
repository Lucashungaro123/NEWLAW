"""FastAPI backend for the NEWLAW desktop app (Tauri + React + Python).

This API is started by the Tauri shell and serves the local WebView.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlmodel import Session, SQLModel, create_engine, select

from .models import Case, Client, Invoice, Organization, Plan, RefreshToken, Template, User

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
    """Ensure there is at least one master admin user."""
    email = os.getenv("NEWLAW_MASTER_EMAIL", "master@newlaw.app.br")
    password = os.getenv("NEWLAW_MASTER_PASSWORD", "Newlaw#2026!Master")
    full_name = os.getenv("NEWLAW_MASTER_NAME", "Administrador")
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        return
    validate_password_strength(password)
    admin = User(
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
    """Insert basic plan presets if none exist."""
    if session.exec(select(Plan)).first():
        return
    plans = [
        Plan(slug="basic", name="Basic", user_limit=3),
        Plan(slug="team", name="Team", user_limit=10),
        Plan(slug="enterprise", name="Enterprise", user_limit=50),
    ]
    session.add_all(plans)
    session.commit()


def init_db() -> None:
    os.makedirs(STORAGE_PATH, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_master_admin(session)
        seed_plans(session)
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
    user = session.exec(select(User).where(User.email == payload.username)).first()
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
        user={
            "id": user.id,
            "email": user.email,
            "name": user.full_name,
            "role": user.role,
        },
    )


@app.get("/auth/me")
def auth_me(user: Annotated[User, Depends(get_current_user)]) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.full_name,
        "role": user.role,
    }


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
        user={
            "id": user.id,
            "email": user.email,
            "name": user.full_name,
            "role": user.role,
        },
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
    user = session.exec(select(User).where(User.email == payload.email)).first()
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


@app.post("/admin/organizations")
def create_organization(
    payload: CreateOrganizationRequest,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[None, Depends(require_admin_secret)],
) -> dict:
    if session.exec(select(User).where(User.email == payload.owner_email)).first():
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
        email=payload.owner_email,
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
    if session.exec(select(User).where(User.email == payload.email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email já cadastrado")
    validate_password_strength(payload.password)
    organization = session.get(Organization, payload.organization_id)
    if not organization or not organization.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização inválida")
    plan_limit = None
    if organization.user_limit_override is not None:
        plan_limit = organization.user_limit_override
    elif organization.plan_id:
        plan = session.get(Plan, organization.plan_id)
        if plan:
            plan_limit = plan.user_limit
    if plan_limit is not None:
        active_count = session.exec(
            select(User).where(User.organization_id == organization.id, User.is_active == True)  # noqa: E712
        ).all()
        if len(active_count) >= plan_limit:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Limite de usuários do plano atingido")
    user = User(
        organization_id=organization.id,
        email=payload.email,
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


@app.get("/clients")
def list_clients(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[Client]:
    return session.exec(select(Client)).all()


@app.post("/clients")
def create_client(
    client: Client,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> Client:
    session.add(client)
    session.commit()
    session.refresh(client)
    return client


@app.get("/cases")
def list_cases(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[Case]:
    return session.exec(select(Case)).all()


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
