from typing import List, Dict, Generator
from .base import Agent
from ..prompts.agent_prompts import STOCKASTIC_PERSONA
from ..registry import AgentRegistry

@AgentRegistry.register(
    name="CHAT_AGENT",
    description="For general greetings, explanations, or questions not covered by the experts."
)
class ConversationalAgent(Agent):
    """Standard chat agent using the configured LLM provider."""
    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        # Prepend system prompt to the conversation history (limit to last 5 messages)
        recent_messages = messages[-5:]
        messages_with_persona = [{"role": "system", "content": STOCKASTIC_PERSONA}] + recent_messages
        
        for chunk in self.provider.stream_response(messages_with_persona):
            yield chunk
