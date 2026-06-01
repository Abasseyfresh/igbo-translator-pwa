import { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://igbo-translator-backend.vercel.app";
// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [direction, setDirection]     = useState("igbo-to-english");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript]   = useState("");
  const [translation, setTranslation] = useState("");
  const [error, setError]             = useState("");
  const [audioUrl, setAudioUrl]       = useState(null);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [volume, setVolume]           = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const audioRef         = useRef(null);
  const animFrameRef     = useRef(null);
  const analyserRef      = useRef(null);
  const streamRef        = useRef(null);

  // ── Volume visualiser ───────────────────────────────────────────────────────
  const startVolumeMonitor = useCallback((stream) => {
    const ctx      = new AudioContext();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const tick = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVolume(Math.min(100, avg * 2));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopVolumeMonitor = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setVolume(0);
  }, []);

  // ── Start recording ─────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      setError("");
      setTranscript("");
      setTranslation("");
      setAudioUrl(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stopVolumeMonitor();
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await sendToBackend(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      startVolumeMonitor(stream);
    } catch (err) {
      setError("Microphone access denied. Please allow microphone access.");
    }
  }, [direction, startVolumeMonitor, stopVolumeMonitor]);

  // ── Stop recording ──────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  }, [isRecording]);

  // ── Send to backend ─────────────────────────────────────────────────────────
  const sendToBackend = useCallback(async (blob) => {
    try {
      const reader    = new FileReader();
      const base64Audio = await new Promise((res) => {
        reader.onload = () => res(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });

      const response = await fetch(`${BACKEND_URL}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64Audio,
          direction,
          mimeType: "audio/webm",
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const data = await response.json();

      setTranscript(data.transcript || "");
      setTranslation(data.translation || "");

      if (data.audio) {
        const audioBlob = new Blob(
          [Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))],
          { type: "audio/mpeg" }
        );
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        // Auto-play the translated audio
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.play();
            setIsPlaying(true);
          }
        }, 300);
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [direction]);

  // ── Toggle direction ────────────────────────────────────────────────────────
  const toggleDirection = useCallback(() => {
    setDirection(d => d === "igbo-to-english" ? "english-to-igbo" : "igbo-to-english");
    setTranscript("");
    setTranslation("");
    setAudioUrl(null);
    setError("");
  }, []);

  const isIgboToEng = direction === "igbo-to-english";

  return (
    <div className="app">
      {/* Background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="container">
        {/* Header */}
        <header className="header">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">ỌKWU</span>
          </div>
          <p className="tagline">Igbo · English · Real-time translation</p>
        </header>

        {/* Direction toggle */}
        <div className="direction-bar">
          <span className={`lang-label ${isIgboToEng ? "active" : ""}`}>
            🇳🇬 Igbo
          </span>
          <button className="toggle-btn" onClick={toggleDirection}>
            <span className="toggle-icon">{isIgboToEng ? "→" : "←"}</span>
          </button>
          <span className={`lang-label ${!isIgboToEng ? "active" : ""}`}>
            🇬🇧 English
          </span>
        </div>

        {/* Microphone button */}
        <div className="mic-section">
          <div
            className="mic-ring"
            style={{
              transform: `scale(${1 + volume * 0.003})`,
              opacity: isRecording ? 0.6 + volume * 0.004 : 0.2,
            }}
          />
          <div
            className="mic-ring mic-ring-2"
            style={{
              transform: `scale(${1 + volume * 0.005})`,
              opacity: isRecording ? 0.3 + volume * 0.003 : 0.1,
            }}
          />
          <button
            className={`mic-btn ${isRecording ? "recording" : ""} ${isProcessing ? "processing" : ""}`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <span className="spinner" />
            ) : isRecording ? (
              <span className="stop-icon">■</span>
            ) : (
              <span className="mic-icon">🎤</span>
            )}
          </button>
          <p className="mic-hint">
            {isProcessing
              ? "Translating..."
              : isRecording
              ? "Release to translate"
              : "Hold to speak"}
          </p>
        </div>

        {/* Volume bars */}
        {isRecording && (
          <div className="volume-bars">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="volume-bar"
                style={{
                  height: `${Math.max(4, Math.random() * volume * 0.6 + 4)}px`,
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Results */}
        {(transcript || translation) && (
          <div className="results">
            {transcript && (
              <div className="result-card source-card">
                <div className="result-label">
                  {isIgboToEng ? "🇳🇬 Igbo" : "🇬🇧 English"}
                </div>
                <p className="result-text">{transcript}</p>
              </div>
            )}
            {translation && (
              <div className="result-card translation-card">
                <div className="result-label">
                  {isIgboToEng ? "🇬🇧 English" : "🇳🇬 Igbo"}
                  {audioUrl && (
                    <button
                      className="replay-btn"
                      onClick={() => { audioRef.current?.play(); setIsPlaying(true); }}
                    >
                      {isPlaying ? "▶ Replay" : "▶ Play"}
                    </button>
                  )}
                </div>
                <p className="result-text translation-text">{translation}</p>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-card">
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Hidden audio player */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setIsPlaying(false)}
            style={{ display: "none" }}
          />
        )}

        {/* Footer */}
        <footer className="footer">
          <p>Powered by Whisper · Google Translate · Google TTS</p>
        </footer>
      </div>
    </div>
  );
}
