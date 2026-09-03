from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import os
import re
import secrets
import zipfile
import logging
from pathlib import Path
from typing import Optional, Literal, List

import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response, RedirectResponse
from fastapi.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret-change-me-please-generate-openssl')
JWT_ALGORITHM = 'HS256'
ACCESS_MINUTES = 60 * 24 * 30
RESET_MINUTES = 30
ENV = os.environ.get('ENV', 'development')

APPLE_PASS_TYPE_ID = os.environ.get('APPLE_PASS_TYPE_ID', 'pass.com.emergent.fiskid')
APPLE_TEAM_ID = os.environ.get('APPLE_TEAM_ID', 'TEAMPLACEHOLDER')
GOOGLE_WALLET_ISSUER_ID = os.environ.get('GOOGLE_WALLET_ISSUER_ID', '3388000000000000000')
GOOGLE_WALLET_CLASS_ID = os.environ.get('GOOGLE_WALLET_CLASS_ID', f'{GOOGLE_WALLET_ISSUER_ID}.fiskid_identity')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
users = db.users
fiscal_profiles = db.fiscal_profiles
shares = db.shares
product_events = db.product_events
resets_col = db.password_resets
delegates_col = db.delegates

bearer = HTTPBearer(auto_error=False)

Permission = Literal["send", "receive"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.command("ping")
    await users.create_index("email", unique=True)
    try:
        info = await fiscal_profiles.index_information()
        if "user_id_1" in info and info["user_id_1"].get("unique"):
            await fiscal_profiles.drop_index("user_id_1")
    except Exception:
        pass
    await fiscal_profiles.create_index("user_id")
    await shares.create_index("share_token", unique=True)
    await shares.create_index("user_id")
    await product_events.create_index("user_id")
    await product_events.create_index("event_name")
    await resets_col.create_index("expires_at", expireAfterSeconds=0)
    await delegates_col.create_index(
        [("fiscal_profile_id", 1), ("delegate_email", 1)], unique=True
    )
    await delegates_col.create_index("delegate_user_id")
    yield
    client.close()


app = FastAPI(title="FiskID API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")


# -------------- Models --------------
EntityType = Literal["individual", "professional", "company"]


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    identifier: Optional[str] = Field(default=None, description="Email, VAT number or tax code")
    email: Optional[str] = None  # backward compat
    password: str = Field(min_length=8, max_length=128)


class ResetRequest(BaseModel):
    email: EmailStr


class ResetConfirm(BaseModel):
    token: str = Field(min_length=16)
    new_password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class FiscalProfileIn(BaseModel):
    label: Optional[str] = None
    entity_type: EntityType
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    business_name: Optional[str] = None
    vat_number: Optional[str] = None
    tax_code: Optional[str] = None
    address: str
    street_number: Optional[str] = None
    postal_code: str
    city: str
    province: str
    country: str = "IT"
    recipient_code: Optional[str] = None
    pec: Optional[str] = None
    contact_email: EmailStr
    contact_phone: Optional[str] = None


class EventIn(BaseModel):
    event_name: str
    event_metadata: Optional[dict] = None


class ShareConfirmIn(BaseModel):
    operator_note: Optional[str] = None


class ShareCreateIn(BaseModel):
    fiscal_profile_id: Optional[str] = None


class DelegateIn(BaseModel):
    email: EmailStr
    permissions: List[Permission] = Field(min_length=1)


class DelegatePermsIn(BaseModel):
    permissions: List[Permission] = Field(min_length=1)


# -------------- Password helpers --------------
async def hash_password(password: str) -> str:
    raw = await run_in_threadpool(
        bcrypt.hashpw, password.encode("utf-8"), bcrypt.gensalt(rounds=12)
    )
    return raw.decode("utf-8")


async def verify_password(password: str, hashed: str) -> bool:
    return await run_in_threadpool(
        bcrypt.checkpw, password.encode("utf-8"), hashed.encode("utf-8")
    )


DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt(rounds=12)).decode()


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=ACCESS_MINUTES), "typ": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_signed_token(payload: dict, minutes: int = 10) -> str:
    now = datetime.now(timezone.utc)
    body = {**payload, "iat": now, "exp": now + timedelta(minutes=minutes)}
    return jwt.encode(body, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_signed_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if payload.get("typ") != "access" or not user_id:
            raise ValueError()
        user = await users.find_one({"_id": ObjectId(user_id)})
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def log_event(event_name: str, user_id: Optional[str] = None, metadata: Optional[dict] = None):
    try:
        await product_events.insert_one({
            "user_id": user_id, "event_name": event_name,
            "event_metadata": metadata or {}, "created_at": datetime.now(timezone.utc),
        })
    except Exception as e:
        logging.warning(f"event log failed: {e}")


# -------------- Validators --------------
VAT_RE = re.compile(r"^\d{11}$")
CF_RE = re.compile(r"^[A-Z0-9]{16}$")
CAP_RE = re.compile(r"^\d{5}$")
RECIPIENT_RE = re.compile(r"^[A-Z0-9]{6,7}$")


def validate_fiscal_payload(p: FiscalProfileIn):
    errors = {}
    if p.entity_type == "company":
        if not (p.business_name and p.business_name.strip()):
            errors["business_name"] = "Ragione sociale obbligatoria"
        if not (p.vat_number and VAT_RE.match(p.vat_number)):
            errors["vat_number"] = "Partita IVA non valida (11 cifre)"
    else:
        if not (p.first_name and p.first_name.strip()):
            errors["first_name"] = "Nome obbligatorio"
        if not (p.last_name and p.last_name.strip()):
            errors["last_name"] = "Cognome obbligatorio"
        if p.entity_type == "professional":
            if not (p.vat_number and VAT_RE.match(p.vat_number)):
                errors["vat_number"] = "Partita IVA non valida (11 cifre)"
        if p.tax_code and not CF_RE.match(p.tax_code.upper()):
            errors["tax_code"] = "Codice fiscale non valido (16 caratteri)"
        if p.entity_type == "individual" and not p.tax_code:
            errors["tax_code"] = "Codice fiscale obbligatorio"
    if not CAP_RE.match(p.postal_code):
        errors["postal_code"] = "CAP non valido (5 cifre)"
    if p.recipient_code and not RECIPIENT_RE.match(p.recipient_code.upper()):
        errors["recipient_code"] = "Codice destinatario non valido (6-7 caratteri)"
    if p.pec and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", p.pec):
        errors["pec"] = "PEC non valida"
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})


def profile_to_public(p: dict) -> dict:
    return {
        "entity_type": p.get("entity_type"),
        "first_name": p.get("first_name"),
        "last_name": p.get("last_name"),
        "business_name": p.get("business_name"),
        "vat_number": p.get("vat_number"),
        "tax_code": p.get("tax_code"),
        "address": p.get("address"),
        "street_number": p.get("street_number"),
        "postal_code": p.get("postal_code"),
        "city": p.get("city"),
        "province": p.get("province"),
        "country": p.get("country"),
        "recipient_code": p.get("recipient_code"),
        "pec": p.get("pec"),
        "contact_email": p.get("contact_email"),
        "contact_phone": p.get("contact_phone"),
    }


def profile_to_private(p: dict, extra: Optional[dict] = None) -> dict:
    d = profile_to_public(p)
    d["id"] = str(p["_id"])
    d["label"] = p.get("label")
    d["is_default"] = bool(p.get("is_default", False))
    d["created_at"] = p.get("created_at").isoformat() if p.get("created_at") else None
    d["updated_at"] = p.get("updated_at").isoformat() if p.get("updated_at") else None
    if extra:
        d.update(extra)
    return d


def default_label(payload: FiscalProfileIn) -> str:
    if payload.entity_type == "company":
        return (payload.business_name or "Azienda").strip()
    parts = [payload.first_name, payload.last_name]
    joined = " ".join([x.strip() for x in parts if x and x.strip()])
    return joined or ("Professionista" if payload.entity_type == "professional" else "Personale")


def to_object_id(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=404, detail="Profilo non trovato")


async def fetch_owned_profile(user_id, profile_id: str) -> dict:
    """Return a profile that belongs to `user_id` (admin-only access)."""
    p = await fiscal_profiles.find_one({
        "_id": to_object_id(profile_id),
        "user_id": user_id,
        "deleted_at": {"$exists": False},
    })
    if not p:
        raise HTTPException(status_code=404, detail="Profilo non trovato")
    return p


async def get_delegation(user_id, profile_id) -> Optional[dict]:
    return await delegates_col.find_one({
        "fiscal_profile_id": profile_id if isinstance(profile_id, ObjectId) else to_object_id(profile_id),
        "delegate_user_id": user_id,
        "status": "active",
    })


async def fetch_accessible_profile(user, profile_id: str, required_permission: Optional[Permission] = None) -> dict:
    """Return a profile the caller can access as owner or as active delegate."""
    p = await fiscal_profiles.find_one({
        "_id": to_object_id(profile_id),
        "deleted_at": {"$exists": False},
    })
    if not p:
        raise HTTPException(status_code=404, detail="Profilo non trovato")
    if p["user_id"] == user["_id"]:
        return p
    deleg = await get_delegation(user["_id"], p["_id"])
    if not deleg:
        raise HTTPException(status_code=404, detail="Profilo non trovato")
    if required_permission and required_permission not in deleg.get("permissions", []):
        raise HTTPException(status_code=403, detail=f"Manca il permesso '{required_permission}' su questa identità")
    return p


def delegate_public(d: dict, admin_email: Optional[str] = None) -> dict:
    return {
        "id": str(d["_id"]),
        "email": d.get("delegate_email"),
        "permissions": d.get("permissions", []),
        "status": d.get("status"),
        "linked": d.get("delegate_user_id") is not None,
        "created_at": d["created_at"].isoformat() if d.get("created_at") else None,
        "resolved_at": d["resolved_at"].isoformat() if d.get("resolved_at") else None,
        "revoked_at": d["revoked_at"].isoformat() if d.get("revoked_at") else None,
        **({"admin_email": admin_email} if admin_email else {}),
    }


async def resolve_pending_invitations(user_id, email: str):
    """When a user registers/logs in for the first time with an email that had
    pending delegate invitations, link them automatically."""
    now = datetime.now(timezone.utc)
    await delegates_col.update_many(
        {"delegate_email": email, "delegate_user_id": None, "status": "invited"},
        {"$set": {"delegate_user_id": user_id, "status": "active", "resolved_at": now}},
    )


# -------------- Auth routes --------------
@api_router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(body: Credentials):
    email = normalize_email(str(body.email))
    if await users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email già registrata")
    hashed = await hash_password(body.password)
    result = await users.insert_one({
        "email": email, "password_hash": hashed,
        "created_at": datetime.now(timezone.utc),
    })
    uid = result.inserted_id
    await resolve_pending_invitations(uid, email)
    await log_event("user_registered", user_id=str(uid), metadata={"email": email})
    return {"access_token": create_access_token(str(uid)), "token_type": "bearer"}


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginIn):
    raw = (body.identifier or body.email or "").strip()
    if not raw:
        raise HTTPException(status_code=422, detail="Fornire email, partita IVA o codice fiscale")

    user = await resolve_user_by_identifier(raw)
    hashed = user["password_hash"] if user else DUMMY_HASH
    valid = await verify_password(body.password, hashed)
    if not user or not valid:
        raise HTTPException(status_code=401, detail="Credenziali non corrette")
    # Late-linking safety: if invitations arrived after registration, hook them up.
    await resolve_pending_invitations(user["_id"], user["email"])
    return {"access_token": create_access_token(str(user["_id"])), "token_type": "bearer"}


async def resolve_user_by_identifier(ident: str):
    """Match email OR active fiscal_profile VAT/tax_code and return the owning user."""
    ident = ident.strip()
    if not ident:
        return None
    # Email
    if "@" in ident:
        return await users.find_one({"email": ident.lower()})
    # VAT (exactly 11 digits)
    if VAT_RE.match(ident):
        p = await fiscal_profiles.find_one({
            "vat_number": ident,
            "deleted_at": {"$exists": False},
        })
        if p:
            return await users.find_one({"_id": p["user_id"]})
    # Tax code (16 alphanumeric)
    up = ident.upper()
    if CF_RE.match(up):
        p = await fiscal_profiles.find_one({
            "tax_code": up,
            "deleted_at": {"$exists": False},
        })
        if p:
            return await users.find_one({"_id": p["user_id"]})
    return None


@api_router.post("/auth/logout")
async def logout(user=Depends(current_user)):
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user=Depends(current_user)):
    return {"id": str(user["_id"]), "email": user["email"]}


@api_router.post("/auth/forgot-password")
async def forgot_password(body: ResetRequest):
    email = normalize_email(str(body.email))
    user = await users.find_one({"email": email})
    response = {"message": "Se l'account esiste, riceverai istruzioni per il reset."}
    if not user:
        return response
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires = datetime.now(timezone.utc) + timedelta(minutes=RESET_MINUTES)
    await resets_col.delete_many({"user_id": user["_id"]})
    await resets_col.insert_one({
        "user_id": user["_id"], "token_hash": token_hash,
        "expires_at": expires, "used": False,
    })
    if ENV == "development":
        response["dev_reset_token"] = raw_token
    return response


@api_router.post("/auth/reset-password")
async def reset_password(body: ResetConfirm):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    record = await resets_col.find_one({
        "token_hash": token_hash, "used": False,
        "expires_at": {"$gt": datetime.now(timezone.utc)},
    })
    if not record:
        raise HTTPException(status_code=400, detail="Token non valido o scaduto")
    new_hash = await hash_password(body.new_password)
    await users.update_one({"_id": record["user_id"]}, {"$set": {"password_hash": new_hash}})
    await resets_col.update_one({"_id": record["_id"]}, {"$set": {"used": True}})
    return {"message": "Password reimpostata con successo"}


# -------------- Fiscal profiles (multi + delegated) --------------
@api_router.get("/fiscal-profiles")
async def list_profiles(user=Depends(current_user)):
    items = []
    # Owned
    async for p in fiscal_profiles.find({
        "user_id": user["_id"], "deleted_at": {"$exists": False},
    }).sort("created_at", 1):
        items.append(profile_to_private(p, {"is_delegate": False, "permissions": ["send", "receive"]}))
    # Ensure at least one default among owned
    owned = [x for x in items if not x["is_delegate"]]
    if owned and not any(x["is_default"] for x in owned):
        await fiscal_profiles.update_one(
            {"_id": ObjectId(owned[0]["id"])}, {"$set": {"is_default": True}}
        )
        owned[0]["is_default"] = True

    # Delegated
    async for d in delegates_col.find({
        "delegate_user_id": user["_id"], "status": "active",
    }):
        p = await fiscal_profiles.find_one({
            "_id": d["fiscal_profile_id"],
            "deleted_at": {"$exists": False},
        })
        if not p:
            continue
        admin = await users.find_one({"_id": p["user_id"]}, {"email": 1})
        items.append(profile_to_private(p, {
            "is_delegate": True,
            "is_default": False,
            "permissions": d.get("permissions", []),
            "admin_email": admin.get("email") if admin else None,
            "delegation_id": str(d["_id"]),
        }))
    return {"profiles": items}


@api_router.get("/fiscal-profile")
async def get_default_profile(user=Depends(current_user)):
    profile = await fiscal_profiles.find_one({
        "user_id": user["_id"], "is_default": True, "deleted_at": {"$exists": False},
    }) or await fiscal_profiles.find_one({
        "user_id": user["_id"], "deleted_at": {"$exists": False},
    }, sort=[("created_at", 1)])
    if not profile:
        return {"profile": None}
    return {"profile": profile_to_private(profile, {"is_delegate": False, "permissions": ["send", "receive"]})}


@api_router.post("/fiscal-profiles")
async def create_profile(payload: FiscalProfileIn, user=Depends(current_user)):
    validate_fiscal_payload(payload)
    uid = user["_id"]
    now = datetime.now(timezone.utc)
    data = payload.model_dump()
    if data.get("tax_code"):
        data["tax_code"] = data["tax_code"].upper()
    if data.get("recipient_code"):
        data["recipient_code"] = data["recipient_code"].upper()
    if not data.get("label"):
        data["label"] = default_label(payload)
    existing_count = await fiscal_profiles.count_documents({
        "user_id": uid, "deleted_at": {"$exists": False},
    })
    data["user_id"] = uid
    data["is_default"] = existing_count == 0
    data["created_at"] = now
    data["updated_at"] = now
    res = await fiscal_profiles.insert_one(data)
    await log_event("fiscal_profile_completed", user_id=str(uid),
                    metadata={"profile_id": str(res.inserted_id)})
    created = await fiscal_profiles.find_one({"_id": res.inserted_id})
    return {"profile": profile_to_private(created)}


@api_router.post("/fiscal-profile")
async def upsert_default_profile(payload: FiscalProfileIn, user=Depends(current_user)):
    validate_fiscal_payload(payload)
    uid = user["_id"]
    now = datetime.now(timezone.utc)
    data = payload.model_dump()
    if data.get("tax_code"):
        data["tax_code"] = data["tax_code"].upper()
    if data.get("recipient_code"):
        data["recipient_code"] = data["recipient_code"].upper()
    if not data.get("label"):
        data["label"] = default_label(payload)
    existing = await fiscal_profiles.find_one({
        "user_id": uid, "is_default": True, "deleted_at": {"$exists": False},
    }) or await fiscal_profiles.find_one({
        "user_id": uid, "deleted_at": {"$exists": False},
    }, sort=[("created_at", 1)])
    if existing:
        data["updated_at"] = now
        await fiscal_profiles.update_one({"_id": existing["_id"]}, {"$set": data})
        await log_event("fiscal_profile_updated", user_id=str(uid),
                        metadata={"profile_id": str(existing["_id"])})
        updated = await fiscal_profiles.find_one({"_id": existing["_id"]})
        return {"profile": profile_to_private(updated)}
    data["user_id"] = uid
    data["is_default"] = True
    data["created_at"] = now
    data["updated_at"] = now
    res = await fiscal_profiles.insert_one(data)
    await log_event("fiscal_profile_completed", user_id=str(uid),
                    metadata={"profile_id": str(res.inserted_id)})
    created = await fiscal_profiles.find_one({"_id": res.inserted_id})
    return {"profile": profile_to_private(created)}


@api_router.get("/fiscal-profiles/{profile_id}")
async def get_profile(profile_id: str, user=Depends(current_user)):
    p = await fiscal_profiles.find_one({
        "_id": to_object_id(profile_id),
        "deleted_at": {"$exists": False},
    })
    if not p:
        raise HTTPException(status_code=404, detail="Profilo non trovato")
    if p["user_id"] == user["_id"]:
        return {"profile": profile_to_private(p, {"is_delegate": False, "permissions": ["send", "receive"]})}
    deleg = await get_delegation(user["_id"], p["_id"])
    if not deleg:
        raise HTTPException(status_code=404, detail="Profilo non trovato")
    admin = await users.find_one({"_id": p["user_id"]}, {"email": 1})
    return {"profile": profile_to_private(p, {
        "is_delegate": True,
        "permissions": deleg.get("permissions", []),
        "admin_email": admin.get("email") if admin else None,
        "delegation_id": str(deleg["_id"]),
        "is_default": False,
    })}


@api_router.put("/fiscal-profiles/{profile_id}")
async def update_profile(profile_id: str, payload: FiscalProfileIn, user=Depends(current_user)):
    validate_fiscal_payload(payload)
    existing = await fetch_owned_profile(user["_id"], profile_id)
    data = payload.model_dump()
    if data.get("tax_code"):
        data["tax_code"] = data["tax_code"].upper()
    if data.get("recipient_code"):
        data["recipient_code"] = data["recipient_code"].upper()
    if not data.get("label"):
        data["label"] = default_label(payload)
    data["updated_at"] = datetime.now(timezone.utc)
    await fiscal_profiles.update_one({"_id": existing["_id"]}, {"$set": data})
    await log_event("fiscal_profile_updated", user_id=str(user["_id"]),
                    metadata={"profile_id": profile_id})
    updated = await fiscal_profiles.find_one({"_id": existing["_id"]})
    return {"profile": profile_to_private(updated)}


@api_router.post("/fiscal-profiles/{profile_id}/set-default")
async def set_default_profile(profile_id: str, user=Depends(current_user)):
    p = await fetch_owned_profile(user["_id"], profile_id)
    await fiscal_profiles.update_many({"user_id": user["_id"]}, {"$set": {"is_default": False}})
    await fiscal_profiles.update_one({"_id": p["_id"]}, {"$set": {"is_default": True}})
    return {"ok": True}


@api_router.delete("/fiscal-profiles/{profile_id}")
async def delete_profile(profile_id: str, user=Depends(current_user)):
    p = await fetch_owned_profile(user["_id"], profile_id)
    await fiscal_profiles.update_one(
        {"_id": p["_id"]},
        {"$set": {"deleted_at": datetime.now(timezone.utc), "is_default": False}},
    )
    await shares.update_many(
        {"fiscal_profile_id": p["_id"], "is_active": True},
        {"$set": {"is_active": False}},
    )
    # Revoke delegates as well
    await delegates_col.update_many(
        {"fiscal_profile_id": p["_id"], "status": "active"},
        {"$set": {"status": "revoked", "revoked_at": datetime.now(timezone.utc)}},
    )
    remaining = await fiscal_profiles.count_documents({
        "user_id": user["_id"], "is_default": True, "deleted_at": {"$exists": False},
    })
    if remaining == 0:
        oldest = await fiscal_profiles.find_one({
            "user_id": user["_id"], "deleted_at": {"$exists": False},
        }, sort=[("created_at", 1)])
        if oldest:
            await fiscal_profiles.update_one({"_id": oldest["_id"]}, {"$set": {"is_default": True}})
    return {"ok": True}


# -------------- Delegates (company profiles only) --------------
@api_router.get("/fiscal-profiles/{profile_id}/delegates")
async def list_delegates(profile_id: str, user=Depends(current_user)):
    p = await fetch_owned_profile(user["_id"], profile_id)
    if p.get("entity_type") != "company":
        raise HTTPException(status_code=400, detail="I delegati sono disponibili solo per identità aziendali")
    out = []
    async for d in delegates_col.find({"fiscal_profile_id": p["_id"], "status": {"$in": ["invited", "active"]}}).sort("created_at", 1):
        out.append(delegate_public(d))
    return {"delegates": out}


@api_router.post("/fiscal-profiles/{profile_id}/delegates", status_code=201)
async def add_delegate(profile_id: str, body: DelegateIn, user=Depends(current_user)):
    p = await fetch_owned_profile(user["_id"], profile_id)
    if p.get("entity_type") != "company":
        raise HTTPException(status_code=400, detail="I delegati sono disponibili solo per identità aziendali")
    delegate_email = normalize_email(str(body.email))
    # Prevent adding self as delegate
    owner_email = (await users.find_one({"_id": user["_id"]}, {"email": 1})).get("email")
    if delegate_email == owner_email:
        raise HTTPException(status_code=400, detail="Non puoi delegare te stesso")

    # Resolve existing user if any
    dele_user = await users.find_one({"email": delegate_email}, {"_id": 1})
    now = datetime.now(timezone.utc)
    doc = {
        "fiscal_profile_id": p["_id"],
        "admin_user_id": user["_id"],
        "delegate_email": delegate_email,
        "delegate_user_id": dele_user["_id"] if dele_user else None,
        "permissions": list(dict.fromkeys(body.permissions)),  # dedupe preserve order
        "status": "active" if dele_user else "invited",
        "created_at": now,
        "resolved_at": now if dele_user else None,
    }
    try:
        res = await delegates_col.insert_one(doc)
    except Exception:
        raise HTTPException(status_code=409, detail="Questo indirizzo è già delegato per questa identità")
    created = await delegates_col.find_one({"_id": res.inserted_id})
    await log_event("delegate_added", user_id=str(user["_id"]),
                    metadata={"profile_id": profile_id, "email": delegate_email, "permissions": body.permissions})
    return {"delegate": delegate_public(created)}


@api_router.patch("/fiscal-profiles/{profile_id}/delegates/{delegate_id}")
async def update_delegate(profile_id: str, delegate_id: str, body: DelegatePermsIn, user=Depends(current_user)):
    p = await fetch_owned_profile(user["_id"], profile_id)
    d = await delegates_col.find_one({"_id": to_object_id(delegate_id), "fiscal_profile_id": p["_id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Delega non trovata")
    await delegates_col.update_one(
        {"_id": d["_id"]},
        {"$set": {"permissions": list(dict.fromkeys(body.permissions))}},
    )
    await log_event("delegate_updated", user_id=str(user["_id"]),
                    metadata={"delegate_id": delegate_id, "permissions": body.permissions})
    updated = await delegates_col.find_one({"_id": d["_id"]})
    return {"delegate": delegate_public(updated)}


@api_router.delete("/fiscal-profiles/{profile_id}/delegates/{delegate_id}")
async def revoke_delegate(profile_id: str, delegate_id: str, user=Depends(current_user)):
    p = await fetch_owned_profile(user["_id"], profile_id)
    d = await delegates_col.find_one({"_id": to_object_id(delegate_id), "fiscal_profile_id": p["_id"]})
    if not d:
        raise HTTPException(status_code=404, detail="Delega non trovata")
    await delegates_col.update_one(
        {"_id": d["_id"]},
        {"$set": {"status": "revoked", "revoked_at": datetime.now(timezone.utc)}},
    )
    await log_event("delegate_revoked", user_id=str(user["_id"]),
                    metadata={"delegate_id": delegate_id})
    return {"ok": True}


# -------------- Events --------------
@api_router.post("/events")
async def create_event(body: EventIn, request: Request):
    uid = None
    try:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            payload = jwt.decode(auth.split(" ", 1)[1], JWT_SECRET, algorithms=[JWT_ALGORITHM])
            uid = payload.get("sub")
    except Exception:
        pass
    await log_event(body.event_name, user_id=uid, metadata=body.event_metadata)
    return {"ok": True}


# -------------- Shares --------------
async def resolve_profile_for_share(user, profile_id: Optional[str]) -> dict:
    if profile_id:
        return await fetch_accessible_profile(user, profile_id, required_permission="send")
    # Default: owner's default profile only (delegates must specify id)
    profile = await fiscal_profiles.find_one({
        "user_id": user["_id"], "is_default": True, "deleted_at": {"$exists": False},
    }) or await fiscal_profiles.find_one({
        "user_id": user["_id"], "deleted_at": {"$exists": False},
    }, sort=[("created_at", 1)])
    if not profile:
        raise HTTPException(status_code=400, detail="Completa prima il tuo profilo fiscale")
    return profile


@api_router.post("/shares")
async def create_share(body: Optional[ShareCreateIn] = None, user=Depends(current_user)):
    profile = await resolve_profile_for_share(user, body.fiscal_profile_id if body else None)
    token = secrets.token_urlsafe(24)
    doc = {
        "fiscal_profile_id": profile["_id"],
        "user_id": user["_id"],  # who created the share (may be delegate)
        "owner_user_id": profile["user_id"],
        "share_token": token,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "last_viewed_at": None,
        "view_count": 0,
        "confirmed_at": None,
    }
    await shares.insert_one(doc)
    await log_event(
        "share_created", user_id=str(user["_id"]),
        metadata={"profile_id": str(profile["_id"]), "as_delegate": profile["user_id"] != user["_id"]},
    )
    return {
        "token": token,
        "created_at": doc["created_at"].isoformat(),
        "profile_id": str(profile["_id"]),
        "profile_label": profile.get("label"),
    }


@api_router.get("/shares/history")
async def share_history(user=Depends(current_user)):
    cursor = shares.find({"user_id": user["_id"]}).sort("created_at", -1).limit(50)
    out = []
    async for s in cursor:
        out.append({
            "token": s["share_token"],
            "created_at": s["created_at"].isoformat() if s.get("created_at") else None,
            "last_viewed_at": s["last_viewed_at"].isoformat() if s.get("last_viewed_at") else None,
            "view_count": s.get("view_count", 0),
            "is_active": s.get("is_active", True),
            "confirmed_at": s["confirmed_at"].isoformat() if s.get("confirmed_at") else None,
            "profile_id": str(s.get("fiscal_profile_id")) if s.get("fiscal_profile_id") else None,
        })
    return {"shares": out}


@api_router.post("/shares/{token}/revoke")
async def revoke_share(token: str, user=Depends(current_user)):
    r = await shares.update_one(
        {"share_token": token, "user_id": user["_id"]},
        {"$set": {"is_active": False}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Condivisione non trovata")
    return {"ok": True}


@api_router.get("/public/share/{token}")
async def public_share_get(token: str):
    s = await shares.find_one({"share_token": token, "is_active": True})
    if not s:
        raise HTTPException(status_code=404, detail="Condivisione non valida o scaduta")
    profile = await fiscal_profiles.find_one({"_id": s["fiscal_profile_id"]})
    if not profile or profile.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Condivisione non valida o scaduta")
    await shares.update_one(
        {"_id": s["_id"]},
        {"$set": {"last_viewed_at": datetime.now(timezone.utc)}, "$inc": {"view_count": 1}},
    )
    await log_event("share_opened", user_id=str(s["user_id"]), metadata={"token": token})
    return {
        "profile": profile_to_public(profile),
        "confirmed_at": s["confirmed_at"].isoformat() if s.get("confirmed_at") else None,
    }


@api_router.post("/public/share/{token}/confirm")
async def public_share_confirm(token: str, body: Optional[ShareConfirmIn] = None):
    s = await shares.find_one({"share_token": token, "is_active": True})
    if not s:
        raise HTTPException(status_code=404, detail="Condivisione non valida")
    now = datetime.now(timezone.utc)
    await shares.update_one({"_id": s["_id"]}, {"$set": {"confirmed_at": now}})
    await log_event(
        "share_confirmed", user_id=str(s["user_id"]),
        metadata={"token": token, "note": (body.operator_note if body else None)},
    )
    return {"ok": True, "confirmed_at": now.isoformat()}


# -------------- Wallet Pass (unsigned MVP) --------------
@api_router.post("/fiscal-profiles/{profile_id}/wallet-tokens")
async def wallet_tokens(profile_id: str, user=Depends(current_user)):
    # Owner or delegate can add to their wallet
    p = await fetch_accessible_profile(user, profile_id)
    payload = {"pid": str(p["_id"]), "uid": str(user["_id"]), "typ": "wallet"}
    tok = create_signed_token(payload, minutes=10)
    return {
        "apple_url": f"/api/wallet/apple/{tok}",
        "google_url": f"/api/wallet/google/{tok}",
        "note": "Preview MVP: Apple .pkpass unsigned (needs Pass Type ID + cert). Google JWT is HS256 placeholder (needs GCP service account).",
    }


async def _wallet_load(token: str) -> dict:
    try:
        payload = decode_signed_token(token)
        if payload.get("typ") != "wallet":
            raise ValueError()
        p = await fiscal_profiles.find_one({"_id": ObjectId(payload["pid"])})
        if not p or p.get("deleted_at"):
            raise ValueError()
        return p
    except Exception:
        raise HTTPException(status_code=404, detail="Wallet link non valido o scaduto")


def _pass_json(profile: dict) -> dict:
    if profile.get("entity_type") == "company":
        display = profile.get("business_name") or "FiskID"
    else:
        display = " ".join([profile.get("first_name") or "", profile.get("last_name") or ""]).strip() or "FiskID"
    vat = profile.get("vat_number") or ""
    vat_masked = "•• •• •• •• " + vat[-3:] if vat and len(vat) > 4 else vat
    entity_label = {"individual": "Privato", "professional": "Professionista", "company": "Azienda"}.get(profile.get("entity_type"), "Identità")
    return {
        "formatVersion": 1, "passTypeIdentifier": APPLE_PASS_TYPE_ID, "teamIdentifier": APPLE_TEAM_ID,
        "organizationName": "FiskID", "description": "Fiscal Identity Card",
        "serialNumber": str(profile["_id"]), "logoText": "FiskID",
        "foregroundColor": "rgb(255, 255, 255)", "backgroundColor": "rgb(5, 5, 5)", "labelColor": "rgb(16, 185, 129)",
        "generic": {
            "primaryFields": [{"key": "name", "label": "Identità fiscale", "value": display}],
            "secondaryFields": [
                {"key": "type", "label": "Tipo", "value": entity_label},
                {"key": "vat", "label": "P. IVA", "value": vat_masked or "—"},
            ],
            "auxiliaryFields": [
                {"key": "city", "label": "Città", "value": profile.get("city") or "—"},
                {"key": "cap", "label": "CAP", "value": profile.get("postal_code") or "—"},
            ],
            "backFields": [{"key": "note", "label": "Nota",
                            "value": "Presenta questa card e condividi i dati tramite FiskID senza pronunciarli a voce."}],
        },
    }


def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


_PNG_1x1 = bytes.fromhex(
    "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489000000"
    "0A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
)


@api_router.get("/wallet/apple/{token}")
async def wallet_apple(token: str):
    profile = await _wallet_load(token)
    pass_json = json.dumps(_pass_json(profile), indent=2).encode("utf-8")
    files = {
        "pass.json": pass_json,
        "icon.png": _PNG_1x1, "icon@2x.png": _PNG_1x1,
        "logo.png": _PNG_1x1, "logo@2x.png": _PNG_1x1,
    }
    manifest = {name: _sha1(data) for name, data in files.items()}
    manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
        zf.writestr("manifest.json", manifest_bytes)
        zf.writestr("signature", b"")
    buf.seek(0)
    filename = f"fiskid-{profile['_id']}.pkpass"
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.apple.pkpass",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.get("/wallet/google/{token}")
async def wallet_google(token: str):
    profile = await _wallet_load(token)
    if profile.get("entity_type") == "company":
        header = profile.get("business_name") or "FiskID"
    else:
        header = " ".join([profile.get("first_name") or "", profile.get("last_name") or ""]).strip() or "FiskID"
    object_id = f"{GOOGLE_WALLET_ISSUER_ID}.fiskid-{profile['_id']}"
    generic_object = {
        "id": object_id, "classId": GOOGLE_WALLET_CLASS_ID,
        "genericType": "GENERIC_TYPE_UNSPECIFIED", "hexBackgroundColor": "#050505",
        "cardTitle": {"defaultValue": {"language": "it-IT", "value": "FiskID"}},
        "subheader": {"defaultValue": {"language": "it-IT", "value": "Identità fiscale"}},
        "header": {"defaultValue": {"language": "it-IT", "value": header}},
    }
    google_jwt_payload = {
        "iss": "fiskid-preview@placeholder.iam.gserviceaccount.com",
        "aud": "google", "typ": "savetowallet",
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "payload": {"genericObjects": [generic_object]},
    }
    unsigned = jwt.encode(google_jwt_payload, JWT_SECRET, algorithm="HS256")
    return RedirectResponse(url=f"https://pay.google.com/gp/v/save/{unsigned}", status_code=302)


@api_router.get("/")
async def root():
    return {"message": "FiskID API", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
