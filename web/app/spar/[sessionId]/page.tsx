"use client";

// P3. /spar/[sessionId] — 면접 진행 ⭐핵심 (FR-006~012, 015, 017). 에디토리얼 3-zone.
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentLogPanel } from "@/components/AgentLogPanel";
import { ChatStream } from "@/components/spar/ChatStream";
import { JobPostingsPanel } from "@/components/spar/JobPostingsPanel";
import { EvolveDiff } from "@/components/spar/EvolveDiff";
import { InputBar } from "@/components/spar/InputBar";
import { PassGauge } from "@/components/spar/PassGauge";
import { PersonaTabs } from "@/components/spar/PersonaTabs";
import { StateHud } from "@/components/spar/StateHud";
import { getSession, pollQueue, postTurnStream, postTurnText, postTurnVoice, postVerdict, releaseSlot } from "@/lib/client/api";
import type { AgentLog, Session, StateDelta, Turn, Verdict } from "@/lib/contract/types";

// 브라우저 내장 TTS 폴백 (Qwen3-TTS 미설정/실패 시).
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* 폴백 무음 */
  }
}

// 현재 재생 중인 TTS 오디오 (다음 발화 시작 시 중단).
let ttsAudio: HTMLAudioElement | null = null;

// 이전 오디오 정리: 일시정지 + src/리스너 해제로 detached element 누수 방지.
function stopVoice() {
  if (!ttsAudio) return;
  ttsAudio.onerror = null;
  ttsAudio.pause();
  ttsAudio.src = "";
  ttsAudio = null;
}

// 면접관 발화 재생: BFF TTS 엔드포인트(Qwen3-TTS WAV) 우선, 실패 시 SpeechSynthesis 폴백.
// audioUrl이 없으면(텍스트 모드 등) 텍스트로 엔드포인트 URL을 구성한다.
function playVoice(text: string, audioUrl?: string | null, voice?: string) {
  if (typeof window === "undefined") return;
  let src = audioUrl || `/api/v1/tts?text=${encodeURIComponent(text)}`;
  // 선택한 면접관 목소리 주입 (TTS 엔드포인트 URL이면 voice 쿼리 추가).
  if (voice && src.includes("/api/v1/tts") && !src.includes("voice=")) {
    src += `&voice=${encodeURIComponent(voice)}`;
  }
  try {
    window.speechSynthesis?.cancel();
    stopVoice();
    const audio = new Audio(src);
    ttsAudio = audio;
    // 엔드포인트 에러/네트워크 실패 → 브라우저 TTS로 폴백.
    audio.onerror = () => speak(text);
    audio.play().catch(() => speak(text));
  } catch {
    speak(text);
  }
}

export default function SparPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [pass, setPass] = useState(0.4);
  const [state, setState] = useState<StateDelta | null>(null);
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState<string>();
  const [evolve, setEvolve] = useState<Verdict | null>(null);
  const [roundOver, setRoundOver] = useState(false); // 판정 직후 입력 잠금 (중복 제출 방지)
  const [ended, setEnded] = useState(false); // 면접 전체 종료 (마지막 라운드 판정 완료)
  const [loadErr, setLoadErr] = useState(false);
  const round = session?.round ?? 1;
  const openedRef = useRef(false);
  const voiceRef = useRef<string>(""); // setup에서 고른 면접관 목소리

  useEffect(() => {
    voiceRef.current =
      (typeof window !== "undefined" && sessionStorage.getItem(`voice_${sessionId}`)) || "";
    getSession(sessionId)
      .then((s) => {
        setSession(s);
        setLogs(s.agentLog);
        if (!openedRef.current) {
          openedRef.current = true;
          // 현재 라운드의 면접 단계(페르소나)를 sequence로 정확히 선택 (재진입 시 1단계 회귀 방지).
          const r = s.round ?? 1;
          const curId = s.personaSequence?.[r - 1] ?? s.activePersona;
          const p = s.personas.find((x) => x.id === curId) ?? s.personas[0];
          // 1라운드만 이력서 기반 동적 첫 질문, 2라운드+는 해당 단계 면접관의 도입 질문.
          const opening = r === 1 ? s.openingQuestion?.trim() || p.openingLine : p.openingLine;
          if (s.activePersona !== p.id) setSession((prev) => (prev ? { ...prev, activePersona: p.id } : prev));
          setTurns([{ speaker: "ai", personaId: p.id, text: opening }]);
          if (s.mode === "voice") playVoice(opening, null, voiceRef.current);
        }
      })
      .catch(() => setLoadErr(true));
  }, [sessionId]);

  // 페이지 이탈 시 재생 중이던 면접관 음성 중단 (오디오 누수/잔향 방지).
  useEffect(() => () => {
    stopVoice();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  // 동시 면접 슬롯: 진행 중 하트비트(25s)로 유지, 종료/탭닫기 시 반환 → 다음 대기자 입장.
  // (SPA 이탈·크래시는 서버 TTL 90s 가 회수)
  const slotTicketRef = useRef<string | null>(null);
  const slotReleasedRef = useRef(false);
  useEffect(() => {
    const t = typeof window !== "undefined" ? sessionStorage.getItem("slotTicket") : null;
    slotTicketRef.current = t;
    if (!t) return;
    const release = () => {
      if (slotReleasedRef.current) return;
      slotReleasedRef.current = true;
      releaseSlot(t);
      sessionStorage.removeItem("slotTicket");
    };
    const hb = window.setInterval(() => {
      if (!slotReleasedRef.current) pollQueue(t).catch(() => {});
    }, 25000);
    window.addEventListener("beforeunload", release);
    return () => {
      window.clearInterval(hb);
      window.removeEventListener("beforeunload", release);
    };
  }, []);
  // 면접 전체 종료 시 즉시 슬롯 반환.
  useEffect(() => {
    if (ended && !slotReleasedRef.current && slotTicketRef.current) {
      slotReleasedRef.current = true;
      releaseSlot(slotTicketRef.current);
      sessionStorage.removeItem("slotTicket");
    }
  }, [ended]);

  const handleTurn = useCallback(
    async (submit: () => Promise<import("@/lib/contract/types").TurnResult>) => {
      if (roundOver) return; // 판정 후/종료 후 추가 제출 차단 (방어)
      setThinking(true);
      setEvolve(null);
      try {
        const r = await submit();
        setTurns((prev) => [
          ...prev,
          { speaker: "user", text: r.userTurn.text },
          {
            speaker: "ai",
            personaId: r.counterpartTurn.personaId,
            text: r.counterpartTurn.text,
            audioUrl: r.counterpartTurn.audioUrl ?? undefined,
            toolCalls: r.counterpartTurn.toolCalls,
          },
        ]);
        setLogs((prev) => [...prev, ...r.agentLog]);
        setPass(r.passProbability);
        setState(r.counterpartTurn.stateDelta);
        // 헤더 페르소나 라벨을 실제 응답한 면접관으로 동기화 (R2+ 임원 전환 시 라벨이 기술면접관에 고정되던 버그).
        if (r.counterpartTurn.personaId)
          setSession((s) => (s ? { ...s, activePersona: r.counterpartTurn.personaId } : s));
        if (session?.mode === "voice")
          playVoice(r.counterpartTurn.text, r.counterpartTurn.audioUrl, voiceRef.current);
      } catch (e) {
        const err = e as Error & { code?: string };
        setToast(
          err.code === "STT_FAILED"
            ? "잘 못 들었어요. 다시 말씀하거나 텍스트로 입력하세요."
            : err.message || "응답 처리에 실패했어요. 다시 시도해 주세요.",
        );
        setTimeout(() => setToast(undefined), 4000);
      } finally {
        setThinking(false);
      }
    },
    [session?.mode, roundOver],
  );

  // 스트리밍 턴(TTFT): 질문 토큰을 즉시 화면에 흘리고, 끝에 전체 결과로 보강.
  // 스트리밍 불가/실패 시 비스트리밍 handleTurn 으로 폴백 → 데모 무중단.
  const handleTurnStream = useCallback(
    async (payload: { text?: string; audio?: Blob }) => {
      if (roundOver) return;
      setThinking(true);
      setEvolve(null);
      let started = false;
      let firstToken = true;
      const fillLastAi = (mut: (t: Turn) => Turn) =>
        setTurns((prev) => {
          if (!prev.length) return prev;
          const next = prev.slice();
          const last = next[next.length - 1];
          if (last.speaker === "ai") next[next.length - 1] = mut(last);
          return next;
        });
      try {
        await postTurnStream(sessionId, payload, {
          onStart: (userText, personaId) => {
            started = true;
            // SSE는 personaId를 string으로 전달 → Turn/Session의 PersonaId 유니온으로 좁힌다.
            const pid = personaId as Turn["personaId"];
            setTurns((prev) => [
              ...prev,
              { speaker: "user", text: userText },
              { speaker: "ai", personaId: pid, text: "" },
            ]);
            if (pid) setSession((s) => (s ? { ...s, activePersona: pid } : s));
          },
          onToken: (delta) => {
            if (firstToken) {
              firstToken = false;
              setThinking(false); // 첫 토큰 도착 → 타이핑 점 숨기고 질문이 흐르기 시작
            }
            fillLastAi((t) => ({ ...t, text: t.text + delta }));
          },
          onReset: () => fillLastAi((t) => ({ ...t, text: "" })),
          onDone: (r) => {
            fillLastAi(() => ({
              speaker: "ai",
              personaId: r.counterpartTurn.personaId,
              text: r.counterpartTurn.text,
              audioUrl: r.counterpartTurn.audioUrl ?? undefined,
              toolCalls: r.counterpartTurn.toolCalls,
            }));
            setLogs((prev) => [...prev, ...r.agentLog]);
            setPass(r.passProbability);
            setState(r.counterpartTurn.stateDelta);
            if (r.counterpartTurn.personaId)
              setSession((s) => (s ? { ...s, activePersona: r.counterpartTurn.personaId } : s));
            if (session?.mode === "voice")
              playVoice(r.counterpartTurn.text, r.counterpartTurn.audioUrl, voiceRef.current);
          },
        });
      } catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "STT_FAILED") {
          setToast("잘 못 들었어요. 다시 말씀하거나 텍스트로 입력하세요.");
          setTimeout(() => setToast(undefined), 4000);
          return;
        }
        // 서버가 이미 턴 처리를 시작한 뒤 끊김(STREAM_ERROR) → 재실행하면 턴이 중복 누적되므로
        // 폴백하지 않고 안내만 한다(원시 예외 메시지는 노출하지 않음).
        if (err.code === "STREAM_ERROR") {
          setToast("응답 처리에 실패했어요. 다시 시도해 주세요.");
          setTimeout(() => setToast(undefined), 4000);
          return;
        }
        // 스트리밍 불가(비프록시 등)·시작 전 실패 → 비스트리밍 경로로 폴백.
        if (!started) {
          await handleTurn(() =>
            payload.audio
              ? postTurnVoice(sessionId, payload.audio)
              : postTurnText(sessionId, payload.text ?? ""),
          );
          return;
        }
        // 이미 일부 렌더된 뒤 끊김(희귀) → 안내만.
        setToast(err.message || "응답 처리에 실패했어요. 다시 시도해 주세요.");
        setTimeout(() => setToast(undefined), 4000);
      } finally {
        setThinking(false);
      }
    },
    [session?.mode, roundOver, sessionId, handleTurn],
  );

  async function endRound() {
    if (thinking || roundOver) return; // 중복 판정 방지
    setThinking(true);
    try {
      const v = await postVerdict(sessionId);
      sessionStorage.setItem(`verdict_${sessionId}`, JSON.stringify(v));
      setEvolve(v);
      setRoundOver(true); // 판정 후 입력 잠금 — 판정 보기/다음 라운드로 유도
      const isEnded = v.status === "ended";
      setEnded(isEnded);
      setLogs((prev) => [...prev, { step: "evolve.diff", status: "done", detail: v.summary }]);
      // round 증가는 종료가 아닐 때만 (종료 라운드에서 R 숫자 어긋나던 버그 수정)
      if (!isEnded) setSession((s) => (s ? { ...s, round: (v.round ?? s.round) + 1 } : s));
    } catch {
      setToast("판정 생성에 실패했어요.");
      setTimeout(() => setToast(undefined), 4000);
    } finally {
      setThinking(false);
    }
  }

  // 다음 라운드를 spar 안에서 바로 진행 (페이지 이탈 없이 대화 유지). round 는 endRound 에서 이미 +1.
  function nextRound() {
    if (!session || ended) return;
    const nextId = session.personaSequence?.[round - 1] ?? session.activePersona;
    const p = session.personas.find((x) => x.id === nextId) ?? session.personas[0];
    setSession((s) => (s ? { ...s, activePersona: p.id } : s));
    setTurns((prev) => [...prev, { speaker: "ai", personaId: p.id, text: p.openingLine }]);
    if (session.mode === "voice") playVoice(p.openingLine, null, voiceRef.current);
    setEvolve(null);
    setRoundOver(false);
  }

  if (loadErr) {
    return (
      <div className="min-h-full grid place-items-center px-6 text-center">
        <div>
          <p className="text-muted">세션을 찾을 수 없어요.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 rounded-full border border-line px-5 py-2.5 text-sm hover:border-accent transition"
          >
            처음으로
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-full grid place-items-center">
        <span className="text-sm text-faint">세션 부팅 중…</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더: 페르소나 + 메타 + 상태 HUD */}
      <div className="shrink-0 border-b border-line/70 px-5 sm:px-8 py-3 flex items-center gap-4 flex-wrap bg-paper/60 backdrop-blur-sm">
        <PersonaTabs personas={session.personas} active={session.activePersona} />
        <span className="ml-auto text-[11px] text-faint">
          {session.company} · {session.role} · R{round}
        </span>
        <StateHud state={state} />
      </div>

      {/* 본문: 대화 / 작업로그 */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col min-h-0 lg:border-r border-line/70">
          <ChatStream turns={turns} personas={session.personas} thinking={thinking} />
          {evolve && (
            <div className="shrink-0 px-6 sm:px-10 pb-4">
              {!ended && (
                <EvolveDiff before={evolve.weaknessBefore} after={evolve.weaknessProfile} round={evolve.round ?? round - 1} />
              )}
              {ended ? (
                <button
                  onClick={() => router.push(`/result/${sessionId}`)}
                  className="mt-3 w-full rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper hover:bg-accent transition-colors"
                >
                  면접 종료 · 최종 판정 보기 →
                </button>
              ) : (
                <div className="mt-3 flex gap-2.5">
                  <button
                    onClick={nextRound}
                    className="flex-1 rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper hover:bg-accent transition-colors"
                  >
                    다음 라운드 ({round}/{session.personaSequence?.length ?? round}) →
                  </button>
                  <button
                    onClick={() => router.push(`/result/${sessionId}`)}
                    className="rounded-full border border-line px-5 py-3 text-sm text-muted hover:border-accent hover:text-accent transition"
                  >
                    판정 상세
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="hidden lg:flex flex-col min-h-0">
          {session.jobPostings && session.jobPostings.length > 0 && (
            <div className="shrink-0 max-h-[42%] overflow-y-auto px-4 pt-4 border-b border-line/60 pb-3">
              <JobPostingsPanel postings={session.jobPostings} />
            </div>
          )}
          <AgentLogPanel logs={logs} title="작업 로그" className="flex-1 min-h-0 rounded-none border-0 bg-transparent" />
        </div>
      </div>

      {/* 하단 바 */}
      <div className="shrink-0 border-t border-line/70 px-5 sm:px-8 py-4 bg-paper/80 backdrop-blur-md space-y-3">
        {toast && (
          <div className="rounded-xl border border-err/30 bg-err/8 px-4 py-2.5 text-sm text-err">{toast}</div>
        )}
        <div className="flex items-center gap-5 flex-wrap">
          <PassGauge value={pass} />
          {!roundOver && (
            <button
              onClick={endRound}
              disabled={thinking || turns.filter((t) => t.speaker === "user").length === 0}
              className="ml-auto rounded-full border border-pressure/40 text-pressure px-5 py-2.5 text-sm font-medium hover:bg-pressure/8 disabled:opacity-30 transition"
            >
              라운드 종료 · 판정
            </button>
          )}
        </div>
        {roundOver ? (
          <p className="text-sm text-muted text-center py-1">
            {ended ? "면접이 끝났어요. 위에서 최종 판정을 확인하세요." : "라운드 판정 완료 — 위 ‘다음 라운드’로 이어서 진행하세요."}
          </p>
        ) : (
          <InputBar
            mode={session.mode}
            disabled={thinking}
            onText={(text) => handleTurnStream({ text })}
            onVoice={(audio) => handleTurnStream({ audio })}
            onRecordStart={() => {
              // 답변 녹음 시작 → 재생 중인 면접관 음성(WAV/브라우저 TTS) 즉시 중단(에코 방지).
              stopVoice();
              if (typeof window !== "undefined") window.speechSynthesis?.cancel();
            }}
          />
        )}
      </div>
    </div>
  );
}
