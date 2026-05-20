#!/usr/bin/env python3
# training/train.py
"""
Admin script — reads a company's training folder and registers it in Firestore.

HOW IT WORKS:
  1. Reads all files from training/<company>/sample_cases/
     Accepts: .pdf  .doc  .docx  .txt  .md
  2. Reads all files from training/<company>/assessment_rubric/
     Accepts: .pdf  .doc  .docx  .txt  .md
     If rubric files found  → Groq parses them into structured JSON
     If no rubric files     → Groq generates a rubric from its knowledge of the company
  3. Uploads everything to Firestore
  4. Company becomes visible to all frontend users immediately

USAGE:
  # Dry run — preview without writing
  python train.py --company capital_one --name "Capital One" --dry-run

  # Register Capital One
  python train.py --company capital_one --name "Capital One"

  # Re-upload after adding new cases (deletes old cases first)
  python train.py --company capital_one --name "Capital One" --reset

  # Add McKinsey when ready (no rubric file needed — auto-generated)
  python train.py --company mckinsey --name "McKinsey & Company"

REQUIREMENTS:
  pip install firebase-admin PyPDF2 python-docx groq

ENVIRONMENT:
  Set FIREBASE_SERVICE_ACCOUNT_JSON (paste full JSON)
  Set GROQ_API_KEY
  Or pass --key path/to/firebase-service-account.json
"""

import argparse
import json
import os
import sys
from pathlib import Path

# ── CLI ───────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Register a company's training data into Firestore")
parser.add_argument("--company",  required=True, help="Folder name (e.g. capital_one)")
parser.add_argument("--name",     required=True, help="Display name (e.g. 'Capital One')")
parser.add_argument("--key",      default=None,  help="Path to Firebase service account JSON")
parser.add_argument("--dry-run",  action="store_true", help="Preview without writing to Firestore")
parser.add_argument("--reset",    action="store_true", help="Delete existing cases before uploading")
args = parser.parse_args()

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR  = Path(__file__).parent
COMPANY_DIR = SCRIPT_DIR / args.company
CASES_DIR   = COMPANY_DIR / "sample_cases"
RUBRIC_DIR  = COMPANY_DIR / "assessment_rubric"

SUPPORTED_CASE_EXTS   = {".pdf", ".doc", ".docx", ".txt", ".md"}
SUPPORTED_RUBRIC_EXTS = {".pdf", ".doc", ".docx", ".txt", ".md"}

if not COMPANY_DIR.exists():
    print(f"\nERROR: Folder not found: {COMPANY_DIR}")
    print(f"Create: training/{args.company}/sample_cases/ and assessment_rubric/")
    sys.exit(1)


# ── Text extraction ───────────────────────────────────────────────────────────

def extract_pdf(path: Path) -> str:
    import PyPDF2
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def extract_docx(path: Path) -> str:
    import docx
    doc = docx.Document(path)
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()


def extract_text(path: Path) -> str:
    """Dispatches to the right extractor based on file extension."""
    ext = path.suffix.lower()
    if ext == ".pdf":
        return extract_pdf(path)
    elif ext in {".doc", ".docx"}:
        return extract_docx(path)
    else:
        return path.read_text(encoding="utf-8", errors="ignore").strip()


def infer_case_type(filename: str) -> str:
    name = filename.lower()
    if any(k in name for k in ["revenue", "decline", "drop", "profit"]):   return "revenue_decline"
    if any(k in name for k in ["market", "entry", "expand", "launch"]):     return "market_entry"
    if any(k in name for k in ["pric", "fee", "monetiz", "activation"]):    return "pricing"
    if any(k in name for k in ["growth", "share", "scale", "expand"]):      return "growth"
    if any(k in name for k in ["cost", "reduc", "effic", "optim"]):         return "cost_reduction"
    if any(k in name for k in ["ma", "merger", "acqui", "due", "m&a"]):     return "ma"
    return "other"


# ── Groq helpers ──────────────────────────────────────────────────────────────

def get_groq_client():
    from groq import Groq
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("ERROR: GROQ_API_KEY not set. Run: export GROQ_API_KEY=your_key")
        sys.exit(1)
    return Groq(api_key=api_key)


def parse_rubric_from_text(raw_text: str, company_name: str) -> dict:
    """
    Sends extracted rubric text to Groq and asks it to structure it as JSON.
    The LLM respects the source material — it does not invent dimensions.
    """
    client = get_groq_client()

    prompt = f"""
You are a case interview expert. Below is raw text extracted from a rubric document 
for {company_name} case interviews.

Convert this rubric into a structured JSON object where:
- Each key is a short dimension name (snake_case, no spaces)
- Each value is an object with these fields:
  "description": what this dimension evaluates (1-2 sentences from the source),
  "weight": "high" | "medium" | "low" (your judgment based on emphasis in the source),
  "analyst_expectation": what an Analyst-level candidate should demonstrate,
  "manager_expectation": what a Manager-level candidate should demonstrate,
  "executive_expectation": what an Executive-level candidate should demonstrate

SOURCE RUBRIC TEXT:
{raw_text[:4000]}

Return ONLY valid JSON. No preamble. No markdown fences.
Preserve the intent and language of the original source material.
Do not invent dimensions that are not represented in the source.
"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
        temperature=0.1
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def generate_rubric_from_knowledge(company_name: str) -> dict:
    """
    No rubric files provided — uses Groq's training knowledge of the company
    to generate the most accurate rubric available.
    Prints a clear notice that this was auto-generated.
    """
    print(f"\n  No rubric files found in assessment_rubric/")
    print(f"  Generating rubric from Groq's knowledge of {company_name} interviews...")

    client = get_groq_client()

    prompt = f"""
You are a case interview expert with deep knowledge of {company_name}'s interview process.

Based on your knowledge of how {company_name} evaluates candidates in case interviews,
create a detailed evaluation rubric as a JSON object where:
- Each key is a short dimension name (snake_case)
- Each value is an object with:
  "description": what this dimension evaluates (1-2 sentences, specific to {company_name}),
  "weight": "high" | "medium" | "low",
  "analyst_expectation": what an Analyst-level candidate should demonstrate at {company_name},
  "manager_expectation": what a Manager-level candidate should demonstrate at {company_name},
  "executive_expectation": what an Executive-level candidate should demonstrate at {company_name}

Important: Make this specific to {company_name}'s known interview style, values, and evaluation criteria.
For example, if {company_name} is known for quantitative rigor, weight that dimension "high".
If they emphasize hypothesis-driven thinking like McKinsey, reflect that.

Return ONLY valid JSON. No preamble. No markdown fences. 5-7 dimensions.
"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
        temperature=0.2
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    rubric = json.loads(raw.strip())
    print(f"  ✓ Auto-generated rubric with {len(rubric)} dimensions")
    print(f"    Dimensions: {', '.join(rubric.keys())}")
    print(f"  NOTE: Review this rubric and replace with your own file when ready.")
    print(f"        Drop a rubric file in training/{args.company}/assessment_rubric/ and re-run.\n")
    return rubric


# ── Firebase ──────────────────────────────────────────────────────────────────

def init_firebase():
    import firebase_admin
    from firebase_admin import credentials, firestore

    if args.key:
        cred = credentials.Certificate(args.key)
    else:
        sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not sa_json:
            print("\nERROR: Set FIREBASE_SERVICE_ACCOUNT_JSON or pass --key path/to/key.json")
            print("  export FIREBASE_SERVICE_ACCOUNT_JSON='$(cat firebase-service-account.json)'")
            sys.exit(1)
        cred = credentials.Certificate(json.loads(sa_json))

    firebase_admin.initialize_app(cred)
    return firestore.client()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Registering: {args.name} ({args.company})")
    print("=" * 60)

    # ── Step 1: Scan and extract rubric ──────────────────────────────────────
    print("\n[1/3] Processing rubric...")
    rubric_files = []
    if RUBRIC_DIR.exists():
        for ext in SUPPORTED_RUBRIC_EXTS:
            rubric_files.extend(RUBRIC_DIR.glob(f"*{ext}"))
        rubric_files = [f for f in rubric_files if f.name != ".gitkeep"]

    if rubric_files:
        print(f"  Found {len(rubric_files)} rubric file(s): {[f.name for f in rubric_files]}")
        all_rubric_text = []
        for f in rubric_files:
            try:
                text = extract_text(f)
                if len(text) > 50:
                    all_rubric_text.append(f"--- From {f.name} ---\n{text}")
                    print(f"  ✓ Extracted {len(text)} chars from {f.name}")
            except Exception as e:
                print(f"  SKIP {f.name}: {e}")

        if all_rubric_text:
            combined = "\n\n".join(all_rubric_text)
            if not args.dry_run:
                rubric = parse_rubric_from_text(combined, args.name)
            else:
                rubric = {"dry_run": {"description": "Would parse from files", "weight": "high",
                                       "analyst_expectation": "...", "manager_expectation": "...",
                                       "executive_expectation": "..."}}
            print(f"  ✓ Rubric parsed — {len(rubric)} dimensions: {', '.join(rubric.keys())}")
        else:
            rubric = {} if args.dry_run else generate_rubric_from_knowledge(args.name)
    else:
        rubric = {} if args.dry_run else generate_rubric_from_knowledge(args.name)

    # ── Step 2: Scan case files ───────────────────────────────────────────────
    print("\n[2/3] Scanning case files...")
    case_files = []
    if CASES_DIR.exists():
        for ext in SUPPORTED_CASE_EXTS:
            case_files.extend(CASES_DIR.glob(f"*{ext}"))
        case_files = [f for f in case_files if f.name != ".gitkeep"]

    print(f"  Found {len(case_files)} case file(s):")
    for f in case_files:
        print(f"   - {f.name}  →  type: {infer_case_type(f.name)}")

    if args.dry_run:
        print(f"\n[DRY RUN COMPLETE]")
        print(f"  Would register: {args.name}")
        print(f"  Would upload: {len(case_files)} case(s) and {len(rubric)} rubric dimension(s)")
        print(f"\nRun without --dry-run to write to Firestore.")
        return

    # ── Step 3: Write to Firestore ────────────────────────────────────────────
    print("\n[3/3] Writing to Firestore...")
    from firebase_admin import firestore as fs

    db = init_firebase()
    company_ref = db.collection("companies").document(args.company)

    if args.reset:
        print("  Deleting existing cases...")
        for doc in company_ref.collection("cases").stream():
            doc.reference.delete()
        print("  ✓ Existing cases deleted")

    company_ref.set({
        "name":            args.name,
        "company_id":      args.company,
        "rubric":          rubric,
        "active":          True,
        "registered_at":   fs.SERVER_TIMESTAMP
    }, merge=True)
    print(f"  ✓ Company '{args.name}' registered")

    uploaded = 0
    for filepath in case_files:
        try:
            text = extract_text(filepath)
            if len(text) < 50:
                print(f"  SKIP {filepath.name} — too short after extraction")
                continue

            doc_ref = company_ref.collection("cases").document()
            doc_ref.set({
                "title":       filepath.stem.replace("_", " ").title(),
                "text":        text,
                "type":        infer_case_type(filepath.name),
                "filename":    filepath.name,
                "active":      True,
                "uploaded_at": fs.SERVER_TIMESTAMP
            })
            print(f"  ✓ {filepath.name}  →  {infer_case_type(filepath.name)}")
            uploaded += 1
        except Exception as e:
            print(f"  ERROR {filepath.name}: {e}")

    print(f"\n{'='*60}")
    print(f"Done.")
    print(f"  Company:    {args.name}")
    print(f"  Cases:      {uploaded} uploaded")
    print(f"  Rubric:     {len(rubric)} dimensions")
    print(f"\n'{args.name}' is now available to all frontend users.")
    print(f"\nTo add another company later:")
    print(f"  mkdir -p training/<id>/sample_cases training/<id>/assessment_rubric")
    print(f"  python train.py --company <id> --name '<Name>'")


if __name__ == "__main__":
    main()