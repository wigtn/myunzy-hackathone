"use client";

import { useRef, useState } from "react";

// 이보다 작은 녹음은 오발화·즉시 종료로 보고 STT 호출을 생략한다 (약 1KB).
const MIN_RECORDING_BYTES = 1024;

// 입력 바 — 에디토리얼. 음성(RecordBtn/MediaRecorder) 또는 텍스트. 마이크 거부 시 폴백.
export function InputBar({
  mode,
  disabled,
  onText,
  onVoice,
  onRecordStart,
}: {
  mode: "voice" | "text";
  disabled: boolean;
  onText: (text: string) => void;
  onVoice: (audio: Blob) => void;
  onRecordStart?: () => void; // 녹음 시작 직전 호출 — 재생 중인 면접관 TTS 중단(에코 방지).
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [forceText, setForceText] = useState(mode === "text");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function send() {
    const v = text.trim();
    if (!v || disabled) return;
    onText(v);
    setText("");
  }

  // 브라우저별 지원 오디오 컨테이너 선택 (Safari는 webm 미지원 → mp4).
  function pickMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  }

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    // ⭐ 녹음 시작 즉시(마이크 권한/getUserMedia 대기 전) 재생 중인 면접관 TTS를 끊는다.
    // 비동기 대기 중에도 TTS가 흐르면 마이크가 그 소리를 녹음해 에코가 생기므로 동기로 먼저 중단.
    onRecordStart?.();
    // getUserMedia는 보안 컨텍스트(HTTPS/localhost)에서만 동작 → 미지원 시 즉시 텍스트 폴백.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setForceText(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        // 빈/너무 짧은 녹음(오발화·즉시 종료)은 STT 낭비 → 전송 생략.
        if (blob.size < MIN_RECORDING_BYTES) return;
        onVoice(blob);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setForceText(true); // 마이크 거부 → 텍스트 폴백
    }
  }

  const showVoice = mode === "voice" && !forceText;

  if (showVoice) {
    return (
      <div className="flex items-center gap-3 w-full">
        <button
          type="button"
          onClick={toggleRecord}
          disabled={disabled}
          aria-pressed={recording}
          className={`inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-sm font-medium transition disabled:opacity-40 ${
            recording ? "bg-err text-white" : "bg-ink text-paper hover:bg-accent"
          }`}
        >
          <span className={`size-2 rounded-full bg-current ${recording ? "dot-live" : ""}`} />
          {recording ? "녹음 종료" : "음성으로 답하기"}
        </button>
        <button
          type="button"
          onClick={() => setForceText(true)}
          className="text-sm text-faint hover:text-accent transition-colors"
        >
          텍스트로 입력
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 w-full">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        disabled={disabled}
        placeholder="답변을 입력하고 Enter…"
        aria-label="답변 입력"
        className="flex-1 rounded-full border border-line bg-card px-5 py-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-50 transition placeholder:text-faint"
      />
      <button
        type="button"
        onClick={send}
        disabled={disabled || !text.trim()}
        className="shrink-0 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper disabled:opacity-30 hover:bg-accent transition-colors"
      >
        전송
      </button>
    </div>
  );
}
