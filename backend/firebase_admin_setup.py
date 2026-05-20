# backend/firebase_admin_setup.py
import firebase_admin
from firebase_admin import credentials, firestore, auth
import os
import json

_initialized = False
_db = None


def initialize_firebase():
    global _initialized, _db
    if _initialized:
        return _db

    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        raise ValueError("FIREBASE_SERVICE_ACCOUNT_JSON secret not set")

    cred = credentials.Certificate(json.loads(sa_json))
    firebase_admin.initialize_app(cred)
    _db = firestore.client()
    _initialized = True
    print("Firebase initialized.")
    return _db


def get_db():
    if not _initialized:
        return initialize_firebase()
    return _db


def verify_token(id_token: str) -> dict:
    try:
        return auth.verify_id_token(id_token)
    except Exception as e:
        raise ValueError(f"Invalid token: {e}")


def is_admin(email: str) -> bool:
    admin_emails = os.environ.get("ADMIN_EMAILS", "").split(",")
    return email.strip() in [e.strip() for e in admin_emails]