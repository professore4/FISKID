"""Backend tests for FiskID API (auth, fiscal profile, shares)."""
import os
import time
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://fiscal-card.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

TS = int(time.time())
EMAIL = f"tester+{TS}@fiskid.it"
PASSWORD = "password123"
STATE = {}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def token(s):
    r = s.post(f"{API}/auth/register", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 201, r.text
    data = r.json()
    assert "access_token" in data and data["token_type"] == "bearer"
    return data["access_token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ------------------- AUTH -------------------
class TestAuth:
    def test_register_duplicate_409(self, s, token):
        r = s.post(f"{API}/auth/register", json={"email": EMAIL, "password": PASSWORD})
        assert r.status_code == 409

    def test_register_short_password_422(self, s):
        r = s.post(f"{API}/auth/register", json={"email": f"short+{TS}@fiskid.it", "password": "abc"})
        assert r.status_code == 422

    def test_login_valid(self, s):
        r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password_401(self, s):
        r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": "wrongwrong"})
        assert r.status_code == 401

    def test_login_unknown_email_401(self, s):
        r = s.post(f"{API}/auth/login", json={"email": f"ghost+{TS}@fiskid.it", "password": "whatever12"})
        assert r.status_code == 401

    def test_me_with_bearer(self, s, auth):
        r = s.get(f"{API}/auth/me", headers=auth)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == EMAIL and "id" in body

    def test_me_without_bearer_401(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401


class TestForgotReset:
    def test_forgot_existing(self, s):
        r = s.post(f"{API}/auth/forgot-password", json={"email": EMAIL})
        assert r.status_code == 200
        body = r.json()
        assert "message" in body and "dev_reset_token" in body
        STATE["reset_token"] = body["dev_reset_token"]

    def test_forgot_unknown(self, s):
        r = s.post(f"{API}/auth/forgot-password", json={"email": f"nobody+{TS}@fiskid.it"})
        assert r.status_code == 200
        assert "dev_reset_token" not in r.json()

    def test_reset_and_relogin(self, s):
        tok = STATE["reset_token"]
        r = s.post(f"{API}/auth/reset-password", json={"token": tok, "new_password": "newpass1234"})
        assert r.status_code == 200
        # Login with new password
        r2 = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": "newpass1234"})
        assert r2.status_code == 200
        # Reused token → 400
        r3 = s.post(f"{API}/auth/reset-password", json={"token": tok, "new_password": "another123"})
        assert r3.status_code == 400


# ------------------- FISCAL PROFILE -------------------
VALID_INDIVIDUAL = {
    "entity_type": "individual",
    "first_name": "Mario",
    "last_name": "Rossi",
    "tax_code": "RSSMRA80A01H501U",
    "address": "Via Roma",
    "street_number": "10",
    "postal_code": "00100",
    "city": "Roma",
    "province": "RM",
    "country": "IT",
    "contact_email": "mario@test.it",
}


class TestFiscalProfile:
    def _reauth(self, s):
        r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": "newpass1234"})
        assert r.status_code == 200
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    def test_create_individual_valid(self, s):
        h = self._reauth(s)
        r = s.post(f"{API}/fiscal-profile", json=VALID_INDIVIDUAL, headers=h)
        assert r.status_code == 200, r.text
        p = r.json()["profile"]
        assert p["entity_type"] == "individual"
        assert "id" in p and isinstance(p["id"], str)
        # No leaks
        assert "_id" not in p and "user_id" not in p
        STATE["auth"] = h

    def test_missing_tax_code_individual_422(self, s):
        payload = {**VALID_INDIVIDUAL}
        payload.pop("tax_code")
        r = s.post(f"{API}/fiscal-profile", json=payload, headers=STATE["auth"])
        assert r.status_code == 422

    def test_company_vat_not_11_digits_422(self, s):
        payload = {**VALID_INDIVIDUAL, "entity_type": "company", "business_name": "ACME srl",
                   "vat_number": "12345", "first_name": None, "last_name": None, "tax_code": None}
        r = s.post(f"{API}/fiscal-profile", json=payload, headers=STATE["auth"])
        assert r.status_code == 422

    def test_company_missing_business_name_422(self, s):
        payload = {**VALID_INDIVIDUAL, "entity_type": "company", "vat_number": "12345678901",
                   "first_name": None, "last_name": None, "tax_code": None}
        r = s.post(f"{API}/fiscal-profile", json=payload, headers=STATE["auth"])
        assert r.status_code == 422

    def test_cap_not_5_digits_422(self, s):
        payload = {**VALID_INDIVIDUAL, "postal_code": "12"}
        r = s.post(f"{API}/fiscal-profile", json=payload, headers=STATE["auth"])
        assert r.status_code == 422

    def test_invalid_recipient_code_422(self, s):
        payload = {**VALID_INDIVIDUAL, "recipient_code": "!!"}
        r = s.post(f"{API}/fiscal-profile", json=payload, headers=STATE["auth"])
        assert r.status_code == 422

    def test_get_profile_no_leak(self, s):
        r = s.get(f"{API}/fiscal-profile", headers=STATE["auth"])
        assert r.status_code == 200
        p = r.json()["profile"]
        assert p is not None
        assert "_id" not in p and "user_id" not in p
        assert p["tax_code"] == "RSSMRA80A01H501U"

    def test_upsert_updates_same_document(self, s):
        payload = {**VALID_INDIVIDUAL, "city": "Milano"}
        r1 = s.post(f"{API}/fiscal-profile", json=payload, headers=STATE["auth"])
        assert r1.status_code == 200
        r2 = s.get(f"{API}/fiscal-profile", headers=STATE["auth"])
        assert r2.json()["profile"]["city"] == "Milano"


# ------------------- SHARES -------------------
class TestShares:
    def test_create_share_and_history(self, s):
        r = s.post(f"{API}/shares", headers=STATE["auth"])
        assert r.status_code == 200
        STATE["share_token"] = r.json()["token"]

        h = s.get(f"{API}/shares/history", headers=STATE["auth"])
        assert h.status_code == 200
        arr = h.json()["shares"]
        assert any(sh["token"] == STATE["share_token"] for sh in arr)

    def test_public_share_get(self, s):
        tok = STATE["share_token"]
        r = s.get(f"{API}/public/share/{tok}")
        assert r.status_code == 200
        body = r.json()
        assert "profile" in body
        p = body["profile"]
        assert "_id" not in p and "user_id" not in p
        # Second call increments view_count in history
        s.get(f"{API}/public/share/{tok}")
        hist = s.get(f"{API}/shares/history", headers=STATE["auth"]).json()["shares"]
        this = [x for x in hist if x["token"] == tok][0]
        assert this["view_count"] >= 2

    def test_public_confirm(self, s):
        tok = STATE["share_token"]
        r = s.post(f"{API}/public/share/{tok}/confirm", json={"operator_note": "test"})
        assert r.status_code == 200
        assert r.json()["confirmed_at"]
        hist = s.get(f"{API}/shares/history", headers=STATE["auth"]).json()["shares"]
        this = [x for x in hist if x["token"] == tok][0]
        assert this["confirmed_at"] is not None

    def test_public_invalid_token_404(self, s):
        r = s.get(f"{API}/public/share/deadbeef-not-real")
        assert r.status_code == 404

    def test_revoke_then_public_404(self, s):
        tok = STATE["share_token"]
        r = s.post(f"{API}/shares/{tok}/revoke", headers=STATE["auth"])
        assert r.status_code == 200
        r2 = s.get(f"{API}/public/share/{tok}")
        assert r2.status_code == 404
