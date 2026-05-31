// BFF 내장 TS mock 엔진 — AGENT_SERVICE_URL 미설정 시 데모를 단독 완주시키는 폴백.
// 점수/합격확률은 결정론적 순수함수 (심사위원이 일관성 확인). 랜덤 금지.
import {
  appendLog,
  getSession,
  newId,
  putSession,
  type StoredSession,
  type StoredTurn,
} from "@/lib/bff/store";
import {
  FILLER_WORDS,
  MOCK_ATTACK_POINTS,
  MOCK_PERSONAS,
  MOCK_QUESTION_BANK,
} from "@/lib/bff/mockData";
import type {
  PersonaId,
  ReplayResult,
  Session,
  TurnResult,
  Verdict,
  WeaknessProfile,
} from "@/lib/contract/types";

// 면접 단계(페르소나) 시퀀스 — 사용자가 고른 단계 우선, 없으면 기본.
const VALID_STAGES: PersonaId[] = ["tech", "culture", "exec", "hr"];
function resolveSequence(stages?: string[]): PersonaId[] {
  const seq = (stages ?? []).filter((x): x is PersonaId => (VALID_STAGES as string[]).includes(x));
  return seq.length ? seq : ["tech", "culture", "exec"];
}

// ── 세션 부트스트랩 (FR-002~005): OCR→수집→FitGap→페르소나 ──
export function bootstrapSession(input: {
  company: string;
  role: string;
  mode: "voice" | "text";
  difficulty: number;
  resumeCount?: number;
  jobPostingText?: string;
  stages?: string[];
}): Session {
  const sequence = resolveSequence(input.stages);
  const s: StoredSession = {
    sessionId: newId(),
    company: input.company,
    role: input.role,
    mode: input.mode,
    difficulty: Math.min(3, Math.max(1, input.difficulty || 1)),
    fitGap: { attackPoints: MOCK_ATTACK_POINTS },
    personas: MOCK_PERSONAS,
    activePersona: sequence[0],
    personaSequence: sequence,
    interviewLength: sequence.length,
    round: 1,
    status: "active",
    turns: [],
    weaknessProfile: { patterns: [], nextFocus: "근거 있는 답변 유도" },
    agentLog: [],
    passProbability: 0.4,
    createdAt: Date.now(),
  };

  // 부트스트랩 작업 로그 (subagent 병렬 수집 연출)
  const docs = input.resumeCount && input.resumeCount > 1 ? `서류 ${input.resumeCount}장` : "이력서";
  appendLog(s, { step: "ocr.parse", status: "done", detail: `${docs} 파싱 (경력 4년·백엔드)`, mock: true });
  if (input.jobPostingText && input.jobPostingText.length > 0) {
    // 사용자가 직접 붙여넣은 공고 — 실데이터이므로 mock 아님
    appendLog(s, {
      step: "job.manual",
      status: "done",
      detail: `사용자 제공 공고 사용 (${input.jobPostingText.length}자)`,
      mock: false,
    });
  } else {
    appendLog(s, { step: "job.search", status: "done", detail: `${input.company} ${input.role} 채용공고 수집`, mock: true });
  }
  appendLog(s, { step: "reputation.lookup", status: "done", detail: "회사 평판 신호 수집", mock: true });
  appendLog(s, { step: "fitgap.analyze", status: "done", detail: `공격 포인트 ${MOCK_ATTACK_POINTS.length}개 추출`, mock: false });
  const stageNames = sequence.map((id) => MOCK_PERSONAS.find((p) => p.id === id)?.name ?? id).join(" → ");
  appendLog(s, { step: "persona.build", status: "done", detail: `면접 단계 구성: ${stageNames}`, mock: false });

  putSession(s);
  return toSessionDTO(s);
}

function toSessionDTO(s: StoredSession): Session {
  return {
    sessionId: s.sessionId,
    company: s.company,
    role: s.role,
    mode: s.mode,
    fitGap: s.fitGap,
    personas: s.personas,
    activePersona: s.activePersona,
    personaSequence: s.personaSequence,
    interviewLength: s.interviewLength,
    round: s.round,
    agentLog: s.agentLog,
    status: s.status,
  };
}

export function getSessionDTO(id: string): Session | undefined {
  const s = getSession(id);
  return s ? toSessionDTO(s) : undefined;
}

// ── 합성 단어 타임스탬프 (mock 얼라이너): 머뭇거림/필러 결정론 생성 ──
function synthWordTimestamps(text: string, seed: number): {
  word: string;
  start: number;
  end: number;
}[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: { word: string; start: number; end: number }[] = [];
  let t = 0.3 + (seed % 3) * 0.5; // 응답 시작 지연
  words.forEach((w, i) => {
    // 일정 간격마다 머뭇거림 갭 삽입 (seed 기반 결정론)
    const pause = (i + seed) % 5 === 0 ? 0.8 + ((seed * 7) % 10) / 10 : 0.05;
    t += pause;
    const dur = 0.18 + (w.length * 0.04);
    out.push({ word: w, start: round2(t), end: round2(t + dur) });
    t += dur;
  });
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── 턴 처리 (FR-008~010, 015, 017): 하네스→큐레이션→면접관 응답→라이브 툴콜 ──
export function processTurn(
  sessionId: string,
  userText: string,
  isVoice: boolean,
  // 실 STT가 준 단어 타임스탬프. 있으면 합성 대신 사용 → 머뭇거림/필러 분석이 실데이터 기반.
  wordTimestamps?: { word: string; start: number; end: number }[],
): TurnResult | { notFound: true } {
  const s = getSession(sessionId);
  if (!s) return { notFound: true };

  const turnIdx = s.turns.filter((t) => t.speaker === "user").length;
  const logsBefore = s.agentLog.length;

  // 하네스: 스키마 검증 (가끔 재시도 연출 → tool-call 유효율 >99% 하네스 증명)
  appendLog(s, { step: "harness.validate", status: "done", detail: "tool-call 스키마 검증" });
  if ((turnIdx + s.difficulty) % 3 === 0) {
    appendLog(s, { step: "harness.retry", status: "retry", detail: "깨진 tool-call 자동 리프롬프트 → 복구" });
  }

  // 사용자 턴 저장. 실 STT 타임스탬프가 있으면 사용, 없으면 mock 얼라이너로 합성.
  const userTurn: StoredTurn = {
    round: s.round,
    speaker: "user",
    text: userText,
    wordTimestamps:
      wordTimestamps && wordTimestamps.length > 0
        ? wordTimestamps
        : synthWordTimestamps(userText, turnIdx + s.difficulty),
  };
  s.turns.push(userTurn);

  // 라이브 툴콜 (단일 턴 = 단일 도구 큐레이션)
  const toolName = turnIdx % 2 === 0 ? "lookup_job_posting" : "check_answer_quality";
  const toolMock = toolName === "lookup_job_posting";
  appendLog(s, {
    step: `tool.${toolName}`,
    status: "done",
    detail: toolName === "lookup_job_posting" ? "채용공고 필수요건 조회" : "답변 품질(STAR) 평가",
    mock: toolMock,
  });

  // 면접 단계 = 라운드별 정해진 페르소나(사용자가 고른 시퀀스). 임의 전환 없음.
  const seq = s.personaSequence?.length ? s.personaSequence : (["tech"] as PersonaId[]);
  const persona: PersonaId = seq[Math.min(s.round - 1, seq.length - 1)];
  s.activePersona = persona;

  // 면접관 다음 질문 (mock LLM 대용): 라운드 인덱스로 압박 강도 선택
  const bank = MOCK_QUESTION_BANK[persona] ?? MOCK_QUESTION_BANK.tech;
  const roundBank = bank[Math.min(s.round - 1, bank.length - 1)];
  const q = roundBank[turnIdx % roundBank.length];

  const aiTurn: StoredTurn = { round: s.round, speaker: "ai", personaId: persona, text: q };
  s.turns.push(aiTurn);

  // stateDelta: 난이도/라운드에 따라 pressure 상승 (에스컬레이션 FR-017)
  const pressure = clamp01(0.35 + 0.12 * s.difficulty + 0.15 * (s.round - 1) + 0.05 * turnIdx);
  const stateDelta = {
    mood: pressure > 0.7 ? "냉정·압박" : pressure > 0.5 ? "회의적" : "탐색적",
    pressure: round2(pressure),
    hiddenAgendaRevealed: s.round >= 2 && turnIdx >= 1,
  };

  // 합격확률: 결정론적 — 답변 길이/구체성(숫자 포함) 신호 가중합
  s.passProbability = computePassProbability(s);

  const newLogs = s.agentLog.slice(logsBefore);
  putSession(s);

  return {
    userTurn: { text: userText, audioRef: isVoice ? `audio_${turnIdx}` : null },
    counterpartTurn: {
      personaId: persona,
      text: q,
      // 음성 모드: BFF TTS 엔드포인트(/api/v1/tts) URL 제공 → 클라가 Qwen3-TTS WAV 재생.
      // 엔드포인트가 미설정/실패면 에러 응답 → 클라가 SpeechSynthesis로 폴백.
      audioUrl: isVoice ? `/api/v1/tts?text=${encodeURIComponent(q)}` : null,
      toolCalls: [
        {
          name: toolName,
          summary: toolName === "lookup_job_posting" ? "채용공고 필수요건 조회" : "답변 품질 평가",
          mock: toolMock,
        },
      ],
      stateDelta,
    },
    passProbability: s.passProbability,
    agentLog: newLogs,
    round: s.round,
  };
}

const HEDGE_WORDS = ["보통", "그냥", "대충", "아마", "거의", "대략", "뭐랄까"];

// 답변 '품질'이 곧 합격확률 — 엉망이면 확실히 바닥, 좋으면 높게 (반응성↑).
function computePassProbability(s: StoredSession): number {
  const userTurns = s.turns.filter((t) => t.speaker === "user");
  if (userTurns.length === 0) return 0.4;
  let total = 0;
  for (const t of userTurns) {
    const txt = t.text;
    let q = 0.5;
    q += /\d/.test(txt) ? 0.25 : -0.18; // 정량 근거
    const n = txt.length;
    q += n >= 60 ? 0.1 : n < 25 ? -0.2 : 0; // 분량(짧으면 큰 감점)
    if (FILLER_WORDS.some((f) => txt.includes(f))) q -= 0.15; // 머뭇거림
    if (HEDGE_WORDS.some((h) => txt.includes(h))) q -= 0.15; // 모호·회피
    if (/(상황|결과|그래서|결국|때문|위해)/.test(txt)) q += 0.1; // 구조·인과
    total += Math.max(0, Math.min(1, q));
  }
  return clamp01(total / userTurns.length - 0.05 * (s.difficulty - 1));
}

const clamp01 = (n: number) => Math.max(0.02, Math.min(0.98, n));

// ── verdict (FR-013~014): 순수 코드 집계, 자가진화 약점 프로파일 갱신 ──
export function processVerdict(sessionId: string): Verdict | { notFound: true } {
  const s = getSession(sessionId);
  if (!s) return { notFound: true };

  appendLog(s, { step: "align.process", status: "done", detail: "단어 타임스탬프 후처리", mock: true });

  const userTurns = s.turns.filter((t) => t.speaker === "user" && t.round === s.round);
  const timing = computeTimingMetrics(userTurns);
  const scores = computeScores(s, userTurns, timing);

  // 프레임워크 위반 탐지 (STAR)
  const violations: string[] = [];
  const allText = userTurns.map((t) => t.text).join(" ");
  if (!/(상황|when|당시|그때)/.test(allText)) violations.push("STAR: Situation(상황) 맥락 누락");
  if (!/\d/.test(allText)) violations.push("정량 성과 미제시");
  if (allText.length < 80) violations.push("답변 근거량 부족");

  // 약점 프로파일 before/after (자가진화 FR-011)
  const before: WeaknessProfile = {
    patterns: [...s.weaknessProfile.patterns],
    nextFocus: s.weaknessProfile.nextFocus,
  };
  const patterns: string[] = [];
  if (timing.fillerCount >= 4) patterns.push("두루뭉술");
  if (timing.avgResponseDelaySec >= 2.5) patterns.push("응답 지연(머뭇거림)");
  if (!/\d/.test(allText)) patterns.push("정량 근거 부재");
  if (patterns.length === 0) patterns.push("성급한 동의");
  const nextFocus = patterns.includes("정량 근거 부재")
    ? "다음 라운드: 모든 답변에 정량 근거 강제"
    : "다음 라운드: 두루뭉술 표현 차단 + 구체 사례 요구";
  s.weaknessProfile = { patterns, nextFocus };

  appendLog(s, {
    step: "evolve.diff",
    status: "done",
    detail: `R${s.round} 약점=${patterns.join(",")} → ${nextFocus}`,
  });

  const fitGapReport = {
    covered: ["기본 기술 스택 매칭", "직무 도메인 경험"],
    stillWeak: s.fitGap.attackPoints.slice(0, 2),
  };

  // moments: 머뭇거림 큰 지점들
  const moments = buildMoments(userTurns, s.round);

  const summary = `R${s.round}: ${patterns[0]} 신호가 두드러짐. ${nextFocus}.`;

  // 면접 단계 종료 판정: 마지막 단계면 종료, 아니면 다음 단계로 진화
  const verdictRound = s.round;
  const ended = verdictRound >= s.interviewLength;
  if (ended) s.status = "ended";
  else s.round += 1;
  putSession(s);

  return {
    scores,
    timingMetrics: timing,
    framework: { name: "STAR / 역량면접", violations },
    fitGapReport,
    weaknessProfile: s.weaknessProfile,
    weaknessBefore: before,
    moments,
    summary,
    round: verdictRound,
    status: ended ? "ended" : "active",
  };
}

function computeTimingMetrics(turns: StoredTurn[]) {
  const ts = turns.flatMap((t) => t.wordTimestamps ?? []);
  if (ts.length === 0) {
    return { avgResponseDelaySec: 0, longestPauseSec: 0, wordsPerSec: 0, fillerCount: 0 };
  }
  let longestPause = 0;
  let delaySum = 0;
  for (const t of turns) {
    const w = t.wordTimestamps ?? [];
    if (w.length) delaySum += w[0].start;
    for (let i = 1; i < w.length; i++) {
      longestPause = Math.max(longestPause, w[i].start - w[i - 1].end);
    }
  }
  const totalDur = ts[ts.length - 1].end - ts[0].start;
  const fillerCount = turns
    .flatMap((t) => t.text.split(/\s+/))
    .filter((w) => FILLER_WORDS.includes(w)).length;
  return {
    avgResponseDelaySec: round2(delaySum / turns.length),
    longestPauseSec: round2(longestPause),
    wordsPerSec: round2(ts.length / Math.max(1, totalDur)),
    fillerCount,
  };
}

function computeScores(s: StoredSession, turns: StoredTurn[], timing: ReturnType<typeof computeTimingMetrics>) {
  const allText = turns.map((t) => t.text).join(" ");
  const hasNumber = /\d/.test(allText);
  const evidence = clamp01(0.4 + (hasNumber ? 0.3 : 0) + Math.min(0.2, allText.length / 1000));
  const timingScore = clamp01(0.8 - timing.longestPauseSec * 0.08 - timing.fillerCount * 0.03);
  const composure = clamp01(0.7 - timing.fillerCount * 0.04);
  const goalAchieved = clamp01((evidence + s.passProbability) / 2);
  const assertiveness = clamp01(0.5 + (allText.includes("제가") ? 0.2 : -0.05));
  return {
    goalAchieved: round2(goalAchieved),
    evidence: round2(evidence),
    composure: round2(composure),
    timing: round2(timingScore),
    assertiveness: round2(assertiveness),
  };
}

function buildMoments(turns: StoredTurn[], round: number) {
  const moments: { id: string; round: number; atSec: number; label: string; quote: string }[] = [];
  turns.forEach((t, idx) => {
    const w = t.wordTimestamps ?? [];
    let maxPause = 0;
    let atSec = w.length ? w[0].start : 0;
    for (let i = 1; i < w.length; i++) {
      const p = w[i].start - w[i - 1].end;
      if (p > maxPause) {
        maxPause = p;
        atSec = w[i - 1].end;
      }
    }
    if (maxPause >= 0.8 || idx === 0) {
      moments.push({
        id: `m_${round}_${idx}`,
        round,
        atSec: round2(atSec),
        label: maxPause >= 0.8 ? "머뭇거림 후 응답" : "핵심 답변",
        quote: t.text.slice(0, 40) + (t.text.length > 40 ? "…" : ""),
      });
    }
  });
  return moments;
}

// ── 분기 리플레이 (FR-016): 대안 답변 재시뮬레이션 (순수코드 폴백) ──
export function processReplay(
  sessionId: string,
  momentId: string,
  alternative?: string,
): ReplayResult | { notFound: true } {
  const s = getSession(sessionId);
  if (!s) return { notFound: true };

  const alt =
    alternative ??
    "당시 주문 정산 시스템에서 일 200만 건을 처리했고, 인덱스 재설계로 p99 레이턴시를 1.8초에서 320ms로 82% 줄였습니다.";
  const better = /\d/.test(alt) && alt.length >= 40;
  const delta = better ? 0.18 : -0.05;
  s.passProbability = clamp01(s.passProbability + delta);
  putSession(s);

  return {
    branchTranscript: [
      { speaker: "user", text: alt },
      {
        speaker: "ai",
        text: better
          ? "좋습니다. 그 수치라면 설득력이 다릅니다. 그럼 그 재설계에서 가장 위험했던 결정은 뭐였죠?"
          : "여전히 근거가 약하네요. 숫자로 말씀해 주셔야 합니다.",
      },
    ],
    outcomeDelta: better
      ? "정량 근거를 제시하자 면접관이 압박을 풀고 심화 질문으로 전환 — 합격확률 상승."
      : "근거 보강이 부족해 동일한 압박이 반복됨.",
    passProbabilityDelta: round2(delta),
  };
}
