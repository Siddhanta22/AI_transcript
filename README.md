# AI Transcript Cleaner

Record audio (or upload a file), generate a transcript, then remove filler words with an LLM.

## Quick start

Backend:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set your key in `.env`:
```
OPENAI_API_KEY=your_api_key_here
```

Start the API:
```bash
uvicorn main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
python -m http.server 5173
```

Open `http://localhost:5173`.

## Notes
- Backend URL: `http://localhost:8000` (override with `window.API_BASE`).
- Models in `.env`: `WHISPER_MODEL` (default `whisper-1`), `CLEAN_MODEL` (default `gpt-4o-mini`).
