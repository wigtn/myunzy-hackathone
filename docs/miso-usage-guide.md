# MISO 사용법 가이드 — 면지 이력서 OCR 워크플로 만들기

> 대상: 면지 OCR(`Ocr` 어댑터)을 MISO에서 직접 만드는 사람
> 짝 문서: API 연동·코드는 `docs/api-integration.md` **Part A**. 이 문서는 그 **앞단계(콘솔에서 앱 만들기)** 다.
> 핵심: MISO는 **Dify 기반**이라 화면·노드가 Dify와 같다. 아래는 Dify 노드 기준으로 정확히 적었다.

---

## 0. 한눈에 — 뭘 만드나

면지에서 MISO가 할 일은 딱 하나: **이력서 파일(PDF/이미지) → 텍스트 + 구조화 JSON**.
이걸 MISO 콘솔에서 **Workflow 앱** 하나로 만들고, **API 키**를 받아 면지 백엔드가 호출한다.

```
[이력서 파일] → (MISO Workflow 앱) → { text: "원문", profile: {이름,경력,스킬...} }
                     ↑ 이 문서가 만드는 것          ↑ 면지가 Fit Gap·페르소나에 사용
```

> ⚠️ **가장 중요한 함정 먼저**: MISO(Dify)의 **"Document Extractor(문서 추출)" 노드는 텍스트 PDF·DOC만 읽고, 스캔 이미지·사진 이력서는 OCR을 못 한다**(PDF도 "텍스트 레이어"만 추출). 이미지 이력서까지 받으려면 **비전(Vision) LLM 노드**를 써야 한다. → §3에서 두 가지 구성 제시.

---

## 1. 로그인 (계정)

- MISO 계정은 **참가 등록 이메일로 사전 발급**된다(CLAUDE.md 기준, GS네오텍). 우리 팀 계정은 등록 이메일(`contact@wigtn.com` 등)로 확인.
- 로그인 후 들어오는 화면 = 앱(스튜디오) 목록. 여기서 새 앱을 만든다.
- 막히면 GS네오텍 컨택: 왕성민 wws9785@gsneotek.com.

---

## 2. 앱 만들기 — 왜 "Workflow"인가

MISO에서 앱 만들 때 보통 **Agent(대화형)** vs **Workflow(파이프라인)** 중 고른다.

| 타입 | 성격 | 면지 OCR에 맞나 |
|---|---|---|
| Agent / Chatflow | 사용자와 여러 턴 대화 | ✗ (OCR은 대화 불필요) |
| **Workflow** | 입력 1회 → 노드 통과 → 출력 1회 | ✅ **이걸 선택** |

→ **"처음부터 만들기(Create from Blank)" → Workflow** 선택. 이름 예: `myeonji-resume-ocr`.

---

## 3. 워크플로 노드 구성 (핵심)

워크플로는 **노드를 선으로 잇는** 방식이다. 시작 → (추출/이해) → 끝.

### 3-1. 시작 노드 (Start) — 입력 변수 정의

시작 노드에 **입력 변수 1개**를 추가한다:

| 변수명 | 타입 | 설정 |
|---|---|---|
| `resume` | **파일 리스트(File List)** | 허용 형식: 이미지(`png/jpg/jpeg/webp`)(+`pdf`) / 최대 5개 / 로컬 업로드 |

> **다중 파일 지원**: 지원자는 보통 이력서+자소서+경력기술서 등 **여러 문서**를 낸다 → `resume`는 **파일 리스트**로 둔다. API 호출 시 `inputs.resume`는 **파일 객체 배열**로 나가며(`files/upload`를 파일당 1회 호출 → id 배열), 단일 파일 객체 케이스와 구분된다(api-integration.md §A-5 폴백 참고).
> LLM 비전이 리스트를 바로 받으면 한 번에 처리(구성 0/A), 단일 이미지만 받으면 **반복(Iteration) 노드**로 파일별 OCR 후 집계한다(구성 C, §3-2).

### 3-2. 가운데 — OCR 처리 (MISO 도구 모음 활용)

> ✅ **확인됨**: MISO "도구 모음"에 OCR 도구가 내장돼 있다. CLAUDE.md의 "Document MCP(OCR류)" = 이 도구들. 면지 OCR엔 **전용 OCR 도구**가 비전 LLM 단독보다 정확하다.

| 도구 | 제공 | 비고 |
|---|---|---|
| **Clova OCR** ⭐ | GS Neotek | 네이버 Clova, **한국어 문서·이력서 정확도 최고**. 활성화 필요(네이버 클라우드 키 가능성). **GS 인증 도구 → 트랙 점수↑** |
| Upstage | 52g | OCR, 문서구조/글자 특화. 대안 |
| ImageAnalyzer | 52g | 비전 LLM. **기본 활성화(키 불필요) → 즉시 사용 가능** |
| 파일업로더 | 52g | 워크플로 파일 입력 보조 |

**▶ 구성 0 (최적, 권장): 전용 OCR 도구 + LLM 구조화**
```
[Start: resume(File)] → [Clova OCR 도구] → [LLM: 텍스트→JSON 구조화] → [End: text, profile]
```
- Clova OCR 활성화 → 도구(Tool) 노드로 추가 → 이미지·PDF 모두 한국어 정확 추출.
- 키 없거나 급하면 **ImageAnalyzer**(기본 활성화)로 대체, 또는 아래 구성 A(비전 LLM).

**▶ 구성 A (대안, 이미지+PDF 모두 처리): 비전 LLM 한 방**

```
[Start: resume] → [LLM (비전 모델)] → [End]
```

- LLM 노드에서 **멀티모달(비전) 모델** 선택 (MISO가 제공하는 GPT/Gemini/Claude 계열 중 이미지 입력 지원 모델).
- LLM 노드의 **비전/파일 입력**에 `resume` 파일 변수를 연결.
- 프롬프트로 "이미지/PDF를 읽어 원문 텍스트와 구조화 JSON을 내라"고 지시(§3-3).
- 장점: 스캔 이미지든 텍스트 PDF든 **한 노드로** 처리, OCR+구조화 동시. 면지 데모에 가장 단순·강건.

**▶ 구성 B (텍스트 PDF만, 더 싸고 빠름): 추출 → 정리**

```
[Start: resume] → [Document Extractor] → [LLM (텍스트 모델)] → [End]
```

- Document Extractor가 PDF/DOC의 **텍스트 레이어**를 뽑음(이미지·스캔본 ✗).
- 그 텍스트를 LLM 노드가 구조화 JSON으로 정리.
- 장점: 비전 모델보다 저렴·빠름. 단점: **사진/스캔 이력서 불가**.

**▶ 구성 C (다중 파일이 비전 리스트로 안 들어갈 때): 반복 + 집계**

```
[Start: resume(파일 리스트)] → [반복(Iteration): resume 순회]
                                   └ 내부: [LLM 비전: 파일 1장 → 텍스트]
                              → [변수 집계(Variable Aggregator): 파일별 텍스트 합치기]
                              → [LLM: 합친 텍스트 → JSON 구조화] → [End: result]
```

- 비전 이미지 변수가 **단일 이미지만** 받는 버전일 때 사용. 반복 노드가 파일을 하나씩 OCR → 결과를 모아 마지막에 한 번 구조화.
- 파일 수가 많거나 종류가 섞여도(이력서+자소서+경력서) 안정적.
- 단점: 호출 수 = 파일 수만큼 늘어 느림·비용↑. **2~5장이면 구성 0/A의 리스트 직결을 먼저 시도**하고, 비전이 리스트를 거부할 때만 구성 C.

> **추천 순서**: ① 구성 0(Clova/ImageAnalyzer 도구) 또는 A(비전 LLM)에 **파일 리스트 직결** → ② 비전이 리스트 거부하면 구성 C(반복). 텍스트 PDF만 확실하면 구성 B.

### 3-3. LLM 노드 프롬프트 (구조화 JSON 뽑기)

LLM 노드 시스템 프롬프트 예시 (구성 A/B 공통, 구성 A는 "첨부 파일/이미지를 읽고"를 추가):

```
너는 이력서 파서다. 첨부된 이력서를 읽고 아래 JSON만 출력해라. 설명/마크다운 금지.
{
  "text": "<이력서 전체 원문 텍스트>",
  "profile": {
    "name": "<이름 또는 null>",
    "years": <총 경력 연수 정수 또는 null>,
    "skills": ["<핵심 스킬>", ...],
    "companies": ["<재직 회사>", ...],
    "education": "<최종 학력 또는 null>",
    "summary": "<3줄 요약>"
  }
}
```

> 출력 JSON 안정화 팁: LLM 노드의 출력 형식을 **JSON 모드/구조화 출력**으로 켜고, 온도(temperature)는 낮게(0~0.3).

### 3-4. 끝 노드 (End) — 출력 변수

End 노드에서 **출력 변수**를 워크플로 바깥으로 내보낸다. 면지 코드가 읽을 이름과 **정확히 일치**시킨다:

| 출력 변수 | 소스 | 면지 사용 |
|---|---|---|
| `text` | LLM 출력의 `text` | 이력서 원문 |
| `profile` | LLM 출력의 `profile`(JSON) | Fit Gap·페르소나 |

> LLM이 문자열로 JSON을 뱉으면, **Parameter Extractor 노드** 또는 LLM의 구조화 출력으로 `text`/`profile`을 분리해 End에 매핑한다. 최소한 `text` 하나만 내보내도 면지는 시작 가능(profile은 면지 쪽 EXAONE로 후처리 가능).

---

## 4. 콘솔에서 테스트 (게시 전 검증)

1. 우측 상단 **"실행/디버그(Run)"** → 시작 입력으로 **샘플 이력서 업로드**.
2. 각 노드의 입출력이 패널에 뜬다 → LLM이 JSON을 제대로 뱉는지, End에 `text`/`profile`이 채워지는지 확인.
3. 실패 시: 모델이 비전 지원인지, 파일 변수가 LLM에 연결됐는지, 프롬프트가 "JSON만" 강제하는지 점검.
4. **이미지 이력서 1장 + 텍스트 PDF 1개** 둘 다 테스트(구성 A라면 둘 다 통과해야 함).

---

## 5. 게시 + API 키 발급 (면지 연결 준비)

1. **게시(Publish/Update)** 버튼으로 워크플로를 배포한다(게시 안 하면 API가 최신본을 안 씀).
2. 좌측 메뉴 **"API 접근 / 백엔드 서비스 API(Access API)"** 진입.
3. 여기서 **2개 값**을 확보 → 면지 `.env`에 넣는다:
   - **Base URL** (예: `https://api.miso.gs/v1` 또는 사내 도메인 `https://<host>/v1`) → `MISO_BASE_URL` (`/v1` 포함 여부 화면 표기대로)
   - **API Key** (`app-...`) → `MISO_OCR_API_KEY`  *(키 발급/생성 버튼)*
4. 키는 앱 1개에 종속. **이 키 = 이 OCR 워크플로 전용**.

> 보안: 키는 **개인 발급·서버 env에만**. `.env`는 `.gitignore`. 레포·스크린샷 노출 금지(CLAUDE.md 규칙).

---

## 6. 면지 백엔드와 연결 (다음 단계)

여기부터는 코드. `docs/api-integration.md` **Part A**에 그대로 있다:

- **2-step 호출**: `POST /v1/files/upload`(파일 업로드 → `id`) → `POST /v1/workflows/run`(`inputs.resume`에 `id` 참조, `user`=세션ID, `blocking`).
- 응답 `data.outputs`의 `text`/`profile`을 면지가 사용.
- `MisoOcrAdapter`(httpx) 코드·env·타임아웃/폴백 전부 Part A 참고.

빠른 점검(키 받은 뒤 curl):

```bash
# 1) 업로드
curl -X POST "$MISO_BASE_URL/files/upload" \
  -H "Authorization: Bearer $MISO_OCR_API_KEY" \
  -F "file=@sample_resume.pdf;type=application/pdf" -F "user=test1"
# 2) 실행 (위 응답 id 사용)
curl -X POST "$MISO_BASE_URL/workflows/run" \
  -H "Authorization: Bearer $MISO_OCR_API_KEY" -H "Content-Type: application/json" \
  -d '{"inputs":{"resume":{"type":"document","transfer_method":"local_file","upload_file_id":"<id>"}},"response_mode":"blocking","user":"test1"}'
```

---

## 7. 팁 · 주의

- **모델 선택**: OCR/구조화엔 비전 지원 + 한국어 강한 모델. 면접 진행 LLM(EXAONE)과 **별개** — OCR은 MISO가 제공하는 비전 모델을 써도 트랙 정합(= "스폰서 플랫폼 활용").
- **PII**: 이력서는 민감정보. 면지 세션 종료 시 폐기, 업로드 파일·원문은 영속 저장 금지(Part A §A-6).
- **SLA**: 부트스트랩 10초 budget → OCR `blocking` 타임아웃 8s + 폴백("텍스트 직접 붙여넣기").
- **출력 일치**: End 변수명(`text`/`profile`)이 어댑터 코드와 한 글자도 다르면 안 됨.
- **게시 잊지 말기**: 워크플로 수정 후 **반드시 다시 Publish** 해야 API에 반영.

---

## 부록. 노드 빠른 참조 (Dify 기준, MISO 동일)

| 노드 | 용도 | 면지 OCR에서 |
|---|---|---|
| Start(시작) | 입력 변수 | `resume`(File) |
| Document Extractor(문서 추출) | PDF/DOC **텍스트 레이어** 추출 | 구성 B에서만 (이미지 ✗) |
| LLM | 추론/구조화/비전 | 구성 A=비전 OCR+구조화, 구성 B=구조화 |
| Parameter Extractor(파라미터 추출) | 텍스트→구조화 변수 | (선택) JSON 필드 분리 |
| Tool(도구) | 외부 도구/MCP 호출 | (선택) Document MCP OCR |
| If/Else | 분기 | (선택) 이미지 vs PDF 분기 |
| End(끝) | 출력 변수 | `text`, `profile` |

> 근거: 로컬 `dify/api/core/workflow/nodes/*` (노드 타입), `document_extractor/node.py`("Supports plain text, PDF, and DOC/DOCX" — 이미지 미지원 확인).
