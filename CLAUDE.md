# OBA WEEKENDTHON — Season 1

국내 Open API 생태계 1박 2일 빌드 캠프. 후원사들이 API·SDK·MCP·데이터셋·소스코드를 공개하고 빌더가 현장에서 제품을 만든다. 주최측이 **"agentic / 자동 / 하네스"** 를 반복 강조 → 심사 가중치의 핵심 신호.

## 행사 개요
- **일정**: 2026.05.30(토) 10:30 등록, 11:00 시작 ~ 05.31(일) 20:00 (1박 2일)
- **장소**: 카카오 AI 캠퍼스 (경기 용인시 수지구 호수로96번길 7)
- **주최**: Hashed × MarketFitLab × vooy / **주관**: OBA(Open Builders Alliance)
- **공식**: https://oba.run / 개발 가이드(Dev Guide) 페이지 별도
- **인원**: 최대 50명, 1~3인 팀
- **데모/피치**: 1분 내외 (※ 저녁 데모 아님 — 새벽까지 개발 가능, 시간 여유 있음)
- **평가**: 공식 심사위원 50% + 참가자 피어리뷰 50%
- **개발 조건**: 행사 기간 제공 Open API/리소스를 활용한 제품 필수. GitHub/데모 제출 필요할 수 있음.

## 우리 팀
- **WIGTN** — 김현상 · 김진모 · 손상우 (3인)
- 참고 자산: `../zizion-trae/wigent` = Agent Arena (멀티에이전트 토론→생성형 랜딩페이지, Next.js 16/React 19.2/GPT-4o). 멀티에이전트 패턴 재활용 가능.

---

## 🏆 심사 기준 (공식) — 두 트랙 체계

> **환영 주제**: Open API·오픈소스를 활용해 **MVP를 빠르게** 만들기. ⚠️ **"직접 모델 만드는 것"보다 "오픈소스를 활용해 제품 만든 것"이 더 중요** → self-evolving은 "우리가 만든 AI 기술"이 아니라 "OSS/API를 *활용한* 제품"으로 포장해야 함.

### (1) 메인/공통 프라이즈 — 공통심사 50% + 피어리뷰 50%
| 공통심사 (50%) | 피어리뷰 (50%) |
|---|---|
| 기술 완성도 25% | 기술 완성도 25% |
| 실행력 25% | **API·오픈소스 활용도 25%** |
| 상업가능성 25% | **창의성 25%** |
| **API·오픈소스 활용도 25%** | **빌더 임팩트 25%** |

- **API·오픈소스 활용도 = 양쪽 모두 25% → 사실상 이중 가중치(최重)**. 스폰서 API/OSS를 많이·눈에 띄게 써야 함. 자기완결형 AI 데모는 이 점수 안 나옴.
- **창의성(피어 25%)** = "안 뻔함"이 점수 → self-evolving이 창의성 무기.
- **빌더 임팩트(피어 25%)** = 다른 빌더가 탐내거나 영감받는가.
- **전략 함의**: self-evolving(창의성) + **여러 스폰서 MCP/OSS 활용**(활용도 이중) + 돌아가는 MVP(기술완성·실행·상업) + 빌더가 원하는 것(임팩트).

### (2) 스폰서 트랙 어워드 — 각 🥇 100만원 (Nexon/LG U+/GS네오텍/GGUI, 각 트랙 기준 별도 ↓)

---

## ⭐ Premium Sponsors (4) — 별도 트랙 + 시상 (각 🥇 100만원)

### Nexon (넥슨) — 🟡 가상서버 환경 확정 중
- **제공**: 카트라이더 드리프트 **언리얼(Unreal) 패키지** — 소스코드·에셋·빌드도구 일체, **약 350GB**
- **제공 방식**: 용량/고사양 이슈로 **AWS 가상서버**를 빌더 전원에 제공(사전 다운로드 불필요). 맥북·저사양도 가능. 행사 당일 접속 가이드 안내.
- **트랙**: Nexon Track Award — 카트라이더 IP·언리얼 환경 기반 **자유 주제**. "자유로운 결과물" 지향.
- **⚠️ 보안 서약서 필수 (치명적 제약)**: 결과물 권한 중시 → **반출 금지 · 외부 LLM 입력 금지 · 스크린샷 금지** 등 유의 항목 준수.
- **공식**: https://kartdrift.nexon.com
- **컨택**: 김세림 kimsr@nexon.co.kr / 010-9113-8021 · 오세형(팀장) onionmen@nexon.co.kr · 라이선스 openlicense-biz@nexon.co.kr, ejh@nexon.co.kr

### LG U+ — ✅ 바로 사용
- **제공**: EXAONE 오픈 모델(공개, 키·계정 불필요). EXAONE-4.5 on HuggingFace / AWS Bedrock 등 **본인 환경 구동**. LG U+ GPU 인프라(익시젠 등) 미제공.
- **트랙 요건 (둘 다 필수)**: ① 주제 = **Voice AI**(통화·메시지·네트워크 등 Voice 기반 사례) ② **EXAONE 활용 필수**
- **주의**: 트랙 결과물은 **LG U+ 사측 귀속** + 리소스 외부 유출 방지 보안 서약서. 컨택 김동주 010-8435-8100.

### GS네오텍 — ✅ 사전 발급
- **제공**: MISO — AI 에이전트·워크플로우 플랫폼 (참가 등록 이메일로 계정 사전 발급). Document MCP(OCR류) 포함.
- **트랙 조건**: **Sponsor Lightning(5/30 11:30~)에서 직접 안내** ← 확정 전. 컨택 왕성민 wws9785@gsneotek.com (5/30 발표 + 5/31 심사).
- **MISO 심사 힌트(기존)**: 사람이 직접 확인 가능 / Document MCP로 기능·제약 이해 / 승인·검토·예외·책임소재 / 판단·질문·정리·다음행동(agentic) / 다음 API·webhook·schema 제안.

### GGUI — ✅ 바로 사용 (BYOK)
- **제공**: 오픈소스 레포 + MCP 클라우드 서버 + 샘플 코드. 템플릿(에이전트 코드+생성형UI 프레임워크+MCP 도구+프론트) 제공.
- **트랙 주제**: 생성형 UI(Generative UI)를 사용한 **에이전틱 앱 개발**. 에이전트 프레임워크 택일: **Google ADK / Claude Agent SDK / OpenAI Agents SDK**.
- **주된 작업**: 에이전트에 쥐어줄 도구를 **MCP 서버로 개발** (템플릿에 To-do MCP 예시). 프론트/에이전트 코드 자유 수정.
- **⭐ 심사기준 (확정)**: ① 생성형 UI 활용도(컨텍스트에 반응하는 동적 UI인가) ② **멀티턴 일관성**(여러 턴에 걸쳐 UI를 자연스럽게 쓰는가) ③ MCP 도구 사용(생성 UI로 MCP 도구를 잘 쓰는가) ④ 아이디어/완성도(**복잡하고 기능 많은 앱이 에이전틱 앱으로 바뀌어 편리해지는** 경험) 
- **기술**: 범용 MCP-UI 프로토콜. `Agent → ggui server(MCP) → User browser(WebSocket)`. 도구 `ggui_render`/`ggui_update`(~200ms)/`ggui_consume`/`ggui_handshake`.
- **부트스트랩**: `npx @ggui-ai/create-agentic-app@alpha` / **MCP 단독**: `ggui serve --mcp-only` (127.0.0.1:6781/mcp)
- **문서**: https://github.com/ggui-ai/ggui · https://docs.ggui.ai / **컨택**: Chloe·문혜연, 개발자 임완섭 wanseob@loqu.co
- **시사점**: 사용자-에이전트 **멀티턴 대화 + 생성형 UI** 가 핵심 → 자율 시뮬형(자기진화 레이싱)은 약한 적합. **사용자 대면 어시스턴트형**이 정합.

### 메인 스폰서 LLM: OpenAI (트랙 요건 아님, 정렬 가점 성격)

---

## 🎁 API Sponsors (10)
| 후원사 | 리소스 | 상태 |
|---|---|---|
| Delight Labs — maroo | maroo 테스트넷 풀스택(JSON-RPC/WS/Indexer) + Agent Wallet Kit(MCP) | ✅ |
| GenRank | 읽기전용 REST + llms.txt — 카테고리별 AI 추천 합의 랭킹 | ✅ |
| CryptoQuant | Premium API(REST)+MCP — 온체인·시장·거래소 풀 히스토리 | ✅ 키 현장배포 |
| Myrealtrip | 마케팅파트너 API(REST)+MCP — 항공/숙소/투어 | ✅ 사전가입 필요 |
| Rocketpunch | 채용공고·게시물·이벤트 조회/검색 API | ✅ 키 현장배포 |
| 강남언니 | 의료미용(시술·병원) 도메인 MCP Server | ✅ 5 RPS |
| Swing(더스윙) | 택시+공유PM API — 모빌리티(Playground/stage) | ✅ 키 현장배포 |
| tobl.ai | cocoun MCP — AI Agent Democracy Platform | ✅ 셀프 키발급 |
| Moat AI | Tower(Standalone) OSS — Claude Agent SDK 기반 팀 AI OS(Apache 2.0) | ✅ |
| API Fuse | 한국 API 통합 Gateway — 카카오맵/네이버맵/캐치테이블/요기요/기상청/법령 등 16 API·125 ops·단일키·MCP 호환 | ✅ platform.apifuse.ai 셀프가입 |

**agentic/MCP 관점 주목**: ① **API Fuse**(16 API·125 ops 단일키 → 복잡 도메인을 에이전트로 묶기 최적, GGUI 트랙 정합) ② **maroo Agent Wallet Kit**(에이전트가 정책 가드레일 안에서 OKRW 송금 — "agentic 하네스" 그 자체) ③ **tobl.ai cocoun**(멀티에이전트 의회·투표 28 MCP tools → wigent 토론 패턴 직결) ④ **Moat AI Tower**(Claude Agent SDK 기반 팀 AI OS, Apache 2.0 — 스타터 베이스).

---

## 규칙 / 키 관리
- API 키는 **개인 발급** — 팀이라도 각자 발급, 본인 외 공유 금지.
- 키는 `.env` 분리 + `.gitignore` 등록. 공개 레포·SNS·스크린샷 노출 금지. 노출 의심 시 즉시 재발급.
- 사전 준비: 사용할 후원사 가입·키 발급 / MCP 클라이언트(Claude Desktop·Cursor·자체) / BYOK용 본인 LLM 키 / 공식 채널 입장.

## 미확정 / 확인 필요
- **넥슨 보안 서약서 정확한 범위** — 텔레메트리/생성 결과물의 외부 LLM 입력 가부, 데모 시 화면 노출 가부(스크린샷 금지 범위). → 컨택(김세림/오세형) 확인 필요.
- 넥슨 AWS 가상서버 접속 방식(행사 당일 안내).
- 멀티 트랙 동시 제출 가능 여부.
