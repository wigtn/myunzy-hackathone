# 배포 가이드 — 면지(面zy)

> API 서버(`agent/`)는 **GCP Cloud Run**, 프론트(`web/`)는 **Vercel**.
> BFF(`web`)가 `AGENT_SERVICE_URL`로 Cloud Run을 1:1 프록시한다.

```
브라우저 ──HTTPS──> Vercel (web: Next.js FE + BFF, 서울 icn1)
                      │  AGENT_SERVICE_URL
                      ▼
            Cloud Run (agent: FastAPI, 서울 asia-northeast3)
                      │  LLM=EXAONE / OCR=MISO / JOB=Rocketpunch / RANK=GenRank / GW=APIFuse / TTS
                      ▼
              외부 스폰서 API · EXAONE/TTS 서버
```

---

## 현재 배포 현황

| 구성 | 플랫폼 | 위치 | URL |
|---|---|---|---|
| agent (API) | Cloud Run | `wigex-prod` / asia-northeast3 | https://myeonji-agent-764392388372.asia-northeast3.run.app |
| web (FE+BFF) | Vercel | `kimjinmos-projects/web` / icn1 | https://web-ten-henna-64.vercel.app |

> Vercel 운영 도메인은 **alias** `https://web-ten-henna-64.vercel.app`(공개).
> 불변 배포 URL(`web-xxxx-...vercel.app`)은 Deployment Protection 으로 401 — 정상 동작.

> ⚠️ **프로젝트 메모**: 원래 `wigss-491601`에 배포하려 했으나 해당 프로젝트는
> Cloud Run 리전 초기화가 `ProjectInitFailedQuotaExceeded`로 막혀 있었다
> (CPU 쿼터는 20000으로 정상 → 계정/내부 프로비저닝 쿼터 이슈, 콘솔에서 결제 등급
> 확인 필요). Cloud Run이 이미 동작 중이던 `wigex-prod`로 우회 배포함.
> `wigss-491601`이 풀리면 동일 절차로 옮기면 된다.

---

## 1. Agent → Cloud Run

### 파일
- `agent/Dockerfile` — python:3.12-slim, `uvicorn ... --port $PORT`(Cloud Run 주입).
- `agent/.dockerignore`, `agent/.gcloudignore` — `.venv`/`__pycache__`/`.env` 제외.
- `agent/.env.cloudrun.yaml` — **런타임 env(시크릿 포함, gitignore됨)**. `--env-vars-file`로 주입.

### 빌드 SA 권한 이슈 우회 (로컬 빌드 → 푸시 → 이미지 배포)
`gcloud run deploy --source`는 Cloud Build 기본 SA 권한 누락
(`PERMISSION_DENIED ... 764392388372-compute@...`)으로 실패할 수 있다.
→ **로컬 Docker 빌드 후 Artifact Registry로 직접 푸시**해서 우회한다.

```bash
cd agent
REGION=asia-northeast3; PROJ=wigex-prod; REPO=myeonji
IMG=$REGION-docker.pkg.dev/$PROJ/$REPO/myeonji-agent:latest

# (최초 1회) AR 저장소 + docker 인증
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION --project=$PROJ
gcloud auth configure-docker $REGION-docker.pkg.dev

# 빌드 → 푸시 → 배포
docker build -t $IMG .
docker push $IMG
gcloud run deploy myeonji-agent \
  --image $IMG --project $PROJ --region $REGION \
  --platform managed --allow-unauthenticated \
  --port 8080 --memory 512Mi --cpu 1 \
  --min-instances 0 --max-instances 1 --timeout 300 \
  --env-vars-file .env.cloudrun.yaml
```

> **인메모리 세션**: `app/store.py`는 프로세스 메모리에 세션을 둔다.
> `--max-instances 1` + 단일 워커로 한 인스턴스 안에서 일관성을 유지한다.
> (`--min-instances 1`은 신규 프로젝트에서 쿼터로 막힐 수 있어 0으로 둠 →
> 유휴 시 콜드스타트, 데모 연속 사용 중에는 인스턴스 유지.)

### 검증
```bash
URL=https://myeonji-agent-764392388372.asia-northeast3.run.app
curl $URL/health                       # {"ok":true,"llm":"exaone"}
curl "$URL/api/v1/tts?text=안녕하세요"   # audio/wav (TTS 서버 가용 시)
```

### 환경변수 — 비밀/비-비밀 분리
- **비-비밀 설정**은 `agent/.env.cloudrun.yaml`(gitignore): `LLM_PROVIDER`, `*_PROVIDER`,
  `MISO_BASE_URL`, `GENRANK_BASE`, `TTS_*`, `MAX_UPLOAD_BYTES`.
- **시크릿(API 키)은 GCP Secret Manager** 로 주입한다. 평문 env 금지.

| env 이름 | Secret Manager 시크릿 |
|---|---|
| `MISO_OCR_KEY` | `myeonji-miso-ocr-key` |
| `ROCKETPUNCH_KEY` | `myeonji-rocketpunch-key` |
| `APIFUSE_KEY` | `myeonji-apifuse-key` |

```bash
PROJ=wigex-prod; REGION=asia-northeast3
SA=764392388372-compute@developer.gserviceaccount.com   # Cloud Run 런타임 SA

# (최초 1회) Secret Manager 활성화 + 시크릿 생성(값은 stdin → 셸 히스토리 노출 방지)
gcloud services enable secretmanager.googleapis.com --project $PROJ
printf '<MISO 키>'       | gcloud secrets create myeonji-miso-ocr-key    --project $PROJ --replication-policy=automatic --data-file=-
printf '<ROCKETPUNCH 키>'| gcloud secrets create myeonji-rocketpunch-key --project $PROJ --replication-policy=automatic --data-file=-
printf '<APIFUSE 키>'    | gcloud secrets create myeonji-apifuse-key     --project $PROJ --replication-policy=automatic --data-file=-

# 런타임 SA 에 accessor 권한
for S in myeonji-miso-ocr-key myeonji-rocketpunch-key myeonji-apifuse-key; do
  gcloud secrets add-iam-policy-binding $S --project $PROJ \
    --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
done

# 배포/갱신 시 시크릿 참조 주입
gcloud run services update myeonji-agent --project $PROJ --region $REGION \
  --set-secrets="MISO_OCR_KEY=myeonji-miso-ocr-key:latest,ROCKETPUNCH_KEY=myeonji-rocketpunch-key:latest,APIFUSE_KEY=myeonji-apifuse-key:latest"
```

> 키 회전: `printf '<새 키>' | gcloud secrets versions add <시크릿> --data-file=-` 후
> `:latest` 참조라 다음 리비전부터 자동 반영(또는 `gcloud run services update`로 즉시 새 리비전).
> 비-비밀 설정만 바꿀 땐 `--set-env-vars` 또는 `--env-vars-file .env.cloudrun.yaml`.

---

## 2. Web → Vercel

### 파일
- `web/vercel.json` — `framework: nextjs`, `regions: ["icn1"]`(서울, Cloud Run과 동일 권역).

### 배포 (web 디렉터리를 프로젝트 루트로)
```bash
cd web
npx vercel login          # 최초 1회 (브라우저 인증) — 또는 VERCEL_TOKEN 사용
npx vercel link           # 프로젝트 연결 (root = web)
# 환경변수 등록 (Production)
npx vercel env add AGENT_SERVICE_URL production
#   → https://myeonji-agent-764392388372.asia-northeast3.run.app
npx vercel env add MAX_UPLOAD_BYTES production
#   → 10485760
npx vercel --prod         # 프로덕션 배포
```

> CI/비대화 환경: `VERCEL_TOKEN` 발급 후
> `npx vercel --prod --token $VERCEL_TOKEN --yes`.

### Vercel 환경변수
| 변수 | 값 | 비고 |
|---|---|---|
| `AGENT_SERVICE_URL` | Cloud Run URL | 설정 시 BFF가 agent로 프록시(STT/TTS/LLM/외부API 전부 agent가 처리) |
| `MAX_UPLOAD_BYTES` | `10485760` | 업로드 상한(10MB) |

> `AGENT_SERVICE_URL`을 비우면 BFF 내장 TS mock 엔진으로 단독 동작(프론트만으로 데모 완주).

---

## 3. CI/CD (GitHub Actions)

`main` 브랜치에 머지되면 자동 배포된다 (경로 필터로 변경된 쪽만).

| 워크플로 | 트리거 | 인증 | 동작 |
|---|---|---|---|
| `.github/workflows/deploy-agent.yml` | push→main (`agent/**`) | **WIF(키리스)** | 이미지 빌드·푸시 → Cloud Run 이미지 갱신(env/시크릿 보존) → `/health` |
| `.github/workflows/deploy-web.yml` | push→main (`web/**`) | `VERCEL_TOKEN` | `vercel pull → build → deploy --prod` |

### GCP 인증 = Workload Identity Federation (키리스, 평문 키 0개)
GitHub Actions가 단기 OIDC 토큰으로 배포 SA를 임퍼소네이션 → **GCP 키를 GitHub에 저장하지 않는다.**
- 배포 SA: `myeonji-deployer@wigex-prod.iam.gserviceaccount.com` (roles: `run.admin`, `artifactregistry.writer`, 런타임 SA에 `iam.serviceAccountUser`)
- WIF 공급자: `projects/764392388372/locations/global/workloadIdentityPools/github-pool/providers/github` (조건: `repository_owner=='wigtn'`)
- 워크플로의 provider/SA 식별자는 비밀이 아니므로 yml에 인라인.

### 필요한 GitHub Secret (딱 1개) — **수동 등록 필요**
`VERCEL_TOKEN` — Vercel 대시보드 → Settings → Tokens 에서 발급 후
GitHub repo → Settings → Secrets and variables → Actions → New repository secret 로 등록.
(gh CLI 미설치라 자동 등록 불가. 이 토큰만 사람이 넣으면 web CI 완성.)

> agent CI는 추가 시크릿 불필요(WIF). web CI는 `VERCEL_TOKEN` 하나만 있으면 동작.

---

## 갱신(재배포) 요약
- **자동(권장)**: `main`에 머지 → 위 워크플로가 알아서 배포.
- **수동 agent**: `docker build → push → gcloud run deploy --image`(1번 블록).
- **수동 web**: `cd web && npx vercel --prod`.
