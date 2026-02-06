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
        
        # Gemini/LangChain sometimes yields a list of dicts for content
        content = response.content
        if isinstance(content, list) and len(content) > 0:
            if isinstance(content[0], dict) and 'text' in content[0]:
                return content[0]['text']
            return str(content)
        return str(content)

    def stream_response(self, messages: List[Dict[str, str]]):
        langchain_messages = self._convert_messages(messages)
        for chunk in self.llm.stream(langchain_messages):
            # Gemini/LangChain sometimes yields a list of dicts for content
            if isinstance(chunk.content, list) and len(chunk.content) > 0:
                if isinstance(chunk.content[0], dict) and 'text' in chunk.content[0]:
                    yield chunk.content[0]['text']
                else:
                    yield str(chunk.content)
            else:
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

from langchain_ollama import ChatOllama

class OllamaProvider(LLMProvider):
    def __init__(self, model_name: str = "llama3", base_url: str = None):
        if base_url is None:
            base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.llm = ChatOllama(
            model=model_name,
            base_url=base_url,
            temperature=0.7,
            # Increasing connection timeout/retries is handled by underlying client, 
            # but we can try to set these if exposed or rely on defaults.
            # 503 often means loading model.
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

        if not api_key and provider_name != "ollama":
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

        elif provider_name == "ollama":
            kwargs = {}
            if model_name:
                kwargs["model_name"] = model_name
            return OllamaProvider(**kwargs)
            
        else:
            raise ValueError(f"Unsupported LLM provider: {provider_name}")
