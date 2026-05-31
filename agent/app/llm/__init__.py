"""LLM 어댑터 팩토리. LLM_PROVIDER 환경변수로 mock ↔ exaone 선택."""
from __future__ import annotations

import os

from .base import LlmPort, LlmResult
from .mock import MockLlmAdapter

__all__ = ["LlmPort", "LlmResult", "get_llm"]


def get_llm() -> LlmPort:
    provider = os.getenv("LLM_PROVIDER", "mock").strip().lower()
    if provider == "exaone":
        # EXAONE-4.5 OpenAI 호환 서버. 초기화 실패 시 mock 폴백(크래시 방지).
        try:
            from .exaone import ExaoneLlmAdapter

            return ExaoneLlmAdapter()
        except Exception as e:
            print(f"[get_llm] LLM_PROVIDER=exaone 초기화 실패 → mock 폴백: {e}")
    if provider in ("openai", "gpt"):
        # EXAONE 준비 전 실 생성형 LLM 테스트용. 키 미설정 시 mock 폴백(크래시 방지).
        try:
            from .openai_llm import OpenAiLlmAdapter

            return OpenAiLlmAdapter()
        except Exception as e:
            print(f"[get_llm] LLM_PROVIDER={provider} 초기화 실패 → mock 폴백: {e}")
    return MockLlmAdapter()
