import os
import tempfile

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

load_dotenv()

DEFAULT_SYSTEM_PROMPT = (
    "Return ONLY the cleaned text with NO preamble.\n\n"
    "Example:\n"
    'Input: "um so like I was thinking, you know, maybe we could, uh, create a '
    'function that, um, basically does the calculations, right?"\n'
    'Output: "I think we should create a function that does the calculations."'
)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-1")
CLEAN_MODEL = os.getenv("CLEAN_MODEL", "gpt-4o-mini")

app = FastAPI()

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:4173,http://localhost:8000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CleanRequest(BaseModel):
    text: str


def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not set. Add it to your environment.",
        )
    return OpenAI(api_key=api_key)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)) -> dict:
    client = get_openai_client()
    suffix = os.path.splitext(file.filename or "audio")[1] or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name

    try:
        with open(temp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model=WHISPER_MODEL,
                file=audio_file,
            )

        text = (
            transcription.text
            if hasattr(transcription, "text")
            else transcription["text"]
        )
        return {"text": text}
    except Exception as error:
        detail = f"Transcription failed: {error}"
        raise HTTPException(status_code=500, detail=detail) from error
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


@app.post("/clean")
async def clean_transcript(payload: CleanRequest) -> dict:
    client = get_openai_client()
    transcript = payload.text.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Text is empty.")

    try:
        system_prompt = DEFAULT_SYSTEM_PROMPT
        response = client.chat.completions.create(
            model=CLEAN_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": transcript},
            ],
            temperature=0.2,
        )
    except Exception as error:
        detail = f"Cleaning failed: {error}"
        raise HTTPException(status_code=500, detail=detail) from error

    cleaned = response.choices[0].message.content.strip()
    return {"text": cleaned}
