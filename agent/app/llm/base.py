"""LlmPort 추상 — PRD §5.0 interface LlmPort { chat(messages, tools?) }.

DeepAgents는 provider-agnostic. 이 포트 뒤에 EXAONE(vLLM/Ollama/Bedrock)를 둔다.
turn 루프는 결정론 tool-calling(Hermes), verdict는 순수코드 → LLM은 다음 질문 생성 +
큐레이션된 도구 호출만 담당한다 (AGENT_ARCHITECTURE.md §3).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable


@dataclass
class LlmResult:
    """모델 1회 응답. text(자연어 질문) 또는 tool_call(Hermes 구조화 호출) 중 하나 이상."""

    text: Optional[str] = None
    tool_call: Optional[dict] = None  # {"name": str, "arguments": dict}


@runtime_checkable
class LlmPort(Protocol):
    def chat(self, messages: list[dict], tools: Optional[list[dict]] = None) -> LlmResult:
        ...
