# 면지(Myunzy) — 아키텍처

> mock-first **듀얼 백엔드** + **포트/어댑터** 구조. 웹 단독으로 데모 완주, Python 에이전트 붙이면 실서비스로 토글.

## 1. 시스템 구성도

```mermaid
flowchart TB
    subgraph BROWSER["🖥️ Browser — Next.js 16 / React 19"]
        SETUP["setup<br/>이력서·공고 업로드"]
        SPAR["spar/:id<br/>실시간 면접 턴·음성"]
        RESULT["result/:id<br/>verdict·자가진화 diff"]
        SETUP --> SPAR --> RESULT
        AUDIO["audio.ts<br/>녹음/재생 · SpeechSynthesis 폴백"]
        SPAR -.-> AUDIO
    end

    subgraph BFF["⚙️ Next.js BFF — web/app/api/v1 · web/lib/bff"]
        ROUTES["routes<br/>sessions · turns · verdict · replay · logs · tts"]
        DISP{"agentClient.ts<br/>isProxy?<br/>(AGENT_SERVICE_URL)"}
        subgraph MOCKENG["내장 TS mock 엔진 (단독 데모)"]
            ME["mockEngine.ts (결정론)"]
            MD["mockData.ts<br/>페르소나·질문뱅크"]
            BST["store.ts (인메모리 세션)"]
            STC["sttClient.ts"]
            TTC["ttsClient.ts"]
        end
        ROUTES --> DISP
        DISP -- "unset" --> ME
        ME --- MD & BST & STC & TTC
    end

    subgraph AGENT["🐍 Python Agent — FastAPI (DeepAgents analog)"]
        MAIN["main.py — §5.1 REST 노출"]
        ENGINE["engine.py — 결정론 턴 컨트롤러<br/>bootstrap→process_turn→verdict→replay"]
        HARNESS["harness.py — tool-call 하네스<br/>Hermes툴·큐레이션·검증·자동재시도"]
        STATE["state.py — 약점신호 분석<br/>weakness_profile (자가진화)"]
        SKILLS["skills.py — 페르소나·STAR·플레이북·길이프리셋"]
        STORE["store.py — 인메모리 세션 (PII 휘발)"]
        CONTRACT["contract.py — pydantic §5.1 계약"]
        PORTS["ports.py — Protocol 포트 + 어댑터<br/>OCR·Job·Rank·Gw·STT·Align·TTS"]
        LLM["llm/ — provider-agnostic<br/>get_llm(): mock ↔ exaone"]

        MAIN --> ENGINE
        ENGINE --> HARNESS & STATE & SKILLS
        ENGINE --> STORE
        ENGINE --> LLM
        ENGINE --> PORTS
        MAIN -.검증.- CONTRACT
    end

    subgraph EXT["☁️ 외부 (스폰서 API / 서비스)"]
        EXAONE["EXAONE<br/>vLLM·Ollama·Bedrock<br/>(LG U+ 트랙, stub)"]
        QWEN["Qwen3 ASR (STT)"]
        RP["Rocketpunch (공고)"]
        GR["GenRank (평판)"]
        AF["API Fuse (게이트웨이)"]
        TTS["TTS 서비스"]
    end

    SETUP & SPAR & RESULT -->|fetch /api/v1/*| ROUTES
    DISP -- "set: HTTP forward()" --> MAIN
    STC -->|서버사이드 호출| QWEN

    LLM --> EXAONE
    PORTS --> QWEN & RP & GR & AF & TTS

    classDef browser fill:#e3f2fd,stroke:#1565c0,color:#0d47a1
    classDef bff fill:#f3e5f5,stroke:#7b1fa2,color:#4a148c
    classDef agent fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20
    classDef ext fill:#fff3e0,stroke:#e65100,color:#bf360c
    class SETUP,SPAR,RESULT,AUDIO browser
    class ROUTES,DISP,ME,MD,BST,STC,TTC bff
    class MAIN,ENGINE,HARNESS,STATE,SKILLS,STORE,CONTRACT,PORTS,LLM agent
    class EXAONE,QWEN,RP,GR,AF,TTS ext
```

**듀얼 백엔드 토글** — `agentClient.ts`의 `isProxy`:
`AGENT_SERVICE_URL` **있으면** Python 에이전트로 HTTP 프록시, **없으면** 브라우저 내장 `mockEngine.ts`로 단독 완주. 두 경로 모두 동일한 §5.1 계약(`types.ts` ≡ `contract.py`)을 지킨다.

## 2. 한 턴의 흐름 (음성 면접)

```mermaid
sequenceDiagram
    participant U as 사용자
    participant BFF as Next BFF
    participant STT as Qwen3 STT
    participant E as engine.process_turn
    participant H as harness
    participant L as LLM (mock/EXAONE)
    participant V as process_verdict

    U->>BFF: 음성 녹음(webm) POST /turns
    BFF->>STT: sttClient (서버사이드, mixed-content 회피)
    STT-->>BFF: {text, wordTimestamps}
    BFF->>E: process_turn(text, ts)
    E->>E: analyze_answer → round_weak_signals 누적
    alt 약점 있고 followups < MAX_FOLLOWUP
        E->>E: 꼬리질문 발사 (isFollowup=true)
    end
    E->>H: tool-call 큐레이션·검증
    H-->>E: (깨지면 자동 재시도 로그)
    E->>L: 면접관 다음 질문
    L-->>E: question
    E-->>BFF: question + stateDelta(압박↑) + passProbability
    BFF-->>U: TTS 음성 + UI 갱신

    Note over U,V: 라운드 종료 시
    U->>V: POST /verdict
    V->>V: weakness_profile before→after diff (자가진화 데모 킬러)
    V->>V: interview_length 소진 → 종료 판정
    V-->>U: scores · timing · moments · 종료여부
```

## 3. 핵심 설계 결정

| 결정 | 무엇 | 왜 (심사/데모) |
|---|---|---|
| **듀얼 백엔드 토글** | `isProxy` — Python 프록시 ↔ 브라우저 mock | 웹 단독 데모 완주 보장 + 키 0개 구동 |
| **포트/어댑터(Protocol)** | `ports.py` 7개 포트, Mock ↔ 실어댑터(`Qwen3Stt`) | 스폰서 API를 한 곳에서 갈아끼움 |
| **LLM provider-agnostic** | `get_llm()` mock ↔ EXAONE (`LLM_PROVIDER`) | EXAONE = LG U+ Voice AI 트랙 자격요건, `exaone.py` 한 파일로 격리 |
| **결정론 엔진 + 하네스** | 점수=순수함수(랜덤 금지), `harness.py` tool-call 검증·재시도 | 주최 강조 "agentic / 하네스" 신호 |
```

