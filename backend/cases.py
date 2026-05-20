# backend/cases.py
from firebase_admin_setup import get_db
import PyPDF2
import docx
import io
from datetime import datetime


def extract_text_from_upload(file_bytes: bytes, filename: str) -> str:
    """Extracts text from uploaded file — supports PDF, DOCX, DOC, TXT, MD."""
    ext = filename.lower().split(".")[-1]

    if ext == "pdf":
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()

    elif ext in ("docx", "doc"):
        document = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in document.paragraphs if p.text.strip()).strip()

    else:
        return file_bytes.decode("utf-8", errors="ignore").strip()


def save_case(company_id: str, case_title: str, case_text: str,
              case_type: str, uploaded_by: str) -> str:
    db = get_db()
    doc_ref = db.collection("companies").document(company_id) \
                .collection("cases").document()
    doc_ref.set({
        "title":       case_title,
        "text":        case_text,
        "type":        case_type,
        "uploaded_by": uploaded_by,
        "uploaded_at": datetime.utcnow().isoformat(),
        "active":      True
    })
    return doc_ref.id


def save_rubric(company_id: str, rubric: dict, uploaded_by: str) -> None:
    db = get_db()
    db.collection("companies").document(company_id).set({
        "rubric":             rubric,
        "rubric_updated_by":  uploaded_by,
        "rubric_updated_at":  datetime.utcnow().isoformat()
    }, merge=True)


def get_company_rubric(company_id: str) -> dict:
    db = get_db()
    doc = db.collection("companies").document(company_id).get()
    if doc.exists:
        return doc.to_dict().get("rubric", {})
    return {}


def get_sample_cases(company_id: str, case_type: str = None, limit: int = 2) -> list:
    db = get_db()
    query = db.collection("companies").document(company_id) \
              .collection("cases").where("active", "==", True).limit(limit)
    if case_type:
        query = query.where("type", "==", case_type)
    return [doc.to_dict().get("text", "") for doc in query.stream()]


def list_companies() -> list:
    db = get_db()
    companies = []
    for doc in db.collection("companies").where("active", "==", True).stream():
        data = doc.to_dict()
        companies.append({
            "id":         doc.id,
            "name":       data.get("name", doc.id),
            "has_rubric": bool(data.get("rubric"))
        })
    return companies


def save_session(user_id: str, company_id: str, mode: str, role: str,
                 transcript: list, feedback_history: list,
                 overall_score: float) -> str:
    db = get_db()
    doc_ref = db.collection("users").document(user_id) \
                .collection("sessions").document()
    doc_ref.set({
        "company_id":       company_id,
        "mode":             mode,
        "role":             role,
        "transcript":       transcript,
        "feedback_history": feedback_history,
        "overall_score":    overall_score,
        "completed_at":     datetime.utcnow().isoformat()
    })
    return doc_ref.id


def get_user_sessions(user_id: str, limit: int = 10) -> list:
    db = get_db()
    docs = db.collection("users").document(user_id) \
             .collection("sessions") \
             .order_by("completed_at", direction="DESCENDING") \
             .limit(limit).stream()
    sessions = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        sessions.append(data)
    return sessions