"""StateBackend analog — 약점 신호 분석 + 세션 휘발 weakness_profile (FR-011).

- analyze_answer: 사용자 답변 1건 → 약점 신호(꼬리질문 트리거 + 자가진화 입력)
- update_weakness_profile: 라운드 종료 시 누적 갱신, before/after diff = 데모 킬러 시각화
휘발성이 PII 세션 폐기 요건과도 일치.
"""
from __future__ import annotations

from .skills import FILLER_WORDS, HEDGE_WORDS

# 약점 종류 → 한국어 라벨 (UI/프로파일 표시)
WEAK_LABEL = {
    "no_number": "정량 근거 부재",
    "hedging": "모호한 표현(보통·그냥)",
    "vague": "두루뭉술",
    "filler": "머뭇거림(필러)",
}


def analyze_answer(text: str, timing: dict | None = None) -> list[str]:
    """답변 1건 → 약점 신호 종류 리스트 (없으면 빈 리스트 = 잘한 답변).

    꼬리질문 발사 여부의 트리거. 우선순위 순으로 정렬되어 첫 신호가 꼬리 종류를 결정.
    """
    signals: list[str] = []
    stripped = text.strip()

    if not any(c.isdigit() for c in stripped):
        signals.append("no_number")
    if any(h in stripped for h in HEDGE_WORDS):
        signals.append("hedging")
    if len(stripped) < 40:
        signals.append("vague")

    filler_n = sum(1 for w in stripped.split() if w in FILLER_WORDS)
    if timing is not None:
        filler_n = max(filler_n, timing.get("fillerCount", 0))
    if filler_n >= 3:
        signals.append("filler")

    return signals


def primary_weak_kind(signals: list[str]) -> str:
    """꼬리질문 종류 선택 — hedging > no_number > vague > filler 우선."""
    for kind in ("hedging", "no_number", "vague", "filler"):
        if kind in signals:
            return kind
    return "vague"


# 약점 종류(kind) → 다음 라운드 전략 문구. kind가 nextFocus를 일관되게 결정.
NEXT_FOCUS = {
    "no_number": "다음 라운드: 모든 답변에 정량 근거(숫자) 강제",
    "hedging": "다음 라운드: ‘보통/그냥’ 차단 + 본인 결정만 캐묻기",
    "filler": "다음 라운드: 머뭇거림 줄이고 두괄식으로 답하게 압박",
    "vague": "다음 라운드: 두루뭉술 표현 차단 + 구체 사례 요구",
    "none": "다음 라운드: 잘 답했으므로 난이도 상향 + 더 깊은 후속 질문",
}


def update_weakness_profile(accumulated: list[str], all_text: str, timing: dict) -> dict:
    """라운드 종료 시 누적 약점 신호 → 프로파일.

    반환에 ``kind``(대표 약점 종류)를 포함 — 다음 라운드 질문 생성이 이 키로 전략을 바꾼다(FR-011 닫힌 루프).
    약점 신호가 없으면 kind="none" → 잘 답한 것으로 보고 다음 라운드를 에스컬레이션(FR-017).
    """
    kinds = list(dict.fromkeys(accumulated))  # 등장 순서 유지 dedup
    if not kinds:
        return {
            "patterns": ["성급한 동의 없이 무난"],
            "kind": "none",
            "nextFocus": NEXT_FOCUS["none"],
        }
    primary = primary_weak_kind(kinds)
    return {
        "patterns": [WEAK_LABEL.get(k, k) for k in kinds],
        "kind": primary,
        "nextFocus": NEXT_FOCUS.get(primary, NEXT_FOCUS["vague"]),
    }


def diff(before: dict, after: dict) -> str:
    b = ",".join(before.get("patterns", [])) or "없음"
    a = ",".join(after.get("patterns", [])) or "없음"
    return f"{b} → {a} / 전략: {after.get('nextFocus')}"
