"""
Base agent architecture for LLM execution, strict Pydantic JSON validation,
automatic retry, and graceful Mock fallback.
"""

import json
import logging
from typing import Type, TypeVar, Tuple, Optional
from pydantic import BaseModel, ValidationError

from backend.app.llm import LLMClient, MockLLMClient

logger = logging.getLogger("coordinator.agents")

T = TypeVar("T", bound=BaseModel)


class BaseAgent:
    def __init__(self, llm_client: LLMClient, mode: str = "fallback_mock"):
        self.llm_client = llm_client
        self.mode = mode
        self.mock_client = MockLLMClient()

    def execute_with_validation(
        self,
        prompt: str,
        response_model: Type[T],
        system_instruction: Optional[str] = None,
    ) -> Tuple[T, str]:
        """
        Executes an LLM request, strictly validates the response against the Pydantic model,
        retries once on error, and falls back to MockLLMClient if needed.
        Returns: (validated_model_instance, mode_used)
        """
        effective_mode = self.mode

        # Attempt 1: Call designated client
        for attempt in range(2):
            try:
                raw_json = self.llm_client.generate_json(
                    prompt=prompt, system_instruction=system_instruction
                )
                # Clean any markdown fences if present
                cleaned_json = self._clean_json(raw_json)
                validated_obj = response_model.model_validate_json(cleaned_json)
                return validated_obj, effective_mode
            except (ValidationError, Exception) as e:
                logger.warning(
                    f"LLM call/validation attempt {attempt + 1} failed: {e}. Retrying..."
                )

        # Fallback to MockLLMClient
        logger.info("Engaging deterministic MockLLMClient fallback.")
        effective_mode = "fallback_mock"
        try:
            mock_json = self.mock_client.generate_json(
                prompt=prompt, system_instruction=system_instruction
            )
            cleaned_mock_json = self._clean_json(mock_json)
            validated_obj = response_model.model_validate_json(cleaned_mock_json)
            return validated_obj, effective_mode
        except Exception as e:
            logger.error(f"Fatal error in mock fallback: {e}")
            raise e

    def _clean_json(self, text: str) -> str:
        """Strips markdown code fences (```json ... ```) from LLM output."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()
