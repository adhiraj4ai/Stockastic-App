from abc import ABC, abstractmethod
from typing import List, Dict, Generator
import json
from .llm import LLMFactory

class Agent(ABC):
    def __init__(self):
        self.provider = LLMFactory.get_provider()

    @abstractmethod
    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        pass

class ConversationalAgent(Agent):
    """Standard chat agent using the configured LLM provider."""
    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        system_prompt = (
            "You are Stockastic AI, an expert in stock analysis and strategic decision making in AI. "
            "You identify yourself as Stockastic AI. "
            "You have capabilities in data analysis and making strategic recommendations. "
            "Always maintain this professional yet helpful persona."
        )
        # Prepend system prompt to the conversation history
        messages_with_persona = [{"role": "system", "content": system_prompt}] + messages
        
        for chunk in self.provider.stream_response(messages_with_persona):
            yield chunk

class Text2SQLAgent(Agent):
    """Agent specialized in database queries."""
    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        # Uses LLM to generate the SQL query and explanation
        system_prompt = (
            "You are an expert SQL Data Analyst. Your task is to translate natural language queries into SQL. "
            "The database table `stocks` has the following schema:\n"
            "- id (int)\n"
            "- symbol (varchar)\n"
            "- company_name (varchar)\n"
            "- pe_ratio (float)\n"
            "- market_cap (float)\n"
            "- last_price (float)\n"
            "- dividend_yield (float)\n\n"
            "Respond with the SQL query that answers the user's question, followed by a brief explanation of what the query retrieves. "
            "Do NOT make up data values. Instead, present the SQL query clearly using markdown."
        )
        
        # We construct a new context for the sub-agent
        agent_messages = [{"role": "system", "content": system_prompt}] + messages[-3:] # Keep recent context
        
        yield "Thinking about the database schema...\n\n"
        
        for chunk in self.provider.stream_response(agent_messages):
            yield chunk

class DataVisualizationAgent(Agent):
    """Agent specialized in generating charts."""
    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        # Uses LLM to determine the correct visualization token and wrapper text
        system_prompt = (
            "You are a Data Visualization Assistant. Your goal is to help the user visualize financial data. "
            "You have access to the following chart tokens that render interactive graphs on the frontend:\n"
            "- [GRAPH:portfolio] : Use this when the user asks about their portfolio performance, holdings, or allocation.\n"
            "- [GRAPH:market_trend] : Use this for general market trends, index performance, or comparison requests.\n\n"
            "If the user asks for a chart, respond with a polite confirmation and INCLUDE the correct [GRAPH:...] token in your response. "
            "If the request is ambiguous, ask for clarification or use [GRAPH:market_trend] as a fallback."
        )
        
        agent_messages = [{"role": "system", "content": system_prompt}] + messages[-3:]
        
        yield "Configuring visualization...\n\n"
        
        for chunk in self.provider.stream_response(agent_messages):
            yield chunk

class SupervisorAgent(Agent):
    """
    Orchestrates specialized agents based on user intent.
    """
    def __init__(self):
        super().__init__()
        self.conversational_agent = ConversationalAgent()
        self.sql_agent = Text2SQLAgent()
        self.viz_agent = DataVisualizationAgent()

    def _classify_intent(self, messages: List[Dict[str, str]]) -> str:
        """
        Uses the LLM to classify the latest message intent.
        """
        system_prompt = (
            "You are a routing supervisor. Classify the user's request into one of the following tools:\n"
            "1. SQL_AGENT: for queries strictly asking for specific data points, financial ratios from the database, or explicit SQL generation.\n"
            "2. VIZ_AGENT: for requests explicitly asking to show, plot, or visualize a chart or graph.\n"
            "3. CHAT_AGENT: for general conversation, explanations, market commentary, or questions not covered above.\n\n"
            "Return ONLY the tool name (SQL_AGENT, VIZ_AGENT, or CHAT_AGENT). Do not add any punctuation or explanation."
        )
        
        classification_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": messages[-1]['content']} 
        ]
        
        try:
            # We use generate_response for a quick single classification
            response = self.provider.generate_response(classification_messages).strip().upper()
            if "SQL" in response: return "SQL_AGENT"
            if "VIZ" in response: return "VIZ_AGENT"
            return "CHAT_AGENT"
        except Exception:
            return "CHAT_AGENT"

    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        intent = self._classify_intent(messages)
        
        if intent == "SQL_AGENT":
            yield from self.sql_agent.process_request(messages)
        elif intent == "VIZ_AGENT":
             yield from self.viz_agent.process_request(messages)
        else:
             yield from self.conversational_agent.process_request(messages)
