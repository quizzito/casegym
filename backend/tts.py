# backend/tts.py
import os
import httpx

ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech"


def synthesize(text: str) -> bytes:
    api_key  = os.environ.get("ELEVENLABS_API_KEY")
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

    if not api_key or not text.strip():
        return b""

    try:
        response = httpx.post(
            f"{ELEVENLABS_URL}/{voice_id}",
            headers={
                "xi-api-key":   api_key,
                "Content-Type": "application/json"
            },
            json={
                "text":     text,
                "model_id": "eleven_turbo_v2",
                "voice_settings": {
                    "stability":        0.5,
                    "similarity_boost": 0.75,
                    "style":            0.0,
                    "use_speaker_boost": True
                }
            },
            timeout=15.0
        )
        response.raise_for_status()
        return response.content
    except Exception as e:
        print(f"ElevenLabs error: {e}")
        return b""