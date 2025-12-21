from typing import Dict, List, Optional, Any, Type, Callable
from dataclasses import dataclass, field

@dataclass
class AgentMetadata:
    name: str
    description: str
    input_schema: Dict[str, Any] = field(default_factory=dict)
    capabilities: List[str] = field(default_factory=list)
    # The actual instance will be stored in the registry, this is just metadata

class AgentRegistry:
    _instance = None
    _agents: Dict[str, Any] = {}
    _metadata: Dict[str, AgentMetadata] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AgentRegistry, cls).__new__(cls)
        return cls._instance

    @classmethod
    def register(cls, name: str, description: str, input_schema: Dict = None, capabilities: List[str] = None):
        """
        Decorator to register an agent class. 
        It registers the CLASS, not an instance. 
        Instantiation happens when the registry is initialized or accessed.
        """
        def decorator(agent_cls):
            cls._metadata[name] = AgentMetadata(
                name=name,
                description=description,
                input_schema=input_schema or {},
                capabilities=capabilities or []
            )
            # Store the class to be instantiated later or immediately
            # For simplicity, we'll store the class and instantiate on demand or let Supervisor instantiate
            # Actually, to fit the current pattern, let's store the class construction.
            cls._agents[name] = agent_cls
            return agent_cls
        return decorator

    @classmethod
    def get_agent_class(cls, name: str):
        return cls._agents.get(name)

    @classmethod
    def get_all_metadata(cls) -> List[AgentMetadata]:
        return list(cls._metadata.values())

    @classmethod
    def get_registry_prompt(cls) -> str:
        """Generates a text description of all available agents for the Planner."""
        prompt = "AVAILABLE AGENTS:\n"
        for meta in cls._metadata.values():
            prompt += f"- {meta.name}: {meta.description}\n"
        return prompt

# Global singleton helper
registry = AgentRegistry()
