"""Backend tests for FiskID Delegates system (iteration 3).

Covers:
- POST /api/fiscal-profiles/{id}/delegates (validation, self, uniqueness, company-only, admin-only)
- Auto-link on register: invite BEFORE register → active with delegate_user_id on register
- Auto-link on register/login when already-registered user is invited
- GET /api/fiscal-profiles: delegated profile with is_delegate=true, permissions, admin_email, delegation_id
- GET /fiscal-profiles/{id}: delegate can access; unrelated user 404
- PUT/DELETE /fiscal-profiles/{id}: delegate 404 (owner-only)
- POST /fiscal-profiles/{id}/set-default: delegate 404
- POST /api/shares with delegated profile: send perm → 200 (owner_user_id=admin, user_id=delegate); receive-only → 403
- POST /api/shares empty body for delegate w/o owned default → 400
- PATCH /delegates/{id}: admin updates perms; wrong admin 404; empty perms 422
- DELETE /delegates/{id}: revoked, disappears from delegate GET /fiscal-profiles
- DELETE profile: soft-deletes and revokes delegates → delegate can no longer see it
- wallet-tokens accessible for delegate
"""
import os
import time
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

TS = int(time.time())
ADMIN_EMAIL = f"admin+{TS}@fiskid.it"
DELEGATE_EMAIL = f"delegate+{TS}@fiskid.it"       # invited BEFORE registration (auto-link on register)
DELEGATE2_EMAIL = f"delegate2+{TS}@fiskid.it"     # exists BEFORE invite (auto-link on invite creation → active)
UNRELATED_EMAIL = f"unrelated+{TS}@fiskid.it"
PASSWORD = "password123"

STATE = {}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _register(sess, email):
    r = sess.post(f"{API}/auth/register", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _login(sess, email, pw=PASSWORD):
    r = sess.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _bearer(tok):
    return {"Authorization": f"Bearer {tok}"}


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


# ---------------- Bootstrap: register admin + unrelated, create company + individual profiles ----------------
class TestBootstrap:
    def test_register_admin_and_create_company(self, s):
        tok = _register(s, ADMIN_EMAIL)
        STATE["admin_auth"] = _bearer(tok)
        r = s.post(f"{API}/fiscal-profiles", json=_payload_company(), headers=STATE["admin_auth"])
        assert r.status_code == 200, r.text
        STATE["company_id"] = r.json()["profile"]["id"]
        assert r.json()["profile"]["entity_type"] == "company"
        # add a personal profile too (not company) to test 400 for non-company
        r2 = s.post(f"{API}/fiscal-profiles", json=_payload_individual(), headers=STATE["admin_auth"])
        assert r2.status_code == 200
        STATE["personal_id"] = r2.json()["profile"]["id"]

    def test_register_unrelated_user(self, s):
        STATE["unrelated_auth"] = _bearer(_register(s, UNRELATED_EMAIL))


# ---------------- Add delegate (validation + status) ----------------
class TestAddDelegate:
    def test_non_company_400(self, s):
        r = s.post(
            f"{API}/fiscal-profiles/{STATE['personal_id']}/delegates",
            json={"email": DELEGATE_EMAIL, "permissions": ["send", "receive"]},
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 400
        assert "aziend" in r.json().get("detail", "").lower()

    def test_other_user_admin_only_404(self, s):
        r = s.post(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates",
            json={"email": DELEGATE_EMAIL, "permissions": ["send"]},
            headers=STATE["unrelated_auth"],
        )
        assert r.status_code == 404

    def test_self_delegation_400(self, s):
        r = s.post(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates",
            json={"email": ADMIN_EMAIL, "permissions": ["send"]},
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 400

    def test_empty_permissions_422(self, s):
        r = s.post(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates",
            json={"email": DELEGATE_EMAIL, "permissions": []},
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 422

    def test_invite_unregistered_email_status_invited(self, s):
        r = s.post(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates",
            json={"email": DELEGATE_EMAIL, "permissions": ["send", "receive"]},
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 201, r.text
        d = r.json()["delegate"]
        assert d["email"] == DELEGATE_EMAIL
        assert d["status"] == "invited"
        assert d["linked"] is False
        assert d["permissions"] == ["send", "receive"]
        STATE["delegate_row_id"] = d["id"]

    def test_duplicate_409(self, s):
        r = s.post(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates",
            json={"email": DELEGATE_EMAIL, "permissions": ["send"]},
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 409

    def test_invite_already_registered_email_status_active(self, s):
        # First register DELEGATE2 so it exists BEFORE invite
        _register(s, DELEGATE2_EMAIL)
        r = s.post(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates",
            json={"email": DELEGATE2_EMAIL, "permissions": ["receive"]},
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 201
        d = r.json()["delegate"]
        assert d["status"] == "active"
        assert d["linked"] is True
        assert d["permissions"] == ["receive"]
        STATE["delegate2_row_id"] = d["id"]


# ---------------- Auto-link on register ----------------
class TestAutoLinkOnRegister:
    def test_register_invited_user_auto_links(self, s):
        # DELEGATE_EMAIL was invited BEFORE registering. Now register it.
        tok = _register(s, DELEGATE_EMAIL)
        STATE["delegate_auth"] = _bearer(tok)
        # GET /fiscal-profiles should show the delegated company profile
        r = s.get(f"{API}/fiscal-profiles", headers=STATE["delegate_auth"])
        assert r.status_code == 200, r.text
        profs = r.json()["profiles"]
        # delegate has NO owned profiles → only the delegated one is visible
        delegated = [x for x in profs if x.get("is_delegate")]
        assert len(delegated) == 1, profs
        dp = delegated[0]
        assert dp["id"] == STATE["company_id"]
        assert dp["is_delegate"] is True
        assert dp["is_default"] is False
        assert dp["permissions"] == ["send", "receive"]
        assert dp["admin_email"] == ADMIN_EMAIL
        assert "delegation_id" in dp
        assert "_id" not in dp and "user_id" not in dp

    def test_login_also_resolves_pending(self, s):
        # DELEGATE2 was already registered when invited → already active. Login should keep it active.
        tok = _login(s, DELEGATE2_EMAIL)
        STATE["delegate2_auth"] = _bearer(tok)
        r = s.get(f"{API}/fiscal-profiles", headers=STATE["delegate2_auth"])
        assert r.status_code == 200
        profs = r.json()["profiles"]
        delegated = [x for x in profs if x.get("is_delegate")]
        assert len(delegated) == 1
        assert delegated[0]["permissions"] == ["receive"]
        assert delegated[0]["admin_email"] == ADMIN_EMAIL


# ---------------- GET/PUT/DELETE by id + set-default ----------------
class TestDelegateProfileAccess:
    def test_delegate_get_profile_by_id(self, s):
        r = s.get(f"{API}/fiscal-profiles/{STATE['company_id']}", headers=STATE["delegate_auth"])
        assert r.status_code == 200
        p = r.json()["profile"]
        assert p["is_delegate"] is True
        assert p["permissions"] == ["send", "receive"]
        assert p["admin_email"] == ADMIN_EMAIL

    def test_unrelated_user_get_profile_404(self, s):
        r = s.get(f"{API}/fiscal-profiles/{STATE['company_id']}", headers=STATE["unrelated_auth"])
        assert r.status_code == 404

    def test_delegate_put_profile_404(self, s):
        r = s.put(
            f"{API}/fiscal-profiles/{STATE['company_id']}",
            json=_payload_company(city="Torino"),
            headers=STATE["delegate_auth"],
        )
        assert r.status_code == 404

    def test_delegate_delete_profile_404(self, s):
        r = s.delete(f"{API}/fiscal-profiles/{STATE['company_id']}", headers=STATE["delegate_auth"])
        assert r.status_code == 404

    def test_delegate_set_default_404(self, s):
        r = s.post(f"{API}/fiscal-profiles/{STATE['company_id']}/set-default", headers=STATE["delegate_auth"])
        assert r.status_code == 404


# ---------------- Shares with delegated profile ----------------
class TestSharesAsDelegate:
    def test_delegate_with_send_can_create_share(self, s):
        r = s.post(
            f"{API}/shares",
            json={"fiscal_profile_id": STATE["company_id"]},
            headers=STATE["delegate_auth"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["profile_id"] == STATE["company_id"]
        assert body["profile_label"] == "Azienda"
        STATE["share_token"] = body["token"]

    def test_delegate_receive_only_forbidden_on_share(self, s):
        r = s.post(
            f"{API}/shares",
            json={"fiscal_profile_id": STATE["company_id"]},
            headers=STATE["delegate2_auth"],
        )
        assert r.status_code == 403
        detail = r.json().get("detail", "").lower()
        assert "send" in detail

    def test_delegate_empty_body_share_400(self, s):
        # Delegate has NO owned default profile → 400
        r = s.post(f"{API}/shares", json={}, headers=STATE["delegate_auth"])
        assert r.status_code == 400
        assert "profilo" in r.json().get("detail", "").lower()

    def test_public_share_of_delegate_created(self, s):
        r = s.get(f"{API}/public/share/{STATE['share_token']}")
        assert r.status_code == 200
        p = r.json()["profile"]
        # ACME company data leaks in public share (as expected — owner data)
        assert p.get("business_name") == "ACME srl"
        assert "_id" not in p and "user_id" not in p


# ---------------- PATCH & DELETE delegate rows ----------------
class TestManageDelegates:
    def test_patch_wrong_admin_404(self, s):
        r = s.patch(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates/{STATE['delegate_row_id']}",
            json={"permissions": ["send"]},
            headers=STATE["unrelated_auth"],
        )
        assert r.status_code == 404

    def test_patch_empty_perms_422(self, s):
        r = s.patch(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates/{STATE['delegate_row_id']}",
            json={"permissions": []},
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 422

    def test_patch_missing_perms_field_422(self, s):
        r = s.patch(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates/{STATE['delegate_row_id']}",
            json={},
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 422

    def test_patch_updates_permissions(self, s):
        r = s.patch(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates/{STATE['delegate_row_id']}",
            json={"permissions": ["receive"]},
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 200
        d = r.json()["delegate"]
        assert d["permissions"] == ["receive"]
        # Verify via delegate GET /fiscal-profiles
        pr = s.get(f"{API}/fiscal-profiles", headers=STATE["delegate_auth"]).json()["profiles"]
        dp = [x for x in pr if x.get("is_delegate")][0]
        assert dp["permissions"] == ["receive"]

    def test_delegate_receive_only_after_patch_cannot_send(self, s):
        r = s.post(
            f"{API}/shares",
            json={"fiscal_profile_id": STATE["company_id"]},
            headers=STATE["delegate_auth"],
        )
        assert r.status_code == 403
        assert "send" in r.json().get("detail", "").lower()

    def test_wallet_tokens_accessible_by_delegate(self, s):
        r = s.post(
            f"{API}/fiscal-profiles/{STATE['company_id']}/wallet-tokens",
            headers=STATE["delegate_auth"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "apple_url" in body and "google_url" in body

    def test_delete_delegate_revokes(self, s):
        r = s.delete(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates/{STATE['delegate_row_id']}",
            headers=STATE["admin_auth"],
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # Delegate no longer sees the profile
        profs = s.get(f"{API}/fiscal-profiles", headers=STATE["delegate_auth"]).json()["profiles"]
        assert not any(p.get("is_delegate") for p in profs)
        # List delegates admin-side: should not contain revoked one
        lr = s.get(
            f"{API}/fiscal-profiles/{STATE['company_id']}/delegates",
            headers=STATE["admin_auth"],
        )
        assert lr.status_code == 200
        ids = [d["id"] for d in lr.json()["delegates"]]
        assert STATE["delegate_row_id"] not in ids


# ---------------- Delete company profile → revokes remaining delegates ----------------
class TestCompanyDeletionRevokesDelegates:
    def test_delete_company_profile_revokes_active_delegate(self, s):
        # delegate2 is still active
        pre = s.get(f"{API}/fiscal-profiles", headers=STATE["delegate2_auth"]).json()["profiles"]
        assert any(p.get("is_delegate") and p["id"] == STATE["company_id"] for p in pre)
        # Admin deletes the company profile
        r = s.delete(f"{API}/fiscal-profiles/{STATE['company_id']}", headers=STATE["admin_auth"])
        assert r.status_code == 200
        # Delegate2 should now no longer see the delegated profile
        post = s.get(f"{API}/fiscal-profiles", headers=STATE["delegate2_auth"]).json()["profiles"]
        assert not any(p.get("is_delegate") for p in post)
