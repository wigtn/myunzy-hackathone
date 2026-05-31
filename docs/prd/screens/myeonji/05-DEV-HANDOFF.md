# 05 · Dev Handoff — 면지 (面zy)

> **Source**: PRD §3·§5.1·§5.4 + 01~04 산출물
> **목적**: FR ↔ 화면 ↔ 컴포넌트 ↔ API 매핑. `/implement` 입력.

## Stack 가정 (PRD §5.3 / AGENT_ARCHITECTURE.md) — 3-tier 폴리글랏
- **프론트**: Next.js 16 / React 19 / TypeScript / Tailwind
- **BFF**: Next API routes (서버리스 프록시, §5.1 REST 계약, 키 env) — 프론트 mock-first 병렬개발 면
- **에이전트 서비스**: Python / FastAPI + **DeepAgents 미들웨어** (LangGraph 턴 컨트롤러 + Skills/Subagents/wrap_tool_call/StateBackend + QuickJS code-as-action)
- 어댑터 포트 8종은 **에이전트 서비스 내부**에 위치 (mock-first, 단 **EXAONE=실연동**)
- 상태: weakness_profile = StateBackend(휘발) / 라이브 로그 = LangGraph 스트리밍 → BFF SSE·폴링 (WS는 Phase 3, M-6)
- ⚠️ FE/BFF는 §5.1 REST 계약만 알면 됨 → 에이전트 내부(Python/DeepAgents)와 **결합 없음**. 프론트 담당은 TS만, 에이전트 담당은 Python만.
- ⚠️ 명명: "PTC" ❌ → **"QuickJS code-as-action"** ✅ (EXAONE에 Anthropic 네이티브 PTC 불가)

## FR ↔ 화면 ↔ 컴포넌트 ↔ API

| FR | 화면 | 컴포넌트 | API |
|----|------|----------|-----|
| FR-001 세션 시작 | /, /setup | `CTA.primary`, `Btn.start` | `POST /sessions` |
| FR-002 OCR 파싱 | /setup | `Dropzone.resume`, `AgentLogPanel(ocr.parse)` | `POST /sessions`(resume) → EXT-OCR |
| FR-003 컨텍스트 수집 | /setup | `AgentLogPanel(job.search)` | EXT-JOB/RANK/GW |
| FR-004 Fit Gap | /setup, /result | `AgentLogPanel(fitgap)`, `FitGapReport` | 내부(LLM) |
| FR-005 페르소나 생성 | /setup→/spar | `AgentLogPanel(persona.build)`, `PersonaTabs` | `POST /sessions`→personas[] |
| FR-006 음성 입력 | /spar | `RecordBtn` (MediaRecorder) | `POST /turns`(audio) → EXT-STT |
| FR-007 텍스트 모드 | /spar | `TextInput` | `POST /turns`(text) |
| FR-008 하네스 | /spar | `AgentLogPanel(harness.*)` | 내부 오케스트레이터 |
| FR-009 TTS 출력 | /spar | `ChatStream`(audio) | EXT-TTS |
| FR-010 라이브 툴콜 | /spar | `ToolCallChip` | `POST /turns`→toolCalls[] |
| FR-011 자가진화 | /spar | `EvolveDiff` | `POST /verdict`→weaknessProfile |
| FR-012 작업 로그 | /setup, /spar | `AgentLogPanel` | agentLog[] (SSE/폴링) |
| FR-013 타임스탬프 | /result | `TimingMetrics` | `POST /verdict` → EXT-ALIGN |
| FR-014 피드백 | /result | `ScoreCard`,`FrameworkCard`,`FitGapReport` | `POST /verdict` |
| FR-015 합격확률 게이지 | /spar | `PassGauge` | `POST /turns`→passProbability |
| FR-016 분기 리플레이 | /result | `MomentTimeline`,`ReplayPanel` | `POST /replay` |
| FR-017 에스컬레이션 | /spar | `StateHud` | stateDelta |
| FR-022 동의 UI | /setup | `Checkbox.consent` | (클라 게이트) |

## Component Tree

```
<AppShell>                       // 다크 테마, 미니 헤더, 토큰 주입
 ├─ <LandingPage>                // /
 │   ├─ Hero / HowItWorks / CTA / SponsorStrip
 ├─ <SetupPage>                  // /setup
 │   ├─ <SetupForm>  Dropzone · Input×2 · Toggle.mode · Select.difficulty · Checkbox.consent · Btn.start
 │   └─ <AgentLogPanel mode="bootstrap">
 ├─ <SparPage>                   // /spar/[id]
 │   ├─ <PersonaTabs> + <StateHud>
 │   ├─ <ChatStream>  <Bubble> · <ToolCallChip> · <MockBadge>
 │   ├─ <InputBar>  <RecordBtn> | <TextInput>
 │   ├─ <AgentLogPanel mode="turn"> + <EvolveDiff>
 │   ├─ <PassGauge>
 │   └─ <RoundCtrl>
 └─ <ResultPage>                 // /result/[id]
     ├─ <SummaryBar>
     ├─ <ScoreCard> · <TimingMetrics> · <FrameworkCard> · <FitGapReport>
     └─ <MomentTimeline> → <ReplayPanel>
```

## 핵심 상태 모델 (클라)

```ts
type Session = { id:string; company:string; role:string; mode:'voice'|'text';
  personas:Persona[]; activePersona:string; round:number; }   // ⚠ activePersona (PRD 오타 activedPersona 수정)
type Turn = { speaker:'user'|'ai'; personaId?:string; text:string; audioUrl?:string;
  toolCalls?:{name:string;summary:string;mock?:boolean}[] }
type AgentLog = { step:string; status:'run'|'done'|'retry'|'error'; detail?:string; mock?:boolean }
type Verdict = { scores:Record<string,number>; timingMetrics:object; framework:object;
  fitGapReport:object; weaknessProfile:{patterns:string[];nextFocus:string}; moments:Moment[]; summary:string }
```

## 구현 우선순위 (데모 합격선 기준)

1. **P0-Demo (반드시)**: /setup→/spar(텍스트)→/result, `AgentLogPanel`, `ScoreCard`+`FitGapReport`. EXAONE+MISO+Tier-A 택1 실연동.
2. **P0-Stretch**: 음성(RecordBtn/STT/TTS), `PassGauge`, `EvolveDiff`, `ReplayPanel`.
3. **폴백 필수**: STT/TTS/얼라이너/수집 mock 경로 + `[mock]` 배지. 데모 중 업스트림 죽어도 완주.

## a11y / 반응형 체크
- 모든 입력 `<label>` 연결, `Dropzone` 키보드 접근, `RecordBtn` aria-pressed.
- 작업 로그 `role="log" aria-live="polite"`.
- 모바일: /spar 작업로그 = 하단 시트, 게이지·입력 sticky bottom. /result 카드 세로 스택.
- 대비: 다크 배경 대비 텍스트 #e6edf3 (AA 충족). 네온 포인트는 상태 신호 전용(색만으로 정보 전달 금지 → 아이콘/텍스트 병기).

## 주의 (리뷰 반영)
- `activedPersona` → **`activePersona`** 로 통일 (PRD m-2).
- mock 데이터는 "실제 인용" 금지 + `[mock]` 배지 노출 (M-5).
- 음성 레이턴시: 면접관 "음…" 필러 즉시 재생 + 부분 스트리밍 (M-1, "첫 토큰 < 2초" 체감 목표).
