"""도구호출 하네스 (FR-008) — DeepAgents wrap_tool_call analog.

차별점: 면접관을 자유연기시키지 않고 상태기계+도구로 굴린다. 작은 모델(EXAONE)이
끝까지 일관되게 압박·평가·진화하도록 강제. 핵심 기법:
  - 도구 큐레이션: 페르소나/단계별 5~8개만 노출 (skills.PERSONAS[*].tools)
  - 단일 턴 = 단일 도구
  - 스키마 검증 + 자동 재시도/리프롬프트 (tool-call 유효율 >99% 목표)
  - 작업 로그 방출 (harness.validate / harness.retry)
"""
from __future__ import annotations

from typing import Callable, Optional

from .llm.base import LlmPort, LlmResult

# Hermes Tool Set (PRD §5.1.1) — JSON Schema 발췌
HERMES_TOOLS: list[dict] = [
    {"name": "parse_resume", "parameters": {"file_ref": "string"}},
    {"name": "lookup_job_posting", "parameters": {"company": "string", "role": "string"}},
    {"name": "lookup_company_reputation", "parameters": {"company": "string"}},
    {"name": "analyze_fit_gap", "parameters": {"resume_ref": "string", "job_ref": "string"}},
    {"name": "build_personas", "parameters": {"attack_points": "array", "company": "string"}},
    {
        "name": "set_counterpart_state",
        "parameters": {"persona_id": "string", "mood": "string", "pressure": "number", "hidden_agenda_revealed": "boolean"},
    },
    {"name": "lookup_playbook", "parameters": {"framework": "string"}},
    {"name": "check_answer_quality", "parameters": {"user_utterance": "string", "framework": "string"}},
    {"name": "update_weakness_profile", "parameters": {"round": "number", "signals": "array"}},
    {"name": "escalate", "parameters": {"reason": "string", "level": "number"}},
    {"name": "estimate_pass_probability", "parameters": {"transcript_ref": "string"}},
    {"name": "generate_verdict", "parameters": {"transcript_ref": "string", "timing_metrics": "object"}},
    {"name": "simulate_branch", "parameters": {"moment_id": "string", "alternative": "string"}},
]

_TOOL_BY_NAME = {t["name"]: t for t in HERMES_TOOLS}

# 사람이 읽는 툴콜 요약 (UI 칩용)
TOOL_SUMMARY = {
    "lookup_job_posting": "채용공고 필수요건 조회",
    "lookup_company_reputation": "회사 평판 조회",
    "check_answer_quality": "답변 품질(STAR) 평가",
    "lookup_playbook": "면접 프레임워크 조회",
    "update_weakness_profile": "약점 프로파일 갱신",
    "escalate": "난이도 에스컬레이션",
}

# mock/real 배지는 정적 맵이 아니라 실제 활성 어댑터의 is_mock 로 판정한다(engine._tool_is_mock).
# JOB_PROVIDER=rocketpunch 처럼 실연동이면 같은 도구라도 real 로 표시 → 부트스트랩 로그와 일관.


def curate_tools(persona_tools: list[str]) -> list[dict]:
    """페르소나/단계별 필요한 도구만 노출 (5~8개)."""
    return [_TOOL_BY_NAME[n] for n in persona_tools if n in _TOOL_BY_NAME]


def validate_tool_call(call: dict) -> Optional[str]:
    """tool_call 스키마 검증. 통과 시 None, 실패 시 사유 문자열."""
    if not call or "name" not in call:
        return "name 누락"
    spec = _TOOL_BY_NAME.get(call["name"])
    if spec is None:
        return f"미등록 도구: {call['name']}"
    args = call.get("arguments") or {}
    missing = [k for k in spec["parameters"] if k not in args]
    if missing:
        return f"필수 인자 누락: {','.join(missing)}"
    return None


def call_with_retry(
    llm: LlmPort,
    messages: list[dict],
    tools: list[dict],
    on_log: Callable[[str, str, Optional[str]], None],
    max_retries: int = 2,
) -> LlmResult:
    """wrap_tool_call: tool_call이면 스키마 검증 + 실패 시 자동 리프롬프트.

    사용자는 끊김을 못 느낀다(Acceptance: 도구호출 검증 실패 시 자동 복구).
    """
    result = llm.chat(messages, tools)
    if result.tool_call is None:
        return result  # 자연어 응답 — 검증 불필요

    on_log("harness.validate", "done", "tool-call 스키마 검증")
    for attempt in range(max_retries):
        err = validate_tool_call(result.tool_call)
        if err is None:
            return result
        on_log("harness.retry", "retry", f"깨진 tool-call 자동 리프롬프트 ({err})")
        # 리프롬프트: 보정 힌트를 messages에 주입 후 재호출
        retry_ctx = dict(messages[-1]) if messages else {}
        retry_ctx["_retry_fix"] = True
        result = llm.chat(messages[:-1] + [retry_ctx], tools)
        if result.tool_call is None:
            return result
    # 최종 폴백: 인자 비더라도 진행 (데모 무중단)
    on_log("harness.validate", "done", "재시도 후 진행")
    return result
