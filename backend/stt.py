# backend/stt.py
import os
import httpx

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"


def transcribe(audio_bytes: bytes) -> str:
    api_key = os.environ.get("DEEPGRAM_API_KEY")
    if not api_key:
        raise ValueError("DEEPGRAM_API_KEY not set")

    try:
        response = httpx.post(
            DEEPGRAM_URL,
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": "audio/webm"
            },
            params={
                "model":        "nova-2",
                "language":     "en",
                "smart_format": "true"
            },
            content=audio_bytes,
            timeout=15.0
        )
        response.raise_for_status()
        return response.json()["results"]["channels"][0]["alternatives"][0]["transcript"].strip()
    except Exception as e:
        print(f"Deepgram error: {e}")
        return ""