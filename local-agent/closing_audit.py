"""
Deterministic closing-packet audit.

Implements the Closing Audit Spec:
  1. per-page text extraction WITH coordinates (pdfplumber)
  2. OCR any page whose text < 200 chars (pytesseract), cached by (sha256, page)
  3. classify each page -> document type (title + structural fingerprints)
  4. extract fields by coordinate matching (two-column aware)
  5. compare against the REQUIRED list for the detected side
  6. emit a JSON audit result

No model is used to decide whether a document is present. That decision lives
here, in code, so it is reproducible and defensible in an audit.

Optional dependencies (the module degrades gracefully if missing):
    pip install pdfplumber pytesseract pdf2image
Tesseract itself: https://github.com/UB-Mannheim/tesseract/wiki
"""

import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path

try:
    import pdfplumber
except Exception:  # pragma: no cover
    pdfplumber = None

try:
    import pytesseract
    from pdf2image import convert_from_path
except Exception:  # pragma: no cover
    pytesseract = None
    convert_from_path = None


# ---------------------------------------------------------------- constants

OCR_MIN_CHARS = 200          # below this a page is treated as unreadable
TITLE_MAX_LEN = 85           # a document title is a short line
TITLE_MIN_COVERAGE = 0.40    # the match must dominate the line
COLUMN_SPLIT_X = 292.0       # cover sheet: left = seller side, right = buyer
ROW_TOLERANCE = 9.0          # same visual row, in points

CACHE_DIR = Path(os.environ.get("APPDATA", str(Path.home()))) / "compiled-sync" / "ocr-cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Finding 4: forms constantly name other forms. If a line reads like a sentence
# it is prose referencing a document, not the document's own heading.
PROSE_MARKERS = re.compile(
    r"\b(has|have|had|is|are|was|were|shall|will|must|may|can|agrees?|agreed|"
    r"received?|receives|understands?|acknowledges?|pursuant|respect|accompany|"
    r"process|complete[ds]?|copy|email|if|whether|which|that|because|unless|"
    r"provide[ds]?|hereby|below|above|following)\b",
    re.IGNORECASE,
)

# doc_key -> (rule, [patterns])   rule is "title" or "structural"
FINGERPRINTS = {
    "consumer_guide": ("title", [r"CONSUMER GUIDE TO AGENCY RELATIONSHIP"]),
    "consumer_guide_cont": ("structural", [
        r"In the event that both the buyer and seller are represented",
        r"referred to as dual agency\. When a brokerage",
        r"We are pleased you have selected",
        r"religion, sex, familial status as defined in Section",
    ]),
    "agency_disclosure": ("title", [r"AGENCY DISCLOSURE STATEMENT"]),
    "purchase_contract": ("structural", [
        r"Columbus REALTORS.{0,90}page\s*\d+\s*of\s*1\d",
        r"page\s*\d+\s*of\s*1\d.{0,90}Columbus REALTORS",
        r"Propert?y\s*Address:?.{0,90}page\s*\d+\s*of\s*1\d",
        r"Premise Address:.{0,90}Coldwell Banker",
        r"Premises\s*Address:.{0,90}(page|Page)\s*\d+\s*of\s*\d+",
        r"Contract to Purchase.{0,40}PAGE\s*\d+\s*of",
        r"Residential Real Estate Purchase Contract",
        r"REAL ESTATE PURCHASE CONTRACT",
    ]),
    "residential_prop_disc": ("title", [
        r"RESIDENTIAL PROPERTY DISCLOSURE FORM",
        r"STATE OF OHIO.{0,20}DEPARTMENT OF COMMERCE",
        r"Ohio\s*\|\s*Department\s*\|\s*of Commerce",
    ]),
    "residential_prop_disc_cont": ("structural", [
        r"Do you know of any water or moisture",
        r"UNDERGROUND STORAGE TANKS",
        r"CERTIFICATION OF OWNER",
    ]),
    "rpd_exemption": ("title", [r"Residential Property Disclosure Exemption"]),
    "exclusive_right_sell": ("title", [r"EXCLUSIVE RIGHT TO SELL LISTING CONTRACT"]),
    "buyer_rep_agreement": ("title", [
        r"BUYER REPRESENTATION AGREEMENT",
        r"EXCLUSIVE RIGHT TO BUY",
        r"Non-Exclusive Buyer Representation Agreement",
    ]),
    "buyer_broker_comp": ("title", [r"Buyer Broker Compensation Agreement"]),
    "lead_based_paint": ("title", [
        r"Disclosure of Information on Lead.{0,3}Based Paint",
        r"Lead Warning Statement",
    ]),
    "aba_disclosure": ("title", [r"AFFILIATED BUSINESS ARRANGEMENT"]),
    "settlement_statement": ("title", [
        r"(FINAL\s+)?ALTA[\w'\- ]{0,14}Settlement Statement[\w'\-/ ]{0,22}",
        r"CLOSING DISCLOSURE",
        r"HUD-1",
        r"ALTA Universal ?I?[DO]",
        r"[\w'\- ]{0,14}Settlement Statement[\w'\-/ ]{0,14}",
    ]),
    "settlement_statement_body": ("structural", [
        r"Disbursement\s*Date",
        r"Settlement\s*Location",
        r"Officer\s*/\s*Escrow\s*Officer",
    ]),
    "counter_offer": ("title", [r"COUNTER OFFER"]),
    "contract_amendment": ("title", [
        r"AMENDMENT\s*/\s*ADDENDUM TO PURCHASE CONTRACT",
        r"ADDENDUM TO REAL ESTATE PURCHASE CONTRACT",
        r"AMENDMENT TO PURCHASE AGREEMENT",
        r"HOME INSPECTION CONTINGENCY",
    ]),
    "request_to_remedy": ("title", [r"BUYER.{0,3}S REQUEST TO REMEDY", r"^\s*REQUEST TO REMEDY"]),
    "sellers_response": ("title", [r"SELLER.{0,3}S RESPONSE TO"]),
    "home_inspection": ("title", [
        r"Inspection made", r"INSPECTION REPORT", r"HOME INSPECTION",
        r"Inspection Waiver", r"WAIVER OF INSPECTION",
    ]),
    "title_commitment": ("title", [r"Commitment for Title Insurance", r"ALTA COMMITMENT"]),
    "title_posting_summary": ("title", [r"POSTING SUMMARY"]),
    "audio_video_disc": ("title", [r"Audio.{0,3}Video (Disclosure|Surveillance)"]),
    "seller_disc_addendum": ("title", [r"Seller Disclosure Addendum"]),
    "anti_fraud": ("title", [r"Anti-Fraud Disclosure Statement"]),
    "deposit_notice": ("title", [r"DEPOSIT NOTICE"]),
    "transaction_timeline": ("title", [r"TRANSACTION TIME ?LINE"]),
    "closing_procedure": ("title", [r"Closing Procedure"]),
}

# *_cont keys satisfy their parent document
CONTINUATION_PARENT = {
    "consumer_guide_cont": "consumer_guide",
    "residential_prop_disc_cont": "residential_prop_disc",
    "settlement_statement_body": "settlement_statement",
}

# OCR garbles wordmarks
CALIBER_RE = re.compile(r"Cal+[il1]?b?er\s*T[il1]t\w*e|CALIBER", re.IGNORECASE)

# Maps deterministic doc keys onto the 9 UI checklist keys used by the app.
UI_KEY_MAP = {
    "consumer_guide": "consumer_guide",
    "agency_disclosure": "agency_disclosure",
    "purchase_contract": "signed_contract",
    "exclusive_right_sell": "representation_agreement",
    "buyer_rep_agreement": "representation_agreement",
    "residential_prop_disc": "residential_property_disclosure",
    "rpd_exemption": "residential_property_disclosure",
    "lead_based_paint": "lead_based_paint_disclosure",
    "aba_disclosure": "affiliated_business_arrangement",
    "home_inspection": "home_inspection",
    "settlement_statement": "settlement_statement",
}


# ---------------------------------------------------------------- extraction

def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _cache_path(file_hash, page_no):
    return CACHE_DIR / f"{file_hash}-{page_no}.txt"


def _ocr_page(pdf_path, page_no, file_hash, logger):
    """Transcribe one page image. Cached by (file_sha256, page_number)."""
    cached = _cache_path(file_hash, page_no)
    if cached.exists():
        return cached.read_text(encoding="utf-8"), True
    if pytesseract is None or convert_from_path is None:
        return "", False
    try:
        images = convert_from_path(str(pdf_path), dpi=200,
                                   first_page=page_no, last_page=page_no)
        if not images:
            return "", False
        text = pytesseract.image_to_string(images[0]) or ""
    except Exception as e:
        if logger:
            logger(f"    OCR failed on page {page_no}: {e}")
        return "", False
    cached.write_text(text, encoding="utf-8")
    return text, False


def extract_pages(pdf_path, logger=None):
    """Return a list of page dicts: {no, lines, words, ocr, readable}."""
    if pdfplumber is None:
        raise RuntimeError("pdfplumber is not installed (pip install pdfplumber)")

    file_hash = _sha256(pdf_path)
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            raw = page.extract_text() or ""
            words = []
            if len(raw.strip()) >= OCR_MIN_CHARS:
                for w in page.extract_words(use_text_flow=False, keep_blank_chars=False):
                    words.append({
                        "text": w["text"],
                        "x": float(w["x0"]),
                        "y": float((w["top"] + w["bottom"]) / 2.0),
                    })
                ocr = False
            else:
                # Finding 3: ~23% of pages carry no usable text layer.
                raw, _ = _ocr_page(pdf_path, idx, file_hash, logger)
                ocr = True
            lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
            pages.append({
                "no": idx,
                "text": raw,
                "lines": lines,
                "words": words,
                "ocr": ocr,
                # Finding 5: never call a page "missing a document" if we could not read it.
                "readable": len(raw.strip()) >= OCR_MIN_CHARS,
            })
    return pages


# ------------------------------------------------------------ classification

def _is_title_match(line, pattern):
    if len(line) > TITLE_MAX_LEN:
        return False
    m = re.search(pattern, line, re.IGNORECASE)
    if not m:
        return False
    if len(m.group(0)) < TITLE_MIN_COVERAGE * max(len(line), 1):
        return False
    if PROSE_MARKERS.search(line):
        return False
    return True


def classify_page(page):
    """Return the set of document keys this page identifies as."""
    head_n = 14 if page["ocr"] else 6
    head_lines = page["lines"][:head_n]
    header_blob = " | ".join(page["lines"][:10])
    found = set()

    for key, (rule, patterns) in FINGERPRINTS.items():
        if rule == "title":
            for line in head_lines:
                if any(_is_title_match(line, p) for p in patterns):
                    found.add(key)
                    break
        else:  # structural
            if any(re.search(p, header_blob, re.IGNORECASE) for p in patterns):
                found.add(key)
    return found


# --------------------------------------------------- coordinate field lookup

def _value_right_of(page, label_regex, column=None):
    """
    Find the value printed on the same visual row as a label.
    column: None | "left" (x < 292, seller side) | "right" (x >= 292, buyer side)
    Finding 2: reading order swaps buyer and seller — geometry does not.
    """
    words = page.get("words") or []
    if not words:
        return None
    rx = re.compile(label_regex, re.IGNORECASE)

    # Rebuild rows so a multi-word label can be located.
    rows = {}
    for w in words:
        rows.setdefault(round(w["y"] / ROW_TOLERANCE), []).append(w)

    for _, row_words in sorted(rows.items()):
        row_words.sort(key=lambda w: w["x"])
        joined = " ".join(w["text"] for w in row_words)
        m = rx.search(joined)
        if not m:
            continue
        # locate the x where the label ends
        consumed, label_end_x = 0, None
        for w in row_words:
            consumed += len(w["text"]) + 1
            if consumed >= m.end():
                label_end_x = w["x"] + 1
                break
        if label_end_x is None:
            continue
        tail = [w for w in row_words if w["x"] > label_end_x]
        if column == "left":
            tail = [w for w in tail if w["x"] < COLUMN_SPLIT_X]
        elif column == "right":
            tail = [w for w in tail if w["x"] >= COLUMN_SPLIT_X]
        value = " ".join(w["text"] for w in tail).strip(" :_-")
        value = re.sub(r"_+", "", value).strip()
        if value:
            return value
    return None


def extract_fields(pages, classified):
    """Coordinate-matched fields. Returns a dict of whatever could be found."""
    out = {}
    settlement_pages = [
        p for p in pages
        if classified.get(p["no"], set()) & {"settlement_statement", "settlement_statement_body"}
    ]
    contract_pages = [p for p in pages if "purchase_contract" in classified.get(p["no"], set())]

    # Closing date priority: settlement date > contract 15.1 > cover sheet
    for p in settlement_pages:
        v = _value_right_of(p, r"Settlement\s*Date") or _value_right_of(p, r"Disbursement\s*Date")
        if v:
            out["closing_date_raw"] = v
            out["closing_date_source"] = "settlement statement"
            break
    if "closing_date_raw" not in out:
        for p in contract_pages:
            v = _value_right_of(p, r"closed,?\s*on or before")
            if v:
                out["closing_date_raw"] = v
                out["closing_date_source"] = "contract 15.1"
                break
    if "closing_date_raw" not in out and pages:
        v = _value_right_of(pages[0], r"Closing\s*Date")
        if v:
            out["closing_date_raw"] = v
            out["closing_date_source"] = "cover sheet"

    # Cover-sheet two-column agent names (left = seller side, right = buyer side)
    if pages:
        cover = pages[0]
        out["listing_agent"] = _value_right_of(cover, r"Seller.{0,3}s?\s*Agent", column="left")
        out["buyer_agent"] = _value_right_of(cover, r"Buyer.{0,3}s?\s*Agent", column="right")
        out["property_address"] = _value_right_of(cover, r"Propert?y\s*Address")
        out["sale_price_raw"] = _value_right_of(cover, r"(Sale|Purchase)\s*Price")

    # Address fallback when there is no cover sheet
    if not out.get("property_address"):
        for p in pages:
            v = _value_right_of(p, r"Propert?y\s*Address")
            if v:
                out["property_address"] = v
                break

    # Caliber must appear ON the settlement statement to trigger the ABA rule
    out["caliber_on_settlement"] = any(CALIBER_RE.search(p["text"] or "") for p in settlement_pages)

    return {k: v for k, v in out.items() if v not in (None, "")}


def _parse_date(raw):
    if not raw:
        return None
    raw = raw.strip()
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y", "%Y-%m-%d", "%m-%d-%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except Exception:
            continue
    m = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", raw)
    if m:
        mm, dd, yy = m.groups()
        yy = ("20" + yy) if len(yy) == 2 else yy
        try:
            return datetime(int(yy), int(mm), int(dd)).date().isoformat()
        except Exception:
            return None
    return None


def _parse_money(raw):
    if not raw:
        return None
    m = re.search(r"[\d,]+(?:\.\d{2})?", str(raw))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except Exception:
        return None


# ------------------------------------------------------------- requirements

def determine_side(doc_pages):
    has_listing = bool(doc_pages.get("exclusive_right_sell"))
    has_buyer_rep = bool(doc_pages.get("buyer_rep_agreement"))
    if has_listing and not has_buyer_rep:
        return "seller_side"
    if has_buyer_rep and not has_listing:
        return "buyer_side"
    return "unknown"


def required_documents(side, caliber_on_settlement):
    req = [
        "consumer_guide",
        "agency_disclosure",
        "purchase_contract",
        "residential_prop_disc",   # always, both sides
        "settlement_statement",    # always, both sides
    ]
    if side == "seller_side":
        req.append("exclusive_right_sell")
    elif side == "buyer_side":
        req.append("buyer_rep_agreement")
    # ABA: seller side AND Caliber on the settlement statement only.
    if side == "seller_side" and caliber_on_settlement:
        req.append("aba_disclosure")
    return req


# ------------------------------------------------------------------- driver

def audit_packet(pdf_paths, cover_checklist=None, logger=None):
    """
    Audit one closing packet (one or more PDFs treated as a single packet).
    Returns the spec's JSON structure plus UI-ready checklist maps.
    """
    log = logger or (lambda m: None)

    all_pages = []
    offset = 0
    for path in pdf_paths:
        try:
            pages = extract_pages(path, logger=log)
        except Exception as e:
            log(f"  Audit: could not read {Path(path).name}: {e}")
            continue
        for p in pages:
            p["no"] += offset
            p["file"] = Path(path).name
        offset += len(pages)
        all_pages.extend(pages)

    if not all_pages:
        return None

    classified = {}
    doc_pages = {}
    for p in all_pages:
        keys = classify_page(p)
        classified[p["no"]] = keys
        for k in keys:
            parent = CONTINUATION_PARENT.get(k, k)
            doc_pages.setdefault(parent, []).append(p["no"])
            if parent != k:
                doc_pages.setdefault(k, []).append(p["no"])

    fields = extract_fields(all_pages, classified)
    side = determine_side(doc_pages)
    caliber = bool(fields.get("caliber_on_settlement"))
    required = required_documents(side, caliber)

    unreadable = [p["no"] for p in all_pages if not p["readable"]]
    fully_readable = not unreadable

    missing, unverifiable = [], []
    for key in required:
        if doc_pages.get(key):
            continue
        # Never report "missing" when part of the packet could not be read.
        (missing if fully_readable else unverifiable).append(key)

    # Lead-based paint: build year is not in these packets.
    undetermined = []
    if doc_pages.get("lead_based_paint"):
        pass
    else:
        undetermined.append("lead_based_paint")

    # Grade the cover sheet rather than trusting it (finding 1).
    cover_sheet_wrong = []
    if isinstance(cover_checklist, dict):
        for ui_key, ticked in cover_checklist.items():
            actual = any(
                doc_pages.get(dk) for dk, uk in UI_KEY_MAP.items() if uk == ui_key
            )
            if bool(ticked) != bool(actual):
                cover_sheet_wrong.append({
                    "doc": ui_key,
                    "cover_says": "present" if ticked else "absent",
                    "actually": "found" if actual else "not found",
                })

    # ---- UI-ready maps (the 9 keys the app's checklist renders) ----
    ui_checklist, ui_unverified, ui_evidence = {}, {}, {}
    for doc_key, ui_key in UI_KEY_MAP.items():
        pgs = doc_pages.get(doc_key) or []
        if pgs:
            ui_checklist[ui_key] = True
            ui_evidence.setdefault(ui_key, [])
            ui_evidence[ui_key] = sorted(set(ui_evidence[ui_key] + pgs))
    for ui_key in set(UI_KEY_MAP.values()):
        if not ui_checklist.get(ui_key) and not fully_readable:
            ui_unverified[ui_key] = True
    if not doc_pages.get("lead_based_paint"):
        ui_unverified["lead_based_paint_disclosure"] = True

    result = {
        "audited_at": datetime.utcnow().isoformat() + "Z",
        "property_address": fields.get("property_address"),
        "closing_date": _parse_date(fields.get("closing_date_raw")),
        "closing_date_source": fields.get("closing_date_source"),
        "side": side,
        "sale_price": _parse_money(fields.get("sale_price_raw")),
        "listing_agent": fields.get("listing_agent"),
        "buyer_agent": fields.get("buyer_agent"),
        "caliber_on_settlement": caliber,
        "pages": len(all_pages),
        "unreadable_pages": unreadable,
        "ocr_used": any(p["ocr"] for p in all_pages),
        "documents_found": {k: sorted(set(v)) for k, v in doc_pages.items()},
        "required": required,
        "missing_required": missing,
        "unverifiable": unverifiable,
        "undetermined": undetermined,
        "cover_sheet_wrong": cover_sheet_wrong,
        "ui_checklist": ui_checklist,
        "ui_unverified": ui_unverified,
        "ui_evidence": ui_evidence,
    }
    return result


def sanity_warnings(results):
    """Corpus-level checks. A broken fingerprint looks like mass absence."""
    warnings = []
    n = len(results)
    if n >= 10:
        no_contract = sum(1 for r in results if "purchase_contract" in (r.get("missing_required") or []))
        if no_contract / n > 0.20:
            warnings.append(
                f"{no_contract}/{n} packets missing a purchase contract — "
                "the fingerprint is probably broken, not the files."
            )
    return warnings


if __name__ == "__main__":
    import sys
    out = audit_packet(sys.argv[1:], logger=print)
    print(json.dumps(out, indent=2))
