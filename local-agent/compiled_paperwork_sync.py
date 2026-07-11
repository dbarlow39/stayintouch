"""
Compiled Paperwork Sync - Local Agent
Runs twice daily via Windows Task Scheduler (7am, 7pm).

What it does:
  1. Calls sync-compiled-paperwork-local to list Gmail emails with subject
     "Compiled Paperwork for <address>" from the last 90 days.
  2. For each email, checks if a matching folder exists in:
       C:\\Users\\dbarl\\Dropbox\\0 Sell for 1 Percent\\Closed Deals
  3. If missing: downloads every PDF attachment, saves them under
       Closed Deals\\<address>\\, uploads each to the closing-paperwork
       Supabase storage bucket, parses the PDFs with parse-closing-paperwork,
       and inserts a closings row with paperwork_status='received'.
  4. Appends entries to to_print.txt for later printing.

First run:
  python compiled_paperwork_sync.py --login

Subsequent runs (Task Scheduler):
  pythonw.exe compiled_paperwork_sync.py
"""

import argparse
import base64
import getpass
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, date
from pathlib import Path

import requests

# ---- Configuration ----
SUPABASE_URL = "https://ujhohggsvijjqoatvwnl.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaG9oZ2"
    "dzdmlqanFvYXR2d25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MjYzOTcsImV4cCI6MjA3OTQwMj"
    "M5N30.L1LEN9byJDXEPzl3RZcgx39OnLMWef4fjL36hvbffi4"
)
DROPBOX_FOLDER = Path(r"C:\Users\dbarl\Dropbox\0 Sell for 1 Percent\Closed Deals")
STATE_DIR = Path(os.environ.get("APPDATA", str(Path.home()))) / "compiled-sync"
TOKEN_FILE = STATE_DIR / "token.json"
LOG_FILE = STATE_DIR / "sync.log"
PRINT_LIST = DROPBOX_FOLDER / "to_print.txt"

STATE_DIR.mkdir(parents=True, exist_ok=True)


def log(msg):
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ---------------- Auth ----------------
def login_interactive():
    print("Compiled Paperwork Sync - first-time login")
    email = input("Email: ").strip()
    password = getpass.getpass("Password: ")
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    if r.status_code != 200:
        print("Login failed:", r.text)
        sys.exit(1)
    data = r.json()
    TOKEN_FILE.write_text(json.dumps({
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at": int(time.time()) + int(data.get("expires_in", 3600)) - 60,
    }))
    print("Login saved to", TOKEN_FILE)


def get_access_token():
    if not TOKEN_FILE.exists():
        log("No token file. Run: python compiled_paperwork_sync.py --login")
        sys.exit(1)
    tok = json.loads(TOKEN_FILE.read_text())
    if tok["expires_at"] > int(time.time()):
        return tok["access_token"]
    # refresh
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"refresh_token": tok["refresh_token"]},
        timeout=30,
    )
    if r.status_code != 200:
        log(f"Token refresh failed: {r.text}. Re-run with --login.")
        sys.exit(1)
    data = r.json()
    TOKEN_FILE.write_text(json.dumps({
        "access_token": data["access_token"],
        "refresh_token": data["refresh_token"],
        "expires_at": int(time.time()) + int(data.get("expires_in", 3600)) - 60,
    }))
    return data["access_token"]


# ---------------- Helpers ----------------
def normalize_addr(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def address_already_in_dropbox(address):
    """Walk Closed Deals folder and check if any subdir or file name contains the
    normalized address."""
    target = normalize_addr(address)
    if not target:
        return True
    if not DROPBOX_FOLDER.exists():
        log(f"WARNING: Dropbox folder not found: {DROPBOX_FOLDER}")
        return False
    for root, dirs, files in os.walk(DROPBOX_FOLDER):
        for name in list(dirs) + list(files):
            if target in normalize_addr(name):
                return True
    return False


def call_fn(fn_name, access_token, body=None, method="POST"):
    url = f"{SUPABASE_URL}/functions/v1/{fn_name}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }
    if method == "POST":
        r = requests.post(url, headers=headers, json=body or {}, timeout=120)
    else:
        r = requests.get(url, headers=headers, timeout=120)
    return r


def storage_upload(access_token, bucket, path, pdf_bytes):
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    r = requests.post(url, headers={
        "Authorization": f"Bearer {access_token}",
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/pdf",
        "x-upsert": "false",
    }, data=pdf_bytes, timeout=120)
    return r


def storage_signed_url(access_token, bucket, path, expires_in=600):
    url = f"{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{path}"
    r = requests.post(url, headers={
        "Authorization": f"Bearer {access_token}",
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
    }, json={"expiresIn": expires_in}, timeout=30)
    r.raise_for_status()
    signed = r.json()["signedURL"]
    return f"{SUPABASE_URL}/storage/v1{signed}"


def get_agent_info(access_token):
    """Get user id + profile full name."""
    r = requests.get(f"{SUPABASE_URL}/auth/v1/user", headers={
        "Authorization": f"Bearer {access_token}",
        "apikey": SUPABASE_ANON_KEY,
    }, timeout=30)
    r.raise_for_status()
    user = r.json()
    user_id = user["id"]

    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/profiles?select=full_name&id=eq.{user_id}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_ANON_KEY,
        }, timeout=30,
    )
    name = ""
    if r.ok and r.json():
        name = r.json()[0].get("full_name") or ""
    if not name:
        name = user.get("email", "Unknown")
    return user_id, name


def insert_closing(access_token, row):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/closings",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }, json=row, timeout=30,
    )
    return r


def _normalize_street(addr):
    """Lowercase, strip punctuation, collapse whitespace, normalize common suffixes."""
    if not addr:
        return ""
    s = str(addr).lower()
    # Take only the portion before the first comma (drops city/state/zip)
    s = s.split(",")[0]
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    suffix_map = {
        "road": "rd", "street": "st", "drive": "dr", "avenue": "ave", "boulevard": "blvd",
        "lane": "ln", "court": "ct", "circle": "cir", "place": "pl", "terrace": "ter",
        "parkway": "pkwy", "highway": "hwy", "trail": "trl", "way": "way",
    }
    parts = [suffix_map.get(p, p) for p in s.split(" ")]
    return " ".join(parts)


def find_existing_closing(access_token, agent_id, address):
    """
    Look for an existing closing for this agent with no paperwork yet whose
    address partially matches. Returns closing id, or None if no unambiguous match.
    """
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/closings",
            headers={
                "Authorization": f"Bearer {access_token}",
                "apikey": SUPABASE_ANON_KEY,
            },
            params={
                "select": "id,property_address,paperwork_files",
                "agent_id": f"eq.{agent_id}",
                "or": "(paperwork_files.is.null,paperwork_files.eq.[])",
            },
            timeout=30,
        )
        if not r.ok:
            log(f"  Existing-closing lookup FAIL ({r.status_code}): {r.text[:200]}")
            return None
        rows = r.json() or []
    except Exception as e:
        log(f"  Existing-closing lookup exception: {e}")
        return None

    target = _normalize_street(address)
    if not target:
        return None
    target_tokens = [t for t in target.split(" ") if t]
    if not target_tokens:
        return None

    matches = []
    for row in rows:
        cand = _normalize_street(row.get("property_address"))
        if not cand:
            continue
        cand_tokens = cand.split(" ")
        # Partial match: either string contains the other, or they share the
        # house number + at least one street-name token.
        if target in cand or cand in target:
            matches.append(row)
            continue
        shared = set(target_tokens) & set(cand_tokens)
        # Require house number (first token, numeric) to match plus at least
        # one additional shared token.
        if target_tokens[0].isdigit() and cand_tokens and cand_tokens[0] == target_tokens[0] and len(shared) >= 2:
            matches.append(row)

    if len(matches) == 1:
        return matches[0]["id"]
    if len(matches) > 1:
        log(f"  Multiple existing closings matched '{address}' — skipping auto-merge, will insert new.")
    return None


def update_closing(access_token, closing_id, row):
    """PATCH an existing closing with parsed fields + paperwork_files."""
    # Preserve fields we should not overwrite on an existing row
    payload = {k: v for k, v in row.items() if k not in ("agent_id", "created_by", "status")}
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/closings",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        params={"id": f"eq.{closing_id}"},
        json=payload,
        timeout=30,
    )
    return r


# ---------------- Main flow ----------------
def process_email(access_token, agent_id, agent_name, email):
    address = email["address"]
    log(f"Email {email['message_id']}: {address}")

    if address_already_in_dropbox(address):
        log(f"  SKIP - found in Dropbox: {address}")
        return

    safe_dir_name = re.sub(r'[<>:"/\\|?*]+', "_", address).strip()
    target_dir = DROPBOX_FOLDER / safe_dir_name
    target_dir.mkdir(parents=True, exist_ok=True)
    log(f"  Created folder: {target_dir}")

    folder_id = str(uuid.uuid4())
    paperwork_files = []
    signed_urls = []

    for att in email["attachments"]:
        log(f"  Downloading: {att['filename']}")
        r = call_fn("get-gmail-attachment", access_token, {
            "message_id": email["message_id"],
            "attachment_id": att["attachment_id"],
        })
        if not r.ok:
            log(f"    FAIL: {r.status_code} {r.text[:200]}")
            continue
        b64 = r.json().get("data_base64", "")
        if not b64:
            continue
        pdf_bytes = base64.b64decode(b64)

        # Save to Dropbox
        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", att["filename"] or "document.pdf")
        if not safe_name.lower().endswith(".pdf"):
            safe_name += ".pdf"
        local_path = target_dir / safe_name
        local_path.write_bytes(pdf_bytes)
        log(f"    Saved to {local_path} ({len(pdf_bytes)} bytes)")

        # Upload to Supabase storage
        storage_path = f"{folder_id}/{int(time.time() * 1000)}-{safe_name}"
        up = storage_upload(access_token, "closing-paperwork", storage_path, pdf_bytes)
        if not up.ok:
            log(f"    Storage upload FAIL: {up.status_code} {up.text[:200]}")
            continue
        paperwork_files.append({
            "name": att["filename"] or safe_name,
            "path": storage_path,
            "size": len(pdf_bytes),
            "uploaded_at": datetime.utcnow().isoformat() + "Z",
            "scan_status": "complete",
        })
        try:
            signed_urls.append(storage_signed_url(access_token, "closing-paperwork", storage_path, 1800))
        except Exception as e:
            log(f"    Signed URL FAIL: {e}")

    if not paperwork_files:
        log("  No files saved, skipping closing creation.")
        return

    # Parse with AI - retry until we get usable data (queue gate)
    extracted = {}
    if signed_urls:
        required = ("city", "sale_price", "closing_date")
        backoffs = [0, 10, 30, 60, 120]  # 5 attempts total
        got_complete = False
        for attempt, wait_s in enumerate(backoffs, start=1):
            if wait_s:
                log(f"  Waiting {wait_s}s before parse retry {attempt}/{len(backoffs)}...")
                time.sleep(wait_s)
            log(f"  Parsing {len(signed_urls)} PDF(s) with AI (attempt {attempt}/{len(backoffs)})...")
            pr = call_fn("parse-closing-paperwork", access_token, {
                "signed_urls": signed_urls,
                "representation": "seller",
            })
            snippet = (pr.text or "")[:300].replace("\n", " ")
            log(f"    Parse HTTP {pr.status_code}: {snippet}")
            if pr.ok:
                extracted = pr.json().get("extracted", {}) or {}
                missing = [k for k in required if not extracted.get(k)]
                log(f"    Parsed fields: {list(extracted.keys())} | missing={missing}")
                if not missing:
                    got_complete = True
                    break
        if not got_complete:
            log("  All parse retries exhausted - proceeding with whatever was extracted.")

    # Build closing row
    closing_date_str = extracted.get("closing_date")
    try:
        if closing_date_str:
            datetime.strptime(closing_date_str, "%Y-%m-%d")
        else:
            closing_date_str = date.today().isoformat()
    except Exception:
        closing_date_str = date.today().isoformat()

    # Commission math — mirrors AddClosingForm.tsx exactly
    try:
        sale_price = float(extracted.get("sale_price") or 0)
    except Exception:
        sale_price = 0.0
    total_check = (max(sale_price * 0.01, 2250.0) + 499.0) if sale_price > 0 else 0.0
    admin_fee = 499.0
    company_split_pct = 40.0
    agent_split_pct = 60.0
    total_commission_net = total_check - admin_fee if total_check > 0 else 0.0
    company_share = total_commission_net * (company_split_pct / 100.0)
    agent_share = total_commission_net * (agent_split_pct / 100.0)

    # Caliber Title bonus detection
    title_company = (extracted.get("title_company") or "")
    caliber_detected = (
        extracted.get("caliber_title_detected") is True
        or bool(re.search(r"caliber", str(title_company), re.IGNORECASE))
    )

    # Paperwork checklist (merge AI-detected items with built_before_1978 flag)
    checklist_detected = extracted.get("checklist_detected") or {}
    if not isinstance(checklist_detected, dict):
        checklist_detected = {}
    paperwork_checklist = {**checklist_detected, "built_before_1978": bool(extracted.get("built_before_1978"))}

    # Representation — Compiled Paperwork emails are always seller-side
    representation = "seller"
    if extracted.get("listing_agent_name"):
        representation = "seller"
    elif extracted.get("buyer_agent_name") and not extracted.get("listing_agent_name"):
        representation = "buyer"

    # Prefer listing agent name from paperwork over the logged-in user
    row_agent_name = extracted.get("listing_agent_name") or agent_name

    row = {
        "agent_id": agent_id,
        "agent_name": row_agent_name,
        "created_by": agent_id,
        "property_address": extracted.get("property_address") or address,
        "city": extracted.get("city"),
        "state": extracted.get("state") or "OH",
        "zip": extracted.get("zip"),
        "closing_date": closing_date_str,
        "sale_price": sale_price,
        "total_commission": total_check,
        "admin_fee": admin_fee,
        "company_split_pct": company_split_pct,
        "agent_split_pct": agent_split_pct,
        "company_share": company_share,
        "agent_share": agent_share,
        "caliber_title_bonus": caliber_detected,
        "caliber_title_amount": 150,
        "representation": representation,
        "paperwork_checklist": paperwork_checklist,
        "paperwork_na": {},
        "status": "pending",
        "paperwork_files": paperwork_files,
        "paperwork_status": "received",
        "notes": f"Auto-imported from Gmail '{email['subject']}' on {datetime.now().date().isoformat()}",
    }
    # Drop None values so DB defaults apply
    row = {k: v for k, v in row.items() if v is not None}

    existing_id = find_existing_closing(access_token, agent_id, row["property_address"])
    if existing_id:
        cr = update_closing(access_token, existing_id, row)
        action = "updated existing"
    else:
        cr = insert_closing(access_token, row)
        action = "created new"
    if cr.ok:
        log(f"  Closing row {action} ({existing_id or 'insert'}).")
        with open(PRINT_LIST, "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat(timespec='seconds')}\t{address}\t{len(paperwork_files)} file(s)\n")
    else:
        log(f"  Closing {action} FAIL ({cr.status_code}): {cr.text[:400]}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--login", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="Process at most N emails (0 = no limit)")
    args = parser.parse_args()

    if args.login:
        login_interactive()
        return

    log("=== Sync run start ===")
    token = get_access_token()
    agent_id, agent_name = get_agent_info(token)
    log(f"Agent: {agent_name} ({agent_id})")

    r = call_fn("sync-compiled-paperwork-local", token, method="POST")
    if not r.ok:
        log(f"List FAIL: {r.status_code} {r.text[:500]}")
        sys.exit(1)
    emails = r.json().get("emails", [])
    log(f"Found {len(emails)} matching Gmail message(s).")
    if args.limit > 0 and len(emails) > args.limit:
        log(f"Limiting to first {args.limit} of {len(emails)} for this run.")
        emails = emails[:args.limit]

    for idx, email in enumerate(emails):
        if idx > 0:
            log("Pausing 5s before next closing in queue...")
            time.sleep(5)
        try:
            process_email(token, agent_id, agent_name, email)
        except Exception as e:
            log(f"  EXCEPTION: {e}")

    log("=== Sync run done ===")


if __name__ == "__main__":
    main()
