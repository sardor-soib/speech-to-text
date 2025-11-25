# Speech-to-Text 🎤

Real-time voice assistant powered by OpenAI Realtime API. Speak into your microphone and get AI responses instantly.

## Quick Start

### Prerequisites
- Python 3.11+
- OpenAI API key with Realtime API access
- Modern web browser

### 1. Setup Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Create .env file with your API key
echo "OPENAI_API_KEY=your_api_key_here" > .env
# Or set system environment variable

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start Frontend

```bash
cd frontend

# Start simple HTTP server
python -m http.server 3000
```

### 3. Use the App

1. Open http://localhost:3000 in your browser
3. Allow microphone access when prompted
4. Click **"Start Recording"** and speak
5. Watch real-time transcription and AI responses

## How It Works

```
Your Voice → Browser → WebSocket → Backend → OpenAI API → AI Response
```

- **Frontend**: Web interface with microphone recording
- **Backend**: FastAPI proxy server for OpenAI Realtime API
- **AI**: GPT-4 real-time voice model

## Testing

```bash
cd backend
pytest tests/ -v
```

## Configuration

Edit `frontend/app.js` to change:
- WebSocket URL (line 20)
- AI voice (`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`)
- AI instructions

## Project Structure

```
speech-to-text/
├── backend/           # FastAPI server
│   ├── app/
│   │   ├── main.py   # Entry point
│   │   ├── routers/  # WebSocket routes
│   │   └── services/ # OpenAI proxy
│   └── tests/        # Tests
└── frontend/          # Web interface
    ├── index.html    # UI
    ├── app.js        # Logic
    └── styles.css    # Styles
```

## Tech Stack

**Backend**: FastAPI, WebSockets, Python-dotenv  
**Frontend**: Vanilla JavaScript, Web Audio API  
**API**: OpenAI Realtime API (GPT-4)

