"""MockLlmAdapter — EXAONE 없이 데모를 굴리는 결정론 mock.

⚠️ 의도적으로 가끔 '깨진 tool_call'을 반환한다 → wrap_tool_call 검증·재시도 하네스가
무대에서 실제로 증명되도록(FR-008, tool-call 유효율 >99%). mock이 항상 완벽하면
하네스의 가치가 안 보인다(PRD §5.0 EXT-LLM 주석).
"""
from __future__ import annotations

import re
from typing import Iterator, Optional

from ..skills import EVOLVE_QUESTIONS, QUESTION_BANK
from .base import LlmPort, LlmResult


class MockLlmAdapter(LlmPort):
    name = "mock"

    def chat(self, messages: list[dict], tools: Optional[list[dict]] = None) -> LlmResult:
        # 컨텍스트(persona/round/turn_idx)는 messages의 마지막 system 힌트에서 추출
        ctx = messages[-1] if messages else {}
        persona = ctx.get("persona", "tech")
        rnd = int(ctx.get("round", 1))
        turn_idx = int(ctx.get("turn_idx", 0))
        want_tool = ctx.get("want_tool")

        # 스킬 선택(progressive disclosure 1단계): mock은 추론 모델이 아니므로 선택을 비운다
        # → 엔진이 결정론 폴백(detect_playbook 키워드 매칭)으로 복구. 모델 주도 선택은 EXAONE 경로.
        if ctx.get("select_skill"):
            return LlmResult(text="")

        if want_tool:
            # 가끔(결정론) 인자 누락된 깨진 호출 → 하네스가 잡아서 재시도.
            # 리프롬프트(_retry_fix) 시엔 항상 유효한 인자로 복구.
            broken = (turn_idx + rnd) % 3 == 0 and not ctx.get("_retry_fix")
            args = {} if broken else ctx.get("tool_args", {})
            return LlmResult(tool_call={"name": want_tool, "arguments": args})

        # 첫 질문(opening): EXAONE 폴백이라도 이력서 항목을 직접 지목 → 캔드 openingLine 회피.
        if ctx.get("opening"):
            projects = ctx.get("resume_projects") or []
            skills = ctx.get("resume_skills") or []
            focus = projects[0] if projects else (skills[0] if skills else None)
            if focus:
                return LlmResult(
                    text=f"이력서의 '{focus}' 경험이 눈에 띕니다. 본인이 정확히 무엇을 맡았고 그 성과를 어떤 숫자로 증명할 수 있는지부터 말씀해 주세요."
                )
            # 이력서 정보가 비면 페르소나 기본 질문뱅크로 폴백
            return LlmResult(text=QUESTION_BANK.get(persona, QUESTION_BANK["tech"])[0][0])

        # 닫힌 루프(FR-011): R2+는 직전 라운드 약점 종류(weakness_kind)로 질문 선택
        #   → R1에서 약점을 보인 사람과 잘 답한 사람이 서로 다른 R2 질문을 받는다.
        weakness_kind = ctx.get("weakness_kind")
        if rnd >= 2 and weakness_kind:
            variants = EVOLVE_QUESTIONS.get(weakness_kind) or EVOLVE_QUESTIONS["vague"]
            return LlmResult(text=variants[turn_idx % len(variants)])

        bank = QUESTION_BANK.get(persona, QUESTION_BANK["tech"])
        round_bank = bank[min(rnd - 1, len(bank) - 1)]
        text = round_bank[turn_idx % len(round_bank)]
        return LlmResult(text=text)

    def stream(self, ctx: dict) -> Iterator[str]:
        """질문 텍스트를 어절 단위 청크로 흘린다(스트리밍 형태 유지).

        mock은 지연 0이라 청크가 거의 동시에 도착하지만, 실 LLM과 동일한 SSE 경로를
        타게 해 클라이언트 코드가 분기 없이 동작하도록 한다. 텍스트는 chat()과 동일 규칙.
        """
        text = self.chat([ctx]).text or ""
        for tok in re.findall(r"\S+\s*", text):
            yield tok
