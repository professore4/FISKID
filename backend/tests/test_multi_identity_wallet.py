"""Backend tests for FiskID Multi Identità (multi fiscal profiles) + Wallet Pass.

Covers iteration 2 features:
- POST/GET/PUT/DELETE /api/fiscal-profiles + set-default
- Ownership isolation (other user's id => 404)
- Shares with explicit fiscal_profile_id + label in response
- Public share leak check (no _id/user_id/label/is_default)
- Wallet tokens + Apple .pkpass zip + Google 302 redirect
- Legacy singular endpoints still work
"""
import io
import json
import os
import time
import zipfile

import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

TS = int(time.time())
EMAIL_A = f"multi_a+{TS}@fiskid.it"
EMAIL_B = f"multi_b+{TS}@fiskid.it"
PASSWORD = "password123"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _register_and_auth(sess, email):
    r = sess.post(f"{API}/auth/register", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def auth_a(s):
    return _register_and_auth(s, EMAIL_A)


@pytest.fixture(scope="module")
def auth_b(s):
    return _register_and_auth(s, EMAIL_B)


def _payload_individual(**overrides):
    base = {
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
        "label": "Personale",
    }
    base.update(overrides)
    return base


def _payload_company(**overrides):
    base = {
        "entity_type": "company",
        "business_name": "ACME srl",
        "vat_number": "12345678901",
        "address": "Via Milano",
        "street_number": "5",
        "postal_code": "20100",
        "city": "Milano",
        "province": "MI",
        "country": "IT",
        "contact_email": "acme@test.it",
        "label": "Azienda",
    }
    base.update(overrides)
    return base


STATE = {}


# ------------------ Multi profiles CRUD ------------------
class TestMultiProfiles:
    def test_create_first_profile_is_default(self, s, auth_a):
        r = s.post(f"{API}/fiscal-profiles", json=_payload_individual(), headers=auth_a)
        assert r.status_code == 200, r.text
        p = r.json()["profile"]
        assert p["is_default"] is True
        assert p["label"] == "Personale"
        assert "id" in p and "_id" not in p and "user_id" not in p
        STATE["p1"] = p["id"]

    def test_create_second_profile_is_not_default(self, s, auth_a):
        r = s.post(f"{API}/fiscal-profiles", json=_payload_company(), headers=auth_a)
        assert r.status_code == 200, r.text
        p = r.json()["profile"]
        assert p["is_default"] is False
        assert p["label"] == "Azienda"
        STATE["p2"] = p["id"]

    def test_create_validation_still_422(self, s, auth_a):
        bad = _payload_individual(postal_code="12")
        r = s.post(f"{API}/fiscal-profiles", json=bad, headers=auth_a)
        assert r.status_code == 422

    def test_list_profiles(self, s, auth_a):
        r = s.get(f"{API}/fiscal-profiles", headers=auth_a)
        assert r.status_code == 200
        arr = r.json()["profiles"]
        assert len(arr) == 2
        defaults = [x for x in arr if x["is_default"]]
        assert len(defaults) == 1
        # ordering: oldest first
        assert arr[0]["id"] == STATE["p1"]

    def test_get_profile_by_id(self, s, auth_a):
        r = s.get(f"{API}/fiscal-profiles/{STATE['p1']}", headers=auth_a)
        assert r.status_code == 200
        assert r.json()["profile"]["id"] == STATE["p1"]

    def test_get_profile_bad_objectid_404(self, s, auth_a):
        r = s.get(f"{API}/fiscal-profiles/not-a-valid-id", headers=auth_a)
        assert r.status_code == 404

    def test_get_profile_other_user_404(self, s, auth_b):
        r = s.get(f"{API}/fiscal-profiles/{STATE['p1']}", headers=auth_b)
        assert r.status_code == 404

    def test_update_profile(self, s, auth_a):
        payload = _payload_individual(city="Milano", label="Casa")
        r = s.put(f"{API}/fiscal-profiles/{STATE['p1']}", json=payload, headers=auth_a)
        assert r.status_code == 200
        assert r.json()["profile"]["city"] == "Milano"
        assert r.json()["profile"]["label"] == "Casa"

    def test_update_other_user_404(self, s, auth_b):
        r = s.put(f"{API}/fiscal-profiles/{STATE['p1']}", json=_payload_individual(), headers=auth_b)
        assert r.status_code == 404

    def test_update_validation_422(self, s, auth_a):
        r = s.put(
            f"{API}/fiscal-profiles/{STATE['p1']}",
            json=_payload_individual(postal_code="1"),
            headers=auth_a,
        )
        assert r.status_code == 422

    def test_set_default(self, s, auth_a):
        r = s.post(f"{API}/fiscal-profiles/{STATE['p2']}/set-default", headers=auth_a)
        assert r.status_code == 200
        arr = s.get(f"{API}/fiscal-profiles", headers=auth_a).json()["profiles"]
        defaults = [x["id"] for x in arr if x["is_default"]]
        assert defaults == [STATE["p2"]]


# ------------------ Shares with profile ID ------------------
class TestSharesWithProfile:
    def test_share_default_empty_body(self, s, auth_a):
        r = s.post(f"{API}/shares", headers=auth_a, json={})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["profile_id"] == STATE["p2"]  # default is p2 now
        assert body["profile_label"] == "Azienda"
        STATE["share_default_token"] = body["token"]

    def test_share_specific_profile(self, s, auth_a):
        r = s.post(
            f"{API}/shares",
            json={"fiscal_profile_id": STATE["p1"]},
            headers=auth_a,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["profile_id"] == STATE["p1"]
        assert body["profile_label"] == "Casa"
        STATE["share_p1_token"] = body["token"]

    def test_share_unowned_profile_404_or_400(self, s, auth_b):
        r = s.post(
            f"{API}/shares",
            json={"fiscal_profile_id": STATE["p1"]},
            headers=auth_b,
        )
        # 404 (not found for other user) is expected; 400 also acceptable per spec
        assert r.status_code in (400, 404), r.text

    def test_public_share_no_private_leak(self, s):
        r = s.get(f"{API}/public/share/{STATE['share_p1_token']}")
        assert r.status_code == 200
        body = r.json()
        p = body["profile"]
        assert "_id" not in p
        assert "user_id" not in p
        assert "label" not in p
        assert "is_default" not in p
        # public data still present
        assert p["first_name"] == "Mario"


# ------------------ Wallet Pass ------------------
class TestWallet:
    def test_wallet_tokens_response(self, s, auth_a):
        r = s.post(
            f"{API}/fiscal-profiles/{STATE['p1']}/wallet-tokens", headers=auth_a
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "apple_url" in body
        assert "google_url" in body
        assert "note" in body
        assert "/api/wallet/apple/" in body["apple_url"]
        assert "/api/wallet/google/" in body["google_url"]
        # extract jwt tail
        STATE["apple_jwt"] = body["apple_url"].split("/api/wallet/apple/", 1)[1]
        STATE["google_jwt"] = body["google_url"].split("/api/wallet/google/", 1)[1]

    def test_apple_pkpass_content(self, s):
        r = s.get(f"{API}/wallet/apple/{STATE['apple_jwt']}")
        assert r.status_code == 200
        assert r.headers.get("Content-Type", "").startswith(
            "application/vnd.apple.pkpass"
        )
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd
        assert ".pkpass" in cd
        # Body must be a valid ZIP
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = set(zf.namelist())
        required = {
            "pass.json", "manifest.json", "signature",
            "icon.png", "icon@2x.png", "logo.png", "logo@2x.png",
        }
        assert required.issubset(names), f"missing pkpass entries: {required - names}"
        pass_data = json.loads(zf.read("pass.json"))
        assert pass_data.get("formatVersion") == 1
        assert "passTypeIdentifier" in pass_data

    def test_apple_invalid_jwt_404(self, s):
        r = s.get(f"{API}/wallet/apple/definitely-not-a-jwt")
        assert r.status_code == 404

    def test_google_302_redirect(self, s):
        r = s.get(
            f"{API}/wallet/google/{STATE['google_jwt']}",
            allow_redirects=False,
        )
        assert r.status_code == 302
        loc = r.headers.get("Location", "")
        assert loc.startswith("https://pay.google.com/gp/v/save/"), loc

    def test_google_invalid_jwt_404(self, s):
        r = s.get(
            f"{API}/wallet/google/definitely-not-a-jwt",
            allow_redirects=False,
        )
        assert r.status_code == 404


# ------------------ Soft delete ------------------
class TestSoftDelete:
    def test_delete_default_reassigns(self, s, auth_a):
        # p2 is default. Delete p2 → p1 should become default and its share revoked.
        r = s.delete(f"{API}/fiscal-profiles/{STATE['p2']}", headers=auth_a)
        assert r.status_code == 200
        arr = s.get(f"{API}/fiscal-profiles", headers=auth_a).json()["profiles"]
        ids = [x["id"] for x in arr]
        assert STATE["p2"] not in ids
        assert len(arr) == 1 and arr[0]["id"] == STATE["p1"]
        assert arr[0]["is_default"] is True
        # p2's share must now be inactive (public 404)
        r2 = s.get(f"{API}/public/share/{STATE['share_default_token']}")
        assert r2.status_code == 404


# ------------------ Legacy singular endpoints ------------------
class TestLegacyEndpoints:
    def test_legacy_get_returns_default(self, s, auth_a):
        r = s.get(f"{API}/fiscal-profile", headers=auth_a)
        assert r.status_code == 200
        p = r.json()["profile"]
        assert p is not None
        assert p["id"] == STATE["p1"]

    def test_legacy_post_upserts_default(self, s, auth_a):
        payload = _payload_individual(city="Torino", label="Casa")
        r = s.post(f"{API}/fiscal-profile", json=payload, headers=auth_a)
        assert r.status_code == 200
        p = r.json()["profile"]
        assert p["id"] == STATE["p1"]
        assert p["city"] == "Torino"
        # still only 1 profile
        arr = s.get(f"{API}/fiscal-profiles", headers=auth_a).json()["profiles"]
        assert len(arr) == 1
