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
from typing import Optional, Literal

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

# Wallet Pass placeholders (real values plugged in when credentials arrive)
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

bearer = HTTPBearer(auto_error=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.command("ping")
    await users.create_index("email", unique=True)
    # Drop legacy unique index on user_id (single profile per user) if present
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
    yield
    client.close()


app = FastAPI(title="FiskID API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")


# -------------- Models --------------
EntityType = Literal["individual", "professional", "company"]


class Credentials(BaseModel):
    email: EmailStr
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
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_MINUTES),
        "typ": "access",
    }
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
            "user_id": user_id,
            "event_name": event_name,
            "event_metadata": metadata or {},
            "created_at": datetime.now(timezone.utc),
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


def profile_to_private(p: dict) -> dict:
    d = profile_to_public(p)
    d["id"] = str(p["_id"])
    d["label"] = p.get("label")
    d["is_default"] = bool(p.get("is_default", False))
    d["created_at"] = p.get("created_at").isoformat() if p.get("created_at") else None
    d["updated_at"] = p.get("updated_at").isoformat() if p.get("updated_at") else None
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


async def fetch_user_profile(user_id, profile_id: str) -> dict:
    p = await fiscal_profiles.find_one({
        "_id": to_object_id(profile_id),
        "user_id": user_id,
        "deleted_at": {"$exists": False},
    })
    if not p:
        raise HTTPException(status_code=404, detail="Profilo non trovato")
    return p


# -------------- Auth routes --------------
@api_router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(body: Credentials):
    email = normalize_email(str(body.email))
    if await users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email già registrata")
    hashed = await hash_password(body.password)
    result = await users.insert_one({
        "email": email,
        "password_hash": hashed,
        "created_at": datetime.now(timezone.utc),
    })
    uid = str(result.inserted_id)
    await log_event("user_registered", user_id=uid, metadata={"email": email})
    return {"access_token": create_access_token(uid), "token_type": "bearer"}


@api_router.post("/auth/login", response_model=TokenResponse)
async def login(body: Credentials):
    email = normalize_email(str(body.email))
    user = await users.find_one({"email": email})
    valid = await verify_password(body.password, user["password_hash"] if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    return {"access_token": create_access_token(str(user["_id"])), "token_type": "bearer"}


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


# -------------- Fiscal profiles (multi) --------------
@api_router.get("/fiscal-profiles")
async def list_profiles(user=Depends(current_user)):
    cursor = fiscal_profiles.find({
        "user_id": user["_id"],
        "deleted_at": {"$exists": False},
    }).sort("created_at", 1)
    items = []
    async for p in cursor:
        items.append(profile_to_private(p))
    # Ensure at least one default when possible: mark the oldest if none
    if items and not any(x["is_default"] for x in items):
        oldest = items[0]
        await fiscal_profiles.update_one(
            {"_id": ObjectId(oldest["id"])}, {"$set": {"is_default": True}}
        )
        oldest["is_default"] = True
    return {"profiles": items}


# Backward compatible: returns the default profile (or first) as a single object
@api_router.get("/fiscal-profile")
async def get_default_profile(user=Depends(current_user)):
    profile = await fiscal_profiles.find_one({
        "user_id": user["_id"],
        "is_default": True,
        "deleted_at": {"$exists": False},
    })
    if not profile:
        profile = await fiscal_profiles.find_one({
            "user_id": user["_id"],
            "deleted_at": {"$exists": False},
        }, sort=[("created_at", 1)])
    if not profile:
        return {"profile": None}
    return {"profile": profile_to_private(profile)}


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
        "user_id": uid,
        "deleted_at": {"$exists": False},
    })
    data["user_id"] = uid
    data["is_default"] = existing_count == 0  # first profile becomes default
    data["created_at"] = now
    data["updated_at"] = now
    res = await fiscal_profiles.insert_one(data)
    await log_event(
        "fiscal_profile_completed",
        user_id=str(uid),
        metadata={"profile_id": str(res.inserted_id)},
    )
    created = await fiscal_profiles.find_one({"_id": res.inserted_id})
    return {"profile": profile_to_private(created)}


# Legacy singular endpoint kept for backward compatibility (create-or-update default)
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
        "user_id": uid,
        "is_default": True,
        "deleted_at": {"$exists": False},
    }) or await fiscal_profiles.find_one({
        "user_id": uid,
        "deleted_at": {"$exists": False},
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
    p = await fetch_user_profile(user["_id"], profile_id)
    return {"profile": profile_to_private(p)}


@api_router.put("/fiscal-profiles/{profile_id}")
async def update_profile(profile_id: str, payload: FiscalProfileIn, user=Depends(current_user)):
    validate_fiscal_payload(payload)
    existing = await fetch_user_profile(user["_id"], profile_id)
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
    p = await fetch_user_profile(user["_id"], profile_id)
    await fiscal_profiles.update_many(
        {"user_id": user["_id"]},
        {"$set": {"is_default": False}},
    )
    await fiscal_profiles.update_one({"_id": p["_id"]}, {"$set": {"is_default": True}})
    return {"ok": True}


@api_router.delete("/fiscal-profiles/{profile_id}")
async def delete_profile(profile_id: str, user=Depends(current_user)):
    p = await fetch_user_profile(user["_id"], profile_id)
    await fiscal_profiles.update_one(
        {"_id": p["_id"]},
        {"$set": {"deleted_at": datetime.now(timezone.utc), "is_default": False}},
    )
    # Revoke active shares for that profile
    await shares.update_many(
        {"fiscal_profile_id": p["_id"], "is_active": True},
        {"$set": {"is_active": False}},
    )
    # Ensure some default remains
    remaining = await fiscal_profiles.count_documents({
        "user_id": user["_id"],
        "is_default": True,
        "deleted_at": {"$exists": False},
    })
    if remaining == 0:
        oldest = await fiscal_profiles.find_one({
            "user_id": user["_id"],
            "deleted_at": {"$exists": False},
        }, sort=[("created_at", 1)])
        if oldest:
            await fiscal_profiles.update_one({"_id": oldest["_id"]}, {"$set": {"is_default": True}})
    return {"ok": True}


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
        return await fetch_user_profile(user["_id"], profile_id)
    # Default
    profile = await fiscal_profiles.find_one({
        "user_id": user["_id"],
        "is_default": True,
        "deleted_at": {"$exists": False},
    }) or await fiscal_profiles.find_one({
        "user_id": user["_id"],
        "deleted_at": {"$exists": False},
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
        "user_id": user["_id"],
        "share_token": token,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "last_viewed_at": None,
        "view_count": 0,
        "confirmed_at": None,
    }
    await shares.insert_one(doc)
    await log_event(
        "share_created",
        user_id=str(user["_id"]),
        metadata={"profile_id": str(profile["_id"])},
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


# Public share endpoints (no auth)
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
        "share_confirmed",
        user_id=str(s["user_id"]),
        metadata={"token": token, "note": (body.operator_note if body else None)},
    )
    return {"ok": True, "confirmed_at": now.isoformat()}


# -------------- Wallet Pass (MVP: unsigned .pkpass + Google Wallet placeholder) --------------
@api_router.post("/fiscal-profiles/{profile_id}/wallet-tokens")
async def wallet_tokens(profile_id: str, user=Depends(current_user)):
    p = await fetch_user_profile(user["_id"], profile_id)
    payload = {"pid": str(p["_id"]), "uid": str(user["_id"]), "typ": "wallet"}
    tok = create_signed_token(payload, minutes=10)
    return {
        "apple_url": f"/api/wallet/apple/{tok}",
        "google_url": f"/api/wallet/google/{tok}",
        "note": "Preview MVP: Apple .pkpass is unsigned (iOS will refuse until you provide a Pass Type ID + certificate). Google Wallet link points to Google's save endpoint with an unsigned JWT (Google will refuse until you provide the service account).",
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
    entity_label = {
        "individual": "Privato",
        "professional": "Professionista",
        "company": "Azienda",
    }.get(profile.get("entity_type"), "Identità")

    return {
        "formatVersion": 1,
        "passTypeIdentifier": APPLE_PASS_TYPE_ID,
        "teamIdentifier": APPLE_TEAM_ID,
        "organizationName": "FiskID",
        "description": "Fiscal Identity Card",
        "serialNumber": str(profile["_id"]),
        "logoText": "FiskID",
        "foregroundColor": "rgb(255, 255, 255)",
        "backgroundColor": "rgb(5, 5, 5)",
        "labelColor": "rgb(16, 185, 129)",
        "generic": {
            "primaryFields": [
                {"key": "name", "label": "Identità fiscale", "value": display}
            ],
            "secondaryFields": [
                {"key": "type", "label": "Tipo", "value": entity_label},
                {"key": "vat", "label": "P. IVA", "value": vat_masked or "—"},
            ],
            "auxiliaryFields": [
                {"key": "city", "label": "Città", "value": profile.get("city") or "—"},
                {"key": "cap", "label": "CAP", "value": profile.get("postal_code") or "—"},
            ],
            "backFields": [
                {"key": "note", "label": "Nota",
                 "value": "Presenta questa card e condividi i dati tramite FiskID senza pronunciarli a voce."},
            ],
        },
    }


def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


# 1×1 transparent PNG placeholder (icons are required by pkpass structure)
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
        "icon.png": _PNG_1x1,
        "icon@2x.png": _PNG_1x1,
        "logo.png": _PNG_1x1,
        "logo@2x.png": _PNG_1x1,
    }
    manifest = {name: _sha1(data) for name, data in files.items()}
    manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
    # NOTE: real .pkpass requires PKCS#7 signature over manifest.json using an Apple
    # Developer Pass Type ID certificate. Preview MVP ships an empty signature; iOS
    # will refuse to install until real credentials are plugged in.
    signature_bytes = b""

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
        zf.writestr("manifest.json", manifest_bytes)
        zf.writestr("signature", signature_bytes)
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
    # Real Google Wallet requires a JWT signed with a Google Cloud service account
    # (RS256) referencing a real Issuer ID + Class ID. Preview MVP signs with our
    # local HS256 secret so the link structure is real; Google will refuse until
    # a service account is provided.
    if profile.get("entity_type") == "company":
        header = profile.get("business_name") or "FiskID"
    else:
        header = " ".join([profile.get("first_name") or "", profile.get("last_name") or ""]).strip() or "FiskID"
    object_id = f"{GOOGLE_WALLET_ISSUER_ID}.fiskid-{profile['_id']}"
    generic_object = {
        "id": object_id,
        "classId": GOOGLE_WALLET_CLASS_ID,
        "genericType": "GENERIC_TYPE_UNSPECIFIED",
        "hexBackgroundColor": "#050505",
        "cardTitle": {"defaultValue": {"language": "it-IT", "value": "FiskID"}},
        "subheader": {"defaultValue": {"language": "it-IT", "value": "Identità fiscale"}},
        "header": {"defaultValue": {"language": "it-IT", "value": header}},
    }
    google_jwt_payload = {
        "iss": "fiskid-preview@placeholder.iam.gserviceaccount.com",
        "aud": "google",
        "typ": "savetowallet",
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "payload": {"genericObjects": [generic_object]},
    }
    unsigned = jwt.encode(google_jwt_payload, JWT_SECRET, algorithm="HS256")
    save_url = f"https://pay.google.com/gp/v/save/{unsigned}"
    return RedirectResponse(url=save_url, status_code=302)


@api_router.get("/")
async def root():
    return {"message": "FiskID API", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
