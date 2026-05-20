# backend/main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
import asyncio
import json

from firebase_admin_setup import initialize_firebase, verify_token, is_admin, get_db
from cases import (
    extract_text_from_upload, save_case, save_rubric,
    get_company_rubric, get_sample_cases, list_companies,
    save_session, get_user_sessions
)
from stt import transcribe
from tts import synthesize
from llm import (
    get_interviewer_response, get_candidate_response, get_feedback,
    solve_and_rate_case, simulate_vp_interview, get_sample_test_feedback
)
from prompts import SAMPLE_TEST_QUESTION

initialize_firebase()

app = FastAPI(title="CaseGym API v4")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "4.0"}


# ── Auth ──────────────────────────────────────────────────────────────────────

class TokenRequest(BaseModel):
    id_token: str

@app.post("/api/auth/verify")
def verify_user(req: TokenRequest):
    decoded = verify_token(req.id_token)
    return {
        "uid":      decoded["uid"],
        "email":    decoded.get("email"),
        "name":     decoded.get("name"),
        "is_admin": is_admin(decoded.get("email", ""))
    }


# ── Companies ─────────────────────────────────────────────────────────────────

@app.get("/api/companies")
def get_companies():
    return list_companies()


# ── Sample test ───────────────────────────────────────────────────────────────

@app.get("/api/sample-test/question")
def sample_question():
    return {
        "question": SAMPLE_TEST_QUESTION["question"],
        "options":  SAMPLE_TEST_QUESTION["options"]
    }

class SampleTestRequest(BaseModel):
    answer_text: str
    id_token: str

@app.post("/api/sample-test/evaluate")
def evaluate_sample(req: SampleTestRequest):
    verify_token(req.id_token)
    return get_sample_test_feedback(req.answer_text)


# ── Admin endpoints ───────────────────────────────────────────────────────────

@app.post("/api/admin/upload-case")
async def upload_case(
    company_id:   str = Form(...),
    company_name: str = Form(...),
    case_title:   str = Form(...),
    case_type:    str = Form(...),
    authorization: str = Form(...),
    file:         UploadFile = File(None),
    case_text:    str = Form(None)
):
    token = authorization.replace("Bearer ", "")
    user  = verify_token(token)
    if not is_admin(user.get("email", "")):
        raise HTTPException(status_code=403, detail="Admin access required")

    if file:
        content = await file.read()
        text = extract_text_from_upload(content, file.filename)
    elif case_text:
        text = case_text
    else:
        raise HTTPException(status_code=400, detail="Provide a file or case_text")

    db = get_db()
    db.collection("companies").document(company_id).set({"name": company_name}, merge=True)
    case_id = save_case(company_id, case_title, text, case_type, user["email"])
    return {"case_id": case_id, "message": f"Case '{case_title}' uploaded"}


@app.post("/api/admin/upload-rubric")
async def upload_rubric_endpoint(
    company_id:   str = Form(...),
    company_name: str = Form(...),
    authorization: str = Form(...),
    rubric_json:  str = Form(...)
):
    token = authorization.replace("Bearer ", "")
    user  = verify_token(token)
    if not is_admin(user.get("email", "")):
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        rubric = json.loads(rubric_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="rubric_json must be valid JSON")

    db = get_db()
    db.collection("companies").document(company_id).set({"name": company_name}, merge=True)
    save_rubric(company_id, rubric, user["email"])
    return {"message": f"Rubric for '{company_name}' saved"}


# ── Feedback ──────────────────────────────────────────────────────────────────

class FeedbackRequest(BaseModel):
    candidate_response: str
    company_id:         str
    case_context:       str
    role:               str = "analyst"
    id_token:           str

@app.post("/api/feedback")
def feedback(req: FeedbackRequest):
    verify_token(req.id_token)
    db   = get_db()
    doc  = db.collection("companies").document(req.company_id).get()
    name = doc.to_dict().get("name", req.company_id) if doc.exists else req.company_id
    rubric = get_company_rubric(req.company_id)
    return get_feedback(req.candidate_response, name, req.case_context, rubric, req.role)


# ── WebSocket conversation ────────────────────────────────────────────────────

@app.websocket("/ws/conversation")
async def conversation_ws(websocket: WebSocket):
    await websocket.accept()
    history = []

    try:
        init = await websocket.receive_json()
        verify_token(init.get("id_token", ""))

        company_id        = init.get("company_id", "capital_one")
        case_context      = init.get("case_context", "")
        practice_mode     = init.get("practice_mode", "untimed")
        role              = init.get("role", "analyst")
        conversation_mode = init.get("conversation_mode", "candidate")

        db          = get_db()
        company_doc = db.collection("companies").document(company_id).get()
        company_name = company_doc.to_dict().get("name", company_id) if company_doc.exists else company_id
        sample_cases = get_sample_cases(company_id, limit=2)

        loop = asyncio.get_event_loop()

        opening = get_interviewer_response([], company_name, case_context,
                                           sample_cases, practice_mode, role)
        history.append({"role": "assistant", "content": opening})
        audio = await loop.run_in_executor(None, synthesize, opening)
        await websocket.send_json({"type": "interviewer_message", "text": opening})
        if audio:
            await websocket.send_bytes(audio)

        while True:
            raw = await websocket.receive()

            if "text" in raw:
                data = json.loads(raw["text"])
                if data.get("type") == "end_session":
                    break
                continue

            audio_input = raw["bytes"]
            await websocket.send_json({"type": "status", "text": "Transcribing..."})
            transcript = await loop.run_in_executor(None, transcribe, audio_input)

            if not transcript:
                await websocket.send_json({"type": "status", "text": "Didn't catch that. Please try again."})
                continue

            await websocket.send_json({"type": "user_transcript", "text": transcript})
            history.append({"role": "user", "content": transcript})

            await websocket.send_json({"type": "status", "text": "Thinking..."})

            if conversation_mode == "candidate":
                reply = await loop.run_in_executor(
                    None, get_interviewer_response,
                    history, company_name, case_context, sample_cases, practice_mode, role
                )
                msg_type = "interviewer_message"
            else:
                reply = await loop.run_in_executor(
                    None, get_candidate_response,
                    history, company_name, case_context, role
                )
                msg_type = "candidate_message"

            history.append({"role": "assistant", "content": reply})
            audio_reply = await loop.run_in_executor(None, synthesize, reply)

            await websocket.send_json({"type": msg_type, "text": reply})
            if audio_reply:
                await websocket.send_bytes(audio_reply)
            await websocket.send_json({"type": "turn_complete", "user_response": transcript})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "text": str(e)})
        except:
            pass


# ── Solve (Evaluate mode) ─────────────────────────────────────────────────────

class SolveRequest(BaseModel):
    case_text:  str
    company_id: str
    role:       str = "analyst"
    id_token:   str

@app.post("/api/solve")
def solve(req: SolveRequest):
    verify_token(req.id_token)
    db   = get_db()
    doc  = db.collection("companies").document(req.company_id).get()
    name = doc.to_dict().get("name", req.company_id) if doc.exists else req.company_id
    rubric       = get_company_rubric(req.company_id)
    sample_cases = get_sample_cases(req.company_id, limit=2)
    result = solve_and_rate_case(req.case_text, name, rubric, sample_cases, req.role)
    if not result:
        raise HTTPException(status_code=500, detail="LLM returned empty result. Try again.")
    return result


# ── Simulate ──────────────────────────────────────────────────────────────────

class SimulateRequest(BaseModel):
    case_text:  str
    company_id: str
    role:       str = "analyst"
    id_token:   str

@app.post("/api/simulate")
def simulate(req: SimulateRequest):
    verify_token(req.id_token)
    db   = get_db()
    doc  = db.collection("companies").document(req.company_id).get()
    name = doc.to_dict().get("name", req.company_id) if doc.exists else req.company_id
    rubric       = get_company_rubric(req.company_id)
    sample_cases = get_sample_cases(req.company_id, limit=2)
    return {"transcript": simulate_vp_interview(req.case_text, name, rubric, sample_cases, req.role)}


# ── Sessions ──────────────────────────────────────────────────────────────────

class SaveSessionRequest(BaseModel):
    id_token:         str
    company_id:       str
    mode:             str
    role:             str
    transcript:       list
    feedback_history: list
    overall_score:    float

@app.post("/api/sessions/save")
def save_user_session(req: SaveSessionRequest):
    user = verify_token(req.id_token)
    sid  = save_session(user["uid"], req.company_id, req.mode, req.role,
                        req.transcript, req.feedback_history, req.overall_score)
    return {"session_id": sid}

@app.get("/api/sessions/{user_id}")
def get_sessions(user_id: str, authorization: str):
    token = authorization.replace("Bearer ", "")
    user  = verify_token(token)
    if user["uid"] != user_id and not is_admin(user.get("email", "")):
        raise HTTPException(status_code=403, detail="Access denied")
    return get_user_sessions(user_id)


# ── Serve React frontend ──────────────────────────────────────────────────────

frontend_dist = Path("../frontend/dist")

if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(str(frontend_dist / "index.html"))

    @app.get("/{catchall:path}")
    def serve_react(catchall: str):
        fp = frontend_dist / catchall
        return FileResponse(str(fp) if fp.exists() else str(frontend_dist / "index.html"))