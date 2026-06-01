# Igbo ↔ English Speech-to-Speech Translator — Backend

## Deploy to Railway in 5 steps

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial backend"
git remote add origin https://github.com/YOUR_USERNAME/igbo-translator-backend
git push -u origin main
```

### Step 2 — Connect to Railway
1. Go to railway.app → New Project → Deploy from GitHub
2. Select your repo
3. Railway auto-detects Node.js and deploys

### Step 3 — Set environment variables on Railway
Go to your Railway project → Variables → Add these:

| Variable | Value |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Paste your full Google Cloud service account JSON (as one line) |
| `PORT` | Railway sets this automatically |

### Step 4 — Add Google credentials loader
Add this at the top of server.js before the Google client init:
```js
// Load Google credentials from env var (Railway-friendly)
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  const creds = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const fs = require('fs');
  fs.writeFileSync('/tmp/google-creds.json', JSON.stringify(creds));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/google-creds.json';
}
```

### Step 5 — Get your Railway URL
Railway gives you a URL like: `https://igbo-translator-backend.up.railway.app`
Copy this — you'll need it in the React PWA.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Check server status |
| `/pipeline` | POST | Full audio → transcript → translation → TTS audio |
| `/translate/text` | POST | Text translation only |
| `/tts` | POST | Text to speech only |
| `ws://` | WebSocket | Real-time streaming |

## Pipeline Request Format
```json
POST /pipeline
{
  "audio": "<base64 encoded audio>",
  "direction": "igbo-to-english",
  "mimeType": "audio/webm"
}
```

## Pipeline Response Format
```json
{
  "transcript": "Ọ dị mma",
  "translation": "It is fine",
  "audio": "<base64 encoded MP3>"
}
```
