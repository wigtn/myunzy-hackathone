"""동시 면접 admission control (인메모리, 단일 인스턴스 전제 — Cloud Run maxScale=1).

동시 '활성 면접'을 MAX_CONCURRENT(기본 10)로 제한. 초과분은 FIFO 대기열 →
프론트가 순번·예상대기를 표시. 슬롯은 폴링(하트비트)으로 last_seen 을 갱신하고,
TTL 동안 무응답이면 회수(닫힌 탭·크래시 대비). 반환된 티켓은 잠깐 tombstone 처리해
종료한 면접이 떠도는 폴링으로 슬롯을 재점유하지 않게 한다.

엔드포인트(main.py):
  POST /api/v1/queue/join            → 슬롯 요청 (active 또는 waiting+순번)
  GET  /api/v1/queue/{ticket}        → 상태 폴링 + 하트비트 (대기→활성 승격)
  POST /api/v1/queue/{ticket}/release→ 슬롯 반환 (면접 종료/이탈 시)
"""
from __future__ import annotations

import os
import secrets
import threading
import time

CAP = max(1, int(os.getenv("MAX_CONCURRENT", "10")))         # 동시 활성 면접 수
AVG_SEC = float(os.getenv("AVG_INTERVIEW_SEC", "120"))        # 예상 대기 추정용 평균 면접 길이
TTL = float(os.getenv("SLOT_TTL_SEC", "90"))                  # 무응답 슬롯 회수 시간

_lock = threading.Lock()
_active: dict[str, float] = {}    # ticket -> last_seen(monotonic)
_waiting: list[str] = []          # FIFO 대기 ticket
_wait_seen: dict[str, float] = {} # 대기 ticket -> last_seen
_released: dict[str, float] = {}  # 최근 반환 ticket -> 시각 (재admit 방지 tombstone)


def _now() -> float:
    return time.monotonic()


def _promote(now: float) -> None:
    while _waiting and len(_active) < CAP:
        t = _waiting.pop(0)
        _wait_seen.pop(t, None)
        _active[t] = now


def _reclaim(now: float) -> None:
    for t in [t for t, ts in _active.items() if now - ts > TTL]:
        _active.pop(t, None)
    for t in [t for t in _waiting if now - _wait_seen.get(t, now) > TTL]:
        _waiting.remove(t)
        _wait_seen.pop(t, None)
    for t in [t for t, ts in _released.items() if now - ts > TTL]:
        _released.pop(t, None)  # tombstone 만료 정리
    _promote(now)


def _status(ticket: str) -> dict:
    if ticket in _active:
        return {"ticket": ticket, "state": "active", "position": 0,
                "estimatedWaitSec": 0, "capacity": CAP, "activeCount": len(_active)}
    pos = _waiting.index(ticket) + 1
    eta = int(-(-pos // CAP) * AVG_SEC)  # ceil(pos/CAP) * 평균면접
    return {"ticket": ticket, "state": "waiting", "position": pos,
            "estimatedWaitSec": eta, "capacity": CAP, "activeCount": len(_active)}


def _admit(ticket: str, now: float) -> None:
    if len(_active) < CAP:
        _active[ticket] = now
    else:
        _waiting.append(ticket)
        _wait_seen[ticket] = now


def join() -> dict:
    with _lock:
        now = _now()
        _reclaim(now)
        ticket = "tk_" + secrets.token_hex(5)
        _admit(ticket, now)
        return _status(ticket)


def poll(ticket: str) -> dict:
    with _lock:
        now = _now()
        # 하트비트: 알려진 티켓이면 last_seen 갱신
        if ticket in _active:
            _active[ticket] = now
        elif ticket in _wait_seen:
            _wait_seen[ticket] = now
        _reclaim(now)
        if ticket not in _active and ticket not in _wait_seen:
            if ticket in _released:
                # 이미 반환된 티켓 — 재admit 금지 (종료 면접이 슬롯 재점유하던 누수 차단)
                return {"ticket": ticket, "state": "released", "position": 0,
                        "estimatedWaitSec": 0, "capacity": CAP, "activeCount": len(_active)}
            _admit(ticket, now)  # 만료/미상 티켓 재합류 (끊겼다 돌아온 사용자 복구)
        return _status(ticket)


def release(ticket: str) -> dict:
    with _lock:
        now = _now()
        _active.pop(ticket, None)
        if ticket in _wait_seen:
            _waiting.remove(ticket)
            _wait_seen.pop(ticket, None)
        _released[ticket] = now  # tombstone: 떠도는 폴링의 재admit 차단
        _promote(now)
        return {"released": True, "capacity": CAP,
                "activeCount": len(_active), "waitingCount": len(_waiting)}
