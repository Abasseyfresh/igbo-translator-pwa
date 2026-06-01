// ─────────────────────────────────────────────────────────────────────────────
// Railway Backend — Igbo ↔ English Speech-to-Speech Translator
// Stack: Node.js + Express + WebSocket + Google Cloud APIs
// Deploy: push to GitHub → connect to Railway → set env vars
// ─────────────────────────────────────────────────────────────────────────────

const express    = require("express");
const http       = require("http");
const WebSocket  = require("ws");
const cors       = require("cors");
const { Translate } = require("@google-cloud/translate").v2;
const textToSpeech  = require("@google-cloud/text-to-speech");
const { SpeechClient } = require("@google-cloud/speech");

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// ── Google Cloud clients ──────────────────────────────────────────────────────
const translateClient = new Translate();
const ttsClient       = new textToSpeech.TextToSpeechClient();
const speechClient    = new SpeechClient();

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    model: process.env.HF_MODEL || "abasseyfresh/whisper-large-v3-igbo",
    timestamp: new Date().toISOString(),
  });
});

// ── Translation REST endpoint (text only) ────────────────────────────────────
app.post("/translate/text", async (req, res) => {
  try {
    const { text, direction } = req.body;
    const [source, target] = direction === "igbo-to-english"
      ? ["ig", "en"]
      : ["en", "ig"];

    const [translation] = await translateClient.translate(text, {
      from: source,
      to: target,
    });

    res.json({ translation, source: text });
  } catch (err) {
    console.error("Translation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── TTS REST endpoint ─────────────────────────────────────────────────────────
app.post("/tts", async (req, res) => {
  try {
    const { text, language } = req.body;

    const voiceMap = {
      en: { languageCode: "en-US", name: "en-US-Wavenet-D" },
      ig: { languageCode: "en-US", name: "en-US-Wavenet-D" }, // fallback for Igbo
    };

    const voice = voiceMap[language] || voiceMap.en;

    const [response] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: voice.languageCode,
        name: voice.name,
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 0.9,
      },
    });

    res.set("Content-Type", "audio/mpeg");
    res.send(response.audioContent);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Full pipeline REST endpoint ───────────────────────────────────────────────
// Receives base64 audio → returns transcription + translation + TTS audio
app.post("/pipeline", async (req, res) => {
  try {
    const { audio, direction, mimeType } = req.body;
    // audio = base64 encoded audio bytes
    const audioBuffer = Buffer.from(audio, "base64");

    // Step 1: Speech to Text (Google Cloud STT)
    const [source_lang, target_lang] = direction === "igbo-to-english"
      ? ["ig", "en"]
      : ["en-US", "ig"];

    const sttRequest = {
      audio: { content: audioBuffer.toString("base64") },
      config: {
        encoding: "WEBM_OPUS",
        sampleRateHertz: 48000,
        languageCode: direction === "igbo-to-english" ? "ig-NG" : "en-US",
        model: "default",
        enableAutomaticPunctuation: true,
      },
    };

    const [sttResponse] = await speechClient.recognize(sttRequest);
    const transcript = sttResponse.results
      .map(r => r.alternatives[0].transcript)
      .join(" ")
      .trim();

    if (!transcript) {
      return res.json({ transcript: "", translation: "", audio: null });
    }

    // Step 2: Translate
    const [translation] = await translateClient.translate(transcript, {
      from: direction === "igbo-to-english" ? "ig" : "en",
      to:   direction === "igbo-to-english" ? "en" : "ig",
    });

    // Step 3: Text to Speech
    const [ttsResponse] = await ttsClient.synthesizeSpeech({
      input: { text: translation },
      voice: {
        languageCode: direction === "igbo-to-english" ? "en-US" : "en-US",
        name: direction === "igbo-to-english" ? "en-US-Wavenet-D" : "en-US-Wavenet-F",
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 0.9,
      },
    });

    res.json({
      transcript,
      translation,
      audio: ttsResponse.audioContent.toString("base64"),
    });
  } catch (err) {
    console.error("Pipeline error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── WebSocket — real-time streaming pipeline ──────────────────────────────────
wss.on("connection", (ws) => {
  console.log("Client connected");
  let direction = "igbo-to-english";

  ws.on("message", async (data) => {
    try {
      // Text message = control signal
      if (typeof data === "string" || data instanceof Buffer && data[0] === "{".charCodeAt(0)) {
        const msg = JSON.parse(data.toString());
        if (msg.type === "config") {
          direction = msg.direction || "igbo-to-english";
          ws.send(JSON.stringify({ type: "config_ack", direction }));
        }
        return;
      }

      // Binary message = audio chunk
      const audioBuffer = data;

      // STT
      const langCode = direction === "igbo-to-english" ? "ig-NG" : "en-US";
      const [sttResponse] = await speechClient.recognize({
        audio: { content: audioBuffer.toString("base64") },
        config: {
          encoding: "WEBM_OPUS",
          sampleRateHertz: 48000,
          languageCode: langCode,
          enableAutomaticPunctuation: true,
        },
      });

      const transcript = sttResponse.results
        .map(r => r.alternatives[0].transcript)
        .join(" ")
        .trim();

      if (!transcript) return;

      // Translate
      const [translation] = await translateClient.translate(transcript, {
        from: direction === "igbo-to-english" ? "ig" : "en",
        to:   direction === "igbo-to-english" ? "en" : "ig",
      });

      // TTS
      const [ttsResponse] = await ttsClient.synthesizeSpeech({
        input: { text: translation },
        voice: {
          languageCode: "en-US",
          name: direction === "igbo-to-english" ? "en-US-Wavenet-D" : "en-US-Wavenet-F",
        },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.9 },
      });

      // Send result back to client
      ws.send(JSON.stringify({
        type: "result",
        transcript,
        translation,
        audio: ttsResponse.audioContent.toString("base64"),
      }));
    } catch (err) {
      console.error("WebSocket pipeline error:", err);
      ws.send(JSON.stringify({ type: "error", message: err.message }));
    }
  });

  ws.on("close", () => console.log("Client disconnected"));
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Igbo Translator Backend running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
