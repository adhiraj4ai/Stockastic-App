import os
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

class LLMProvider(ABC):
    @abstractmethod
    def generate_response(self, messages: List[Dict[str, str]]) -> str:
        """Generate a response based on the conversation history."""
        pass

    @abstractmethod
    def stream_response(self, messages: List[Dict[str, str]]):
        """Stream a response based on the conversation history."""
        pass

class GroqProvider(LLMProvider):
    def __init__(self, api_key: str, model_name: str = "llama-3.3-70b-versatile"):
        self.llm = ChatGroq(
            groq_api_key=api_key,
            model_name=model_name,
            temperature=0.7,
        )

    def generate_response(self, messages: List[Dict[str, str]]) -> str:
        langchain_messages = self._convert_messages(messages)
        response = self.llm.invoke(langchain_messages)
        return response.content

    def stream_response(self, messages: List[Dict[str, str]]):
        langchain_messages = self._convert_messages(messages)
        for chunk in self.llm.stream(langchain_messages):
            yield chunk.content

    def _convert_messages(self, messages: List[Dict[str, str]]):
        converted = []
        for msg in messages:
            if msg['role'] == 'user':
                converted.append(HumanMessage(content=msg['content']))
            elif msg['role'] == 'assistant':
                converted.append(AIMessage(content=msg['content']))
            elif msg['role'] == 'system':
                converted.append(SystemMessage(content=msg['content']))
        return converted

class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model_name: str = "gemini-1.5-flash"):
        self.llm = ChatGoogleGenerativeAI(
            google_api_key=api_key,
            model=model_name,
            temperature=0.7,
        )

    def generate_response(self, messages: List[Dict[str, str]]) -> str:
        langchain_messages = self._convert_messages(messages)
        response = self.llm.invoke(langchain_messages)
        return response.content

    def stream_response(self, messages: List[Dict[str, str]]):
        langchain_messages = self._convert_messages(messages)
        for chunk in self.llm.stream(langchain_messages):
            yield chunk.content

    def _convert_messages(self, messages: List[Dict[str, str]]):
        converted = []
        for msg in messages:
            if msg['role'] == 'user':
                converted.append(HumanMessage(content=msg['content']))
            elif msg['role'] == 'assistant':
                converted.append(AIMessage(content=msg['content']))
            elif msg['role'] == 'system':
                converted.append(SystemMessage(content=msg['content']))
        return converted

class LLMFactory:
    @staticmethod
    def get_provider() -> LLMProvider:
        provider_name = os.getenv("LLM_PROVIDER", "groq").lower()
        api_key = os.getenv("LLM_API_KEY")
        model_name = os.getenv("LLM_MODEL_NAME")

        if not api_key:
            # Fallback for development if no key is provided
            print(f"Warning: LLM_API_KEY not set for provider {provider_name}")
            
        if provider_name == "groq":
            # Pass model_name only if it exists, otherwise rely on class default
            kwargs = {"api_key": api_key}
            if model_name:
                kwargs["model_name"] = model_name
            return GroqProvider(**kwargs)
            
        elif provider_name == "gemini":
            kwargs = {"api_key": api_key}
            if model_name:
                kwargs["model_name"] = model_name
            return GeminiProvider(**kwargs)
            
        else:
            raise ValueError(f"Unsupported LLM provider: {provider_name}")
