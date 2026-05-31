# 면지 에이전트 서비스 — GCP Cloud Run 용 컨테이너.
# mock 런타임은 키 0개·GPU 불필요 → slim 이미지로 충분(EXAONE 등 실연동은 env로 외부 서버 호출).
FROM python:3.12-slim

# 파이썬 런타임 위생: .pyc 미생성 + stdout/stderr 무버퍼(Cloud Run 로그 즉시 노출).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# ffmpeg: 브라우저 녹음(webm/opus)을 STT 서버가 받는 WAV로 서버사이드 변환(ports.Qwen3Stt).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 의존성 레이어 분리 — requirements 안 바뀌면 캐시 재사용.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 앱 소스.
COPY app ./app

# Cloud Run 은 $PORT(기본 8080)를 주입 → uvicorn 이 0.0.0.0:$PORT 바인딩.
# 단일 워커: 인메모리 store(app/store.py) 세션을 한 인스턴스 안에서 일관 유지.
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
