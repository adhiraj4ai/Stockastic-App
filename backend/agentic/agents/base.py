from abc import ABC, abstractmethod
from typing import List, Dict, Generator
from ..llm import LLMFactory

class Agent(ABC):
    def __init__(self):
        self.provider = LLMFactory.get_provider()

    @abstractmethod
    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        pass
