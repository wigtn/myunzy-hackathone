# 03 · Screen Spec — 면지 (面zy)

> **Source**: PRD §5.4.1 (상태) + §3 (FR) + §5.1 (API 계약)
> **Style**: Command Center (Dark Technical) — 다크 bg, 모노스페이스 악센트, 네온 포인트
> **Lo-fi 원칙**: 레이아웃·상태·카피 검증용. 실제 비주얼 디자인 아님.

## Design Tokens (공통)

| 토큰 | 값(가이드) | 용도 |
|------|-----------|------|
| `bg/base` | #0a0e14 | 페이지 배경 |
| `bg/panel` | #0d1117 | 패널/카드 |
| `bg/elev` | #161b22 | 입력·말풍선 |
| `border` | #30363d | 구분선 |
| `text/hi` | #e6edf3 | 주요 텍스트 |
| `text/lo` | #8b949e | 보조 텍스트 |
| `accent/ok` | #39d353 (네온그린) | 성공·done·합격확률 fill |
| `accent/run` | #2f81f7 (블루) | 진행중·툴콜 |
| `accent/warn` | #d29922 (앰버) | 압박/경고/mock 배지 |
| `accent/err` | #f85149 (레드) | 에러 |
| `font/mono` | ui-monospace, "JetBrains Mono" | 로그·라벨·수치 |
| `font/sans` | Pretendard, system-ui | 본문·말풍선 |

---

## P1. `/` — 랜딩

- **Audience**: guest, author · **Auth**: Optional · **FR**: FR-001
- **활성 상태**: `success` (단일)

### Layout
풀스크린 히어로. 중앙 정렬, 다크 + 미세 그리드 배경. 상단 좌측 로고 `면지`.

### Components
| 컴포넌트 | 명세 |
|----------|------|
| `Logo` | `면지` 워드마크 + `面zy` 서브 (mono) |
| `Hero.headline` | H1, 1줄 가치 제안 |
| `Hero.sub` | 1줄 보조 설명 |
| `HowItWorks` | 3스텝 칩: ①이력서 업로드 ②AI 면접관 자동생성 ③압박 면접+근거 피드백 |
| `CTA.primary` | "면접 시작하기" → `/setup` |
| `SponsorStrip` | (선택) EXAONE·MISO 등 활용 스택 미니 배지 |

### Microcopy
- headline: **"한 번뿐인 면접, 실전처럼 미리 겪어라."**
- sub: "내 이력서와 실제 채용공고로 만들어진 AI 면접관과 음성으로 모의면접 → 머뭇거림·근거까지 짚는 피드백."
- CTA: "면접 시작하기"

### Responsive
- Desktop: 히어로 중앙, 3스텝 가로 배치.
- Mobile(≤375): 3스텝 세로 스택, CTA full-width sticky bottom.

---

## P2. `/setup` — 업로드 + 컨텍스트 입력

- **Audience**: guest, author · **Auth**: Optional · **FR**: FR-001~005, FR-022(동의)
- **활성 상태**: `loading`, `error`, `success`
- **API**: `POST /api/v1/sessions` (multipart: resume, company, role, mode, difficulty)

### Layout
2단: 좌측 입력 폼 / 우측 `AgentLogPanel`(부트스트랩 중 활성화). 생성 전엔 우측 placeholder("에이전트 대기 중").

### Components
| 컴포넌트 | 명세 / Validation |
|----------|-------------------|
| `Dropzone.resume` | pdf/png/jpg, ≤10MB. drag&drop + 파일선택. 필수. 초과 시 413 인라인. |
| `Input.company` | text, 필수, 1~40자. 공란 시 하이라이트. |
| `Input.role` | text, 필수, 1~40자. |
| `Toggle.mode` | `음성` / `텍스트` 세그먼트. default 음성. |
| `Select.difficulty` | 1~3 (압박 강도), default 1. |
| `Checkbox.consent` | **녹음·이력서 처리 동의** (FR-022). 미체크 시 제출 비활성. |
| `Btn.start` | "면접관 생성" → POST. 로딩 중 비활성 + 스피너. |
| `AgentLogPanel` | 부트스트랩 스텝 라이브: `ocr.parse`→`job.search`→`fitgap.analyze`→`persona.build`, 각 status dot + `[mock]` 배지. |

### States · Microcopy
| 상태 | UI | 카피 |
|------|----|------|
| `success`(초기) | 폼 활성, 우측 placeholder | "이력서를 올리면 면접관이 만들어집니다." |
| `loading` | 폼 잠금 + 작업로그 진행 | step별: "이력서 분석 중…", "채용공고 조회 중…", "약점 분석 중…", "면접관 생성 중…" |
| `error`(413) | 드롭존 레드 보더 | "파일이 너무 큽니다(최대 10MB). 다른 파일을 올려주세요." |
| `error`(422 OCR) | 드롭존 레드 + 재시도 | "이력서를 읽지 못했어요. 다른 형식(PDF 권장)으로 다시 올려주세요." |
| `error`(503) | 상단 배너 | "일부 데이터 소스가 불안정해요. mock으로 계속 진행합니다." + `[mock]` |
| 동의 미체크 | 버튼 disabled + 헬프텍스트 | "진행하려면 녹음·이력서 처리에 동의해 주세요." |

### Responsive
- Desktop: 2단(폼 60% / 로그 40%).
- Mobile: 폼 단독 → 제출 시 작업로그가 폼 위로 오버레이(풀스크린 진행).

---

## P3. `/spar/[sessionId]` — 면접 진행 ⭐핵심

- **Audience**: guest, author · **Auth**: Optional · **FR**: FR-006~012, 015, 017
- **활성 상태**: `loading`, `error`, `success`
- **API**: `POST /turns`, `POST /verdict`

### Layout (3-zone Command Center)
```
┌────────────────────────────┬───────────────────┐
│ [Persona tabs: 기술|임원]    │ ▸ AGENT LOG        │  ← 우측 패널
│                            │  harness.validate ✓│
│  대화 스트림 (말풍선)        │  tool.lookup ◍     │
│  · 면접관 ↔ 사용자           │  evolve.diff ▲     │
│                            │  [mock] 배지        │
├────────────────────────────┴───────────────────┤
│ 합격확률 ▓▓▓▓░░ 42%   [● 녹음] / [텍스트 입력]    │  ← 하단 바
└──────────────────────────────────────────────────┘
```

### Components
| 컴포넌트 | 명세 |
|----------|------|
| `PersonaTabs` | 활성 페르소나 표시 (데모: 기술/임원 2개, M-4). 전환 시 톤 변화 라벨. |
| `ChatStream` | 말풍선: 면접관(좌, 페르소나 아바타+이름), 사용자(우). 면접관 말풍선에 인용 출처 칩(`lookup_job_posting`). |
| `ToolCallChip` | 면접관 발화 내 라이브 툴콜 표시: "📄 채용공고 필수요건 조회". mock이면 `[mock]`. |
| `AgentLogPanel` | turn별 하네스 스텝 라이브. `harness.validate`(재시도 시 ↻ 표시), `tool.*`, `evolve.diff`. |
| `EvolveDiff` | 자가진화 diff 카드 (라운드 종료 시): "R1 두루뭉술 0.7 → R2 정량근거 강제". 1R↔2R 질문 대비. |
| `PassGauge` | 합격확률 바(0~100%), 턴마다 애니메이션. 산출=점수 가중합(결정론). |
| `RecordBtn` | 음성 모드: 녹음 토글(파형 표시). 권한 거부 시 텍스트 폴백. |
| `TextInput` | 텍스트 모드 or 폴백: 입력+전송. |
| `RoundCtrl` | "라운드 종료" → verdict / "다음 라운드" |
| `StateHud` | 면접관 상태 미니: mood·pressure(앰버 게이지)·hiddenAgenda dot |

### States · Microcopy
| 상태 | UI | 카피 |
|------|----|------|
| `loading`(세션 부팅/턴 처리) | 말풍선 타이핑 dots + 작업로그 진행 | 면접관 "음…" 필러 즉시 재생(M-1 체감 레이턴시) |
| `success` | 대화 진행 | — |
| `error`(STT 422) | 입력바 레드 토스트 | "잘 못 들었어요. 다시 말씀해 주시거나 텍스트로 입력하세요." + 텍스트 노출 |
| `error`(마이크 거부) | 모달 | "마이크 권한이 필요해요. 텍스트 모드로 계속할까요?" |
| `error`(503) | 작업로그 `[mock]` + 배너 | "실시간 조회가 불안정해 일부는 예시 데이터로 진행합니다." |

### Responsive
- Desktop: 3-zone(대화 65% / 로그 35%, 하단 바 고정).
- Mobile: 대화 풀스크린 + 작업로그는 하단 시트(swipe-up)로 접근, 게이지·녹음 sticky bottom.

---

## P4. `/result/[sessionId]` — 판정 + 분기 리플레이

- **Audience**: guest, author · **Auth**: Optional · **FR**: FR-014, 016, 018
- **활성 상태**: `loading`, `error`, `success`
- **API**: `POST /verdict`(생성), `POST /replay`(분기)

### Layout
상단 다차원 점수 레이더/바 → 타이밍 지표 → 프레임워크 위반 → Fit Gap 리포트 → moments 타임라인(분기 진입점).

### Components
| 컴포넌트 | 명세 |
|----------|------|
| `ScoreCard` | 5축: 목표달성/근거력/감정조절/타이밍/단호함 (0~1 → 막대/레이더). |
| `TimingMetrics` | avgResponseDelaySec·longestPauseSec·wordsPerSec·fillerCount. "3.8초 망설인 뒤 사과" 하이라이트. |
| `FrameworkCard` | name(STAR/역량면접) + violations 리스트("STAR 구조 누락", "정량 성과 미제시"). |
| `FitGapReport` | covered ✓ / stillWeak ✗ (이력서↔JD). |
| `MomentTimeline` | round·atSec·label·quote. 각 항목 "이 답변 다시" 버튼. |
| `ReplayPanel` | 선택 moment 대안 입력 or "AI 모범안". 결과: 원본 vs 분기 좌우 비교 + `passProbabilityDelta` 강조. |
| `Btn.retry` | "다시하기" → `/spar` |
| `Btn.home` | "처음으로" → `/` |

### States · Microcopy
| 상태 | UI | 카피 |
|------|----|------|
| `loading` | 스켈레톤 카드 + "얼라인·판정 생성 중…" | 얼라이너 후처리 진행 표시 |
| `success` | 전체 카드 노출 | summary 한 줄 총평 상단 배치 |
| `loading`(부분, 리플레이) | ReplayPanel 내 스피너 | "그 순간을 다시 시뮬레이션 중…" |
| `error`(replay 실패) | ReplayPanel 토스트 | "리플레이 생성 실패. 다시 시도해 주세요." |

### Responsive
- Desktop: 점수+타이밍 2단, moments 타임라인 하단 폭full, 리플레이 좌우 비교.
- Mobile: 전 카드 세로 스택, 리플레이 비교는 탭 전환(원본/분기).

---

## 상태 커버리지 체크 (§5.4.1 대비)

| Route | loading | error | success | empty | no-perm |
|-------|:---:|:---:|:---:|:---:|:---:|
| `/` | — | — | ✓ | — | — |
| `/setup` | ✓ | ✓ | ✓ | — | — |
| `/spar/[id]` | ✓ | ✓ | ✓ | — | — |
| `/result/[id]` | ✓ | ✓ | ✓ | — | — |

→ 모든 활성 상태에 마이크로카피 명세됨. ✅
