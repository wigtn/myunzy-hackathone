# 면지 에이전트 서비스 (tier 3 — Python / FastAPI)

DeepAgents 미들웨어 스택을 매핑한 면접관 엔진. **mock-first** — EXAONE·외부 키 없이 바로 실행되고,
명세/모델이 도착하면 어댑터만 교체한다. §5.1 REST 계약을 노출하고 web BFF가 1:1 프록시한다.

## 실행 (mock, 키 0개)

```bash
cd agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --reload
```

web 쪽에서 `AGENT_SERVICE_URL=http://localhost:8000` 설정 시 BFF가 이 서비스로 프록시한다.
(미설정이면 web 내장 TS mock으로 단독 동작 — 이중 안전망.)

## 엔드포인트 (§5.1)

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/v1/sessions` | 세션 시작 (multipart: resume/company/role/mode/difficulty) → 부트스트랩 |
| POST | `/api/v1/sessions/{id}/turns` | 1턴 (voice: multipart audio / text: json) → 면접관 응답 |
| POST | `/api/v1/sessions/{id}/verdict` | 라운드 판정 + 자가진화 약점 갱신 |
| POST | `/api/v1/sessions/{id}/replay` | 분기 리플레이 |
| GET | `/api/v1/sessions/{id}` | 세션 스냅샷 |
| GET | `/api/v1/sessions/{id}/logs?since=` | 작업 로그 폴링 |
| GET | `/health` | 헬스 + 현재 LLM provider |

## 구조 (DeepAgents 프리미티브 매핑 — AGENT_ARCHITECTURE.md)

| 파일 | 역할 | DeepAgents analog |
|---|---|---|
| `app/main.py` | FastAPI, §5.1 라우팅 | — |
| `app/engine.py` | 턴 컨트롤러 / 부트스트랩 / verdict / 리플레이 | LangGraph 결정론 컨트롤러 |
| `app/harness.py` | Hermes 14도구 + 검증·재시도 | `wrap_tool_call` |
| `app/skills.py` | 페르소나·프레임워크 플레이북 | SkillsMiddleware (SKILL.md) |
| `app/state.py` | weakness_profile + diff | StateBackend (휘발) |
| `app/ports.py` | 외부 8포트 + mock 어댑터 | tool 어댑터 |
| `app/llm/` | LlmPort + mock + **exaone(실연동 ✅)** + openai(GPT 테스트용) | provider-agnostic model |

## ✅ EXAONE-4.5 연동 (구현 완료)

`app/llm/exaone.py` — EXAONE-4.5-33B(OpenAI 호환 vLLM, Hermes tool-call) 실연동.

```bash
LLM_PROVIDER=exaone uvicorn app.main:app --port 8000
```
`.env`: `EXAONE_BASE_URL=http://<server-host>:12338/v1` · `EXAONE_MODEL=exaone` (명세 §8)

핵심 구현 포인트:
- ⭐ 모든 호출에 `chat_template_kwargs.enable_thinking=false` 강제 → 영어 장황 추론 차단(음성 SLA p95<3초)
- 엔진의 컨텍스트-힌트 dict → OpenAI system+user 메시지로 번역 (페르소나·약점·공고 주입)
  - 질문 생성 호출 = 실 EXAONE (자가진화: R2+는 직전 약점 집중 공략 질문)
  - tool-call 호출 = 로컬 결정론 (엔진이 결과 폐기 → 네트워크 왕복 절감)
- `tool_calls[].function.arguments`는 JSON '문자열' → `json.loads` (패스스루 경로)
- 사고 필드 `message.reasoning`은 무시(노출 금지)
- **EXAONE 장애 시 MockLlmAdapter로 graceful 폴백** → 데모 100% 완주
- (선택) verdict/리플레이 code-as-action 승격은 미적용 — 순수코드 폴백 유지

> 명명 주의: **"PTC" 금지** → "QuickJS code-as-action 하네스". EXAONE에 Anthropic 네이티브 PTC 불가.

## 설계 원칙

- 턴 루프 = 결정론 tool-calling(저지연·고신뢰) / verdict = 순수코드(LLM 없이, 폴백 우선)
- 점수·합격확률 = 결정론 순수함수 (심사 일관성). 랜덤 금지.
- mock 데이터는 `mock=true` 로 표시 → UI `[mock]` 배지 (정직성 = 빌더 임팩트)
- 자가진화: verdict가 weakness_profile 갱신 + round 증가 → 다음 라운드 질문이 직전 약점 공략
