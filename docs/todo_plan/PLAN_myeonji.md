# Task Plan: 면지 (Interview Sparring)

> **Generated from**: docs/prd/PRD_myeonji.md
> **Created**: 2026-05-30
> **Status**: pending
> **Team**: WIGTN (3인) — A(엔진) / B(데이터) / C(프론트·음성)

## Execution Config

| Option | Value | Description |
|--------|-------|-------------|
| `auto_commit` | true | 완료 시 자동 커밋 |
| `commit_per_phase` | true | Phase별 중간 커밋 (해커톤 = 롤백 안전) |
| `quality_gate` | true | /auto-commit 품질 검사 |

## Phases

### Phase 0: 환경 설정 (전원, 토 11:00~)
- [x] Next.js(16)/React 프로젝트 스캐폴딩 + Tailwind (`web/`)
- [x] `.env.example` + `.gitignore` (외부 API 키 슬롯, 절대 커밋 금지)
- [x] 포트 인터페이스 정의 (Ocr/Job/Rank/Gw/Stt/Align/Llm/Tts) + **mock 어댑터** (`agent/app/ports.py`)
- [x] 공통 응답/에러 포맷(§5.1.4), 세션 인메모리 스토어 (TS+Python 양측)

### Phase 1: MVP 코어 — 텍스트 면접 E2E (토 오후~밤)
- [x] [B] 세션 부트스트랩: OCR 파싱(mock) → 채용공고/평판 수집(mock) (FR-002, FR-003)
- [x] [B] Fit Gap 에이전트 → 공격 포인트 (FR-004)
- [x] [B] 페르소나 빌더 (기술/컬처핏/임원/HR) (FR-005)
- [x] [A] 도구호출 하네스 (큐레이션·검증·재시도·단일스텝·로그방출) (FR-008) — `agent/app/harness.py`
- [x] [A] 상대역 상태기계 + 텍스트 응답 (FR-007)
- [x] [A] 피드백 엔진: 점수+프레임워크+Fit Gap 리포트 (FR-014) — 순수코드 verdict
- [x] [C] 화면 셸 `/` `/setup` `/spar` `/result` + 에이전트 작업 로그 패널 (FR-012)
**Deliverable**: ✅ 업로드→면접관 자동생성→텍스트 면접→근거 피드백 완주 (E2E 검증 완료, mock+Python 양 경로).
**비고**: EXAONE 실연동(EXT-LLM)만 stub — 팀원 담당 (`agent/app/llm/exaone.py`).

### Phase 2: 음성 + 데모 킬러 (토 밤~일 오전)
- [x] [C] MediaRecorder→STT(mock) + TTS(mock, SpeechSynthesis 폴백) 재생 (FR-006, FR-009)
- [x] [A] 대화 중 라이브 툴콜 디스패처 (FR-010)
- [x] [B] 포스 얼라이너(mock)→타임스탬프 머뭇거림 지표 (FR-013)
- [x] [A] 세션 내 자가진화 루프 + 에스컬레이션 (FR-011, FR-017) — before/after diff 가시화
- [x] [C] 합격 확률 게이지 (FR-015)
- [x] [A/C] 분기 리플레이 (FR-016) ⭐
**Deliverable**: ✅ 음성 압박면접 + 자가진화 + "이 답변 다시" + 실시간 게이지/로그.
**비고**: code-as-action(QuickJS) 승격은 EXAONE 경로 enhancement로 보류 — 순수코드 폴백이 데모 완주 보장.

### Phase 3: 실연결 + 확장 (일 오전~)
- [ ] 명세 도착 API부터 mock→실어댑터 교체, 레이턴시 튜닝
- [ ] 안전장치(위기 신호 카드) (FR-019)
- [ ] (여유) 성장 엔진/이력 (FR-020, FR-018), GGUI 보너스

### Phase 4: 데모 마무리 (일 오후)
- [ ] mock 폴백 경로 무조건 보장 (데모 사고 방지)
- [ ] 데모 컷 시트대로 리허설 + 1분 피치 연습
- [ ] 레이턴시/카피 폴리시

## Progress
| Metric | Value |
|--------|-------|
| Total Tasks | Phase 0~2 완료 (EXAONE stub 제외) |
| Current Phase | Phase 3 (실연결) / EXAONE 연동 대기 |
| Status | MVP+킬러 데모 동작 (mock-first), 빌드·E2E 검증 |

## Execution Log
| Timestamp | Phase | Task | Status |
|-----------|-------|------|--------|
| 2026-05-31 | 0 | web 스캐폴딩 + 디자인토큰 + 계약/스토어/포트 | ✅ |
| 2026-05-31 | 1 | BFF §5.1 + TS mock 엔진 + 4페이지 + AgentLogPanel | ✅ (typecheck+build+E2E) |
| 2026-05-31 | 1·2 | Python 에이전트 서비스 (하네스/엔진/포트/플레이북, mock LLM) | ✅ (import+E2E) |
| 2026-05-31 | 2 | 음성(mock STT/TTS)·자가진화 diff·게이지·분기 리플레이 | ✅ |
| 2026-05-31 | - | BFF↔Python 프록시 스왑 통합 검증 | ✅ |
| - | 3 | EXAONE 실연동 (`agent/app/llm/exaone.py`) | ⏳ 팀원 |
| - | 3 | 외부 실어댑터 교체 (명세 도착 시) | ⏳ |
