# 면지 에이전트 아키텍처 설계

> **기반**: DeepAgents 미들웨어 스택 + code-as-action(QuickJS) / 모델 = EXAONE
> **상위 문서**: docs/prd/PRD_myeonji.md (§5.3 아키텍처 구체화)
> **상태**: 채택 (팀 LangGraph/DeepAgents 가능자 보유 → 정식 채택)

## 0. 한 줄 요지
면접관 엔진을 **DeepAgents 미들웨어 스택** 위에 올린다. "PTC"는 Anthropic 네이티브 기능이므로 쓰지 않고, **langchain-quickjs `CodeInterpreterMiddleware` 기반 code-as-action 패턴**으로 구현한다. **인터랙티브 턴 루프 = 결정론적 tool-calling**, **verdict/스코어링만 code-as-action**으로 분리하는 것이 핵심 설계 결정.

## 1. PRD 차별점과의 1:1 대응
면지의 차별점은 모델 무게가 아니라 **하네스**다. 작은 한국어 오픈모델(EXAONE)이 도구 위에서 끝까지 일관되게 압박·평가·진화함을 증명하는 것이 목표이고, DeepAgents 미들웨어 구조가 이 목표의 네 축과 거의 1:1로 대응한다.

1. **하네스(FR-008) = 미들웨어 라이프사이클 훅** — `before_agent` / `wrap_model_call` / `wrap_tool_call`. 스키마 검증+자동 리프롬프트는 `wrap_tool_call`, 페르소나/상태 주입은 `wrap_model_call`, 작업 로그 방출(FR-012)은 LangGraph 스트리밍 이벤트로 자연 노출. **별도 하네스 코드를 직접 짜지 않고 미들웨어 한 겹으로 캡슐화.**
2. **플레이북 = SkillsMiddleware progressive disclosure** — 시작 시 스킬 metadata(name·description)만 주입, 필요 판단 시 `read_file`로 SKILL.md 본문 on-demand 로드. 기술/컬처핏/임원/HR 페르소나 + STAR·역량면접 프레임워크를 각각 SKILL.md 한 장으로 → **부록 A 확장 전략("시나리오=플레이북 한 벌, 엔진 불변")이 구조적으로 참**. 연봉협상(BATNA/ZOPA)·컴플레인(LAST)은 SKILL.md만 추가.
3. **세션 휘발 weakness_profile(FR-011) = ephemeral StateBackend** — `weakness_profile.json`을 StateBackend에 둠. 라운드 종료 시 `update_weakness_profile`로 갱신, 다음 라운드 시작 시 읽어 페르소나 전략 조정. **before/after diff = 이 파일의 diff** → 데모 킬러 시각화. 휘발성이 PII 세션 폐기 요건과도 일치.
4. **세션 부트스트랩(FR-002~005) = subagent 병렬 수집** — 부모가 `write_todos`로 계획, OCR·JD·평판 조회를 격리 컨텍스트 subagent로 spawn해 병렬 수집 후 Fit Gap 합성. 부트스트랩 10초 SLA 완화 + **"자동 수집→갭 분석→페르소나 생성"이 작업 로그에 펼쳐지는 게 최강 agentic 시각 신호.**

## 2. 명명 교정 — PTC ❌ → code-as-action ✅
네이티브 **PTC(Programmatic Tool Calling)는 Anthropic 전용**(Claude가 Code Execution 샌드박스에서 코드로 tool 호출, 컨테이너 ~4.5분 만료). 면지 모델은 **EXAONE(LG U+ 트랙 자격요건)** 이라 네이티브 PTC를 못 붙인다. **발표에서 "PTC 쓴다"고 하면 카테고리 오류.**

해법 = 기능이 아니라 **패턴**. langchain-quickjs `CodeInterpreterMiddleware`는 QuickJS를 **in-process 코드실행 샌드박스**로 래핑 → 모델 무관 code-as-action 실행면 제공. DeepAgents는 provider-agnostic이라 vLLM/Ollama/Bedrock로 서빙한 EXAONE에 그대로 적용. in-process라 원격 샌드박스·컨테이너 수명 문제 없음.

| 잘못된 명명 | 정확한 명명 |
|---|---|
| "PTC를 쓴다" | **"QuickJS 기반 code-as-action 하네스"** |
| "Anthropic 코드실행 기능" | **"langchain-quickjs `CodeInterpreterMiddleware` (in-process 샌드박스)"** |

→ "작은 한국어 오픈모델이 generic code-as-action 하네스에서 일관 동작"이 "벤더 기능을 켰다"보다 **피어리뷰(빌더 임팩트)에 훨씬 강함.**

## 3. 핵심 설계 결정 — 턴 루프와 verdict 분리
EXAONE이 매 턴 올바른 JS 오케스트레이션 코드를 작성하는 것은 단일 tool-call JSON보다 훨씬 어렵고, 무대 p95<3초 + 100% 완주가 걸린 구간. **code-as-action을 턴 루프에 욱여넣으면 신뢰도 리스크 큼.** 구간별로 가른다.

| 구간 | 실행 방식 | 근거 |
|---|---|---|
| **인터뷰 턴 루프 (FR-008~010)** | Hermes tool-call + `wrap_tool_call` 검증·재시도 | 저지연·고신뢰. 결정론 상태기계가 턴 구동, LLM은 다음 질문 생성 + 큐레이션 도구 호출만 |
| **verdict/스코어링 (FR-013~014)** | code-as-action (QuickJS) | word-timestamp 집계·filler·WPS·머뭇거림 = LLM 추론 아닌 **결정론 데이터 변환**. 후처리 1회라 지연 비민감 |
| **분기 리플레이 (FR-016)** | code-as-action + **순수코드 폴백** | 데모 클라이맥스. 실패 시 순수 코드 경로로 폴백 보장 |

> **원칙**: DeepAgents를 **턴 드라이버로 쓰지 말고 미들웨어 툴박스로** 쓴다. 턴은 얇은 **LangGraph 결정론 컨트롤러**가 몰고, DeepAgents에서는 SkillsMiddleware(플레이북)·subagents(부트스트랩)·StateBackend(weakness profile)·`wrap_tool_call`(검증)만 빌려온다. → 성공지표(상태 위반 0, tool-call 유효율 >99%) 안정 달성.

## 4. PRD 요구사항 → DeepAgents 프리미티브 매핑

| PRD 요구사항 | DeepAgents 프리미티브 | 비고 |
|---|---|---|
| FR-008 상태기계+하네스 | `wrap_tool_call`(검증·재시도), `wrap_model_call`(상태·페르소나 주입) | 턴 구동은 외부 LangGraph 상태기계 |
| FR-005 멀티 페르소나 | SkillsMiddleware (페르소나 = SKILL.md) | progressive disclosure on-demand |
| FR-010 라이브 툴콜 | 큐레이션 5~8개 도구 + tool 어댑터(포트) | 단일 턴 = 단일 도구 |
| FR-011 세션 내 자가진화 | StateBackend `weakness_profile.json` | before/after = 파일 diff |
| FR-002~005 부트스트랩 | subagents(task tool) + `write_todos` | 격리 컨텍스트 병렬 수집 |
| FR-012 작업 로그 패널 | LangGraph 스트리밍 이벤트 + 미들웨어 훅 로그 | LangSmith 트레이싱으로 관측 보강 |
| FR-013~014 verdict | `CodeInterpreterMiddleware` (QuickJS) | 스킬 번들 스크립트 import해 집계 |
| FR-016 분기 리플레이 | code-as-action + 순수코드 폴백 | 데모 클라이맥스 |
| 부록 A 도메인 확장 | SkillsMiddleware (SKILL.md 추가) | 엔진 불변, 콘텐츠만 추가 |

> 플레이북 SKILL.md는 본문 옆에 스크립트(JS/TS) 동봉 가능, 인터프리터에서 모듈 import. 예: `check_answer_quality`·`update_weakness_profile`·`generate_verdict`를 스킬 번들 스크립트로 두고 verdict 단계에서 QuickJS가 import.

## 5. 배포 구조 (3-tier 폴리글랏)
DeepAgents 본체는 Python 라이브러리. PRD §5.3은 Next/serverless + TS 포트. 두 세계를 섞지 말고 **에이전트 오케스트레이터만 별도 Python 서비스(FastAPI)** 로 떼서 기존 §5.1 REST 계약 뒤에 둔다.

```
[브라우저 웹앱 (Next/React)]
   │  HTTPS / (선택)WS — 키 없음
   ▼
[BFF / Next API (서버리스 프록시)]
   │  내부 REST (§5.1 계약 그대로)
   ▼
[에이전트 서비스 (Python / FastAPI + DeepAgents)]
   ├─ LangGraph 턴 컨트롤러 (결정론 상태기계)
   ├─ 미들웨어: Skills / Subagents / wrap_tool_call(검증) / StateBackend
   ├─ CodeInterpreterMiddleware (QuickJS) — verdict/리플레이 전용
   └─ 어댑터(포트): Ocr/Job/Rank/Gw/Stt/Align/Llm(EXAONE)/Tts
   │  키 env 보관 후 호출
   ▼
[외부 API: MISO · Rocketpunch · API Fuse · GenRank · Qwen3-ASR · 포스얼라이너 · EXAONE · TTS]
```

이점: **mock-first 병렬 개발이 안 깨짐.** 프론트는 §5.1 REST/mock에 계속 작업, 에이전트 서비스 내부가 mock→실어댑터로 바뀌어도 계약면 불변. (DeepAgents.js도 있으나 1박2일 성숙도 리스크 회피 위해 **Python 경로 권장**.)

## 6. 구현 단계 & 디리스킹
가장 큰 novelty 리스크 = **"EXAONE × code-as-action"** → 데모 크리티컬 패스를 이 리스크에서 떼어낸다.

**Phase 1 (데모 코어 — 검증된 경로만)**
- LangGraph 턴 컨트롤러 + `wrap_tool_call` 검증·재시도 (FR-008)
- SkillsMiddleware로 페르소나·프레임워크 플레이북 로딩 (FR-005)
- EXAONE 실연동 (Ollama/vLLM) + Hermes tool 파싱
- 부트스트랩 subagent 병렬 수집 + StateBackend weakness_profile
- **verdict = 순수 코드(LLM 없이)** 로 타이밍 지표 집계 — 폴백 경로 먼저 확보
- 데모 합격선 실연동: EXAONE + MISO(OCR) + Tier-A 택1

**Phase 2 (code-as-action 도입 = enhancement)**
- verdict/리플레이를 QuickJS `CodeInterpreterMiddleware`로 승격 (FR-014, FR-016)
- 음성 입출력(STT/TTS) + 라이브 툴콜 (FR-010)
- 자가진화 before/after diff 패널 + 합격확률 게이지

> **원칙**: code-as-action(QuickJS)은 **데모 크리티컬 패스가 아닌 곳에 먼저** 들어가고, **항상 순수 코드 폴백** 보유. EXAONE이 코드 생성에 실패해도 데모는 폴백으로 100% 완주.

## 7. 정리
- **채택**: 면접관 엔진 = DeepAgents 미들웨어 스택 (하네스/플레이북/자가진화/부트스트랩 1:1 대응)
- **교정**: "PTC" → "QuickJS code-as-action" (EXAONE에 네이티브 PTC 불가, 패턴이 빌더 임팩트도 강함)
- **분리**: 턴 루프 = 결정론 tool-calling / verdict = code-as-action
- **배포**: 에이전트만 Python 서비스로 떼어 §5.1 REST 계약 뒤에, mock-first 유지
- **디리스킹**: code-as-action = enhancement + 폴백. 데모 크리티컬 패스는 검증된 tool-calling만 의존
