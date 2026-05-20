import os
import io
from gtts import gTTS

def synthesize(text: str) -> bytes:
    if not text or not text.strip():
        return b""
    try:
        tts = gTTS(text=text, lang='en', tld='com', slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return buf.read()
    except Exception as e:
        print(f"gTTS error: {e}")
        return b""