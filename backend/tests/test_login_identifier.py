"""Iteration 4 backend tests: login by identifier (email / VAT / tax_code) + backward compat."""
import os
import time
import random
import string
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://fiscal-card.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
PASSWORD = "password123"


def _rand_digits(n: int) -> str:
    return "".join(random.choices(string.digits, k=n))


def _rand_cf() -> str:
    # 16 chars uppercase alphanumeric (matches ^[A-Z0-9]{16}$)
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=16))


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def registered_user(session):
    """Register a fresh user + create one company profile (VAT) + one individual (CF)."""
    ts = int(time.time() * 1000)
    email = f"iter4+{ts}@fiskid.it"
    r = session.post(f"{API}/auth/register", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    vat = _rand_digits(11)
    cf = _rand_cf()
    # Company profile with VAT
    company = {
        "entity_type": "company",
        "business_name": f"ACME {ts}",
        "vat_number": vat,
        "address": "Via Roma",
        "postal_code": "20100",
        "city": "Milano",
        "province": "MI",
        "contact_email": email,
    }
    r = session.post(f"{API}/fiscal-profiles", json=company, headers=headers)
    assert r.status_code == 200, r.text
    # Individual profile with CF
    indiv = {
        "entity_type": "individual",
        "first_name": "Mario", "last_name": "Rossi",
        "tax_code": cf,
        "address": "Via Verdi",
        "postal_code": "20100",
        "city": "Milano",
        "province": "MI",
        "contact_email": email,
    }
    r = session.post(f"{API}/fiscal-profiles", json=indiv, headers=headers)
    assert r.status_code == 200, r.text
    return {"email": email, "vat": vat, "cf": cf, "token": token}


# ---- identifier = email ----
class TestLoginByEmail:
    def test_login_by_email_identifier(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "identifier": registered_user["email"], "password": PASSWORD,
        })
        assert r.status_code == 200, r.text
        assert "access_token" in r.json()

    def test_login_backward_compat_email_field(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "email": registered_user["email"], "password": PASSWORD,
        })
        assert r.status_code == 200, r.text
        assert r.json()["token_type"] == "bearer"

    def test_login_wrong_password_email(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "identifier": registered_user["email"], "password": "wrong-password-xxxxxx",
        })
        assert r.status_code == 401


# ---- identifier = VAT ----
class TestLoginByVat:
    def test_login_by_vat(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "identifier": registered_user["vat"], "password": PASSWORD,
        })
        assert r.status_code == 200, r.text
        assert "access_token" in r.json()

    def test_login_by_vat_wrong_password(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "identifier": registered_user["vat"], "password": "totally-wrong-1",
        })
        assert r.status_code == 401


# ---- identifier = tax_code ----
class TestLoginByTaxCode:
    def test_login_by_cf_upper(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "identifier": registered_user["cf"], "password": PASSWORD,
        })
        assert r.status_code == 200, r.text

    def test_login_by_cf_lower_normalized(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "identifier": registered_user["cf"].lower(), "password": PASSWORD,
        })
        assert r.status_code == 200, r.text

    def test_login_by_cf_wrong_password(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "identifier": registered_user["cf"], "password": "definitely-not-it",
        })
        assert r.status_code == 401


# ---- Invalid / edge ----
class TestLoginEdge:
    def test_unknown_email_identifier_returns_401(self, session):
        r = session.post(f"{API}/auth/login", json={
            "identifier": f"nope+{int(time.time())}@nowhere.it", "password": PASSWORD,
        })
        assert r.status_code == 401

    def test_unknown_vat_returns_401(self, session):
        r = session.post(f"{API}/auth/login", json={
            "identifier": "99999999999", "password": PASSWORD,
        })
        assert r.status_code == 401

    def test_unknown_cf_returns_401(self, session):
        r = session.post(f"{API}/auth/login", json={
            "identifier": "ZZZZZZZZZZZZZZZZ", "password": PASSWORD,
        })
        assert r.status_code == 401

    def test_missing_identifier_and_email(self, session):
        r = session.post(f"{API}/auth/login", json={"password": PASSWORD})
        assert r.status_code in (400, 422), r.text

    def test_empty_identifier_string(self, session):
        r = session.post(f"{API}/auth/login", json={"identifier": "   ", "password": PASSWORD})
        assert r.status_code in (400, 422)

    def test_short_password_422(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "identifier": registered_user["email"], "password": "abc",
        })
        assert r.status_code == 422


# ---- /auth/me still works with token from identifier login ----
class TestMeAfterIdentifierLogin:
    def test_me_endpoint_after_cf_login(self, session, registered_user):
        r = session.post(f"{API}/auth/login", json={
            "identifier": registered_user["cf"], "password": PASSWORD,
        })
        assert r.status_code == 200
        tok = r.json()["access_token"]
        me = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200
        assert me.json()["email"] == registered_user["email"]
