# Igbo ↔ English Translator PWA

## Deploy to Vercel in 4 steps

### Step 1 — Set your backend URL
Create `.env` file:
```
VITE_BACKEND_URL=https://your-backend.up.railway.app
```

### Step 2 — Push to GitHub
```bash
git init
git add .
git commit -m "Igbo Translator PWA"
git remote add origin https://github.com/YOUR_USERNAME/igbo-translator-pwa
git push -u origin main
```

### Step 3 — Deploy on Vercel
1. Go to vercel.com → New Project → Import from GitHub
2. Select your repo
3. Add environment variable: `VITE_BACKEND_URL` = your Railway URL
4. Click Deploy

### Step 4 — Install as PWA on phone
Open the Vercel URL on your phone →
- **Android**: Chrome menu → "Add to Home Screen"
- **iPhone**: Safari share button → "Add to Home Screen"

## Features
- 🎤 Hold-to-record microphone
- 🔄 Toggle Igbo → English / English → Igbo
- 🔊 Auto-plays translated audio
- 📊 Live volume visualiser
- 📱 Installable PWA
- 🌙 Dark theme optimised for mobile
