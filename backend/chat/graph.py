import json
import re
import os
from typing import TypedDict, Annotated, Sequence, List, Dict, Any, Union
import operator

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_community.chat_models import ChatOllama
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from langgraph.graph import StateGraph, END

from .tools.registry import ToolRegistry

# ==============================================================================
# State Definition
# ==============================================================================

class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    user: Any # Django User object, needed for tool execution context

# ==============================================================================
# Helper Functions
# ==============================================================================

def get_system_prompt() -> str:
    """Generate the system prompt with tool definitions"""
    from .db_utils import get_reference_date
    ref_date = get_reference_date().isoformat()
    
    tools = ToolRegistry.get_all_tools()
    tool_descriptions = []
    
    for tool in tools:
        params = ", ".join([
            f"{p.name}: {p.type}" + (" (required)" if p.required else " (optional)")
            for p in tool.parameters
        ])
        tool_descriptions.append(
            f"- {tool.name}({params}): {tool.description}"
        )
    
    tools_str = "\n".join(tool_descriptions)
    
    return r"""You are Stockastic AI, an intelligent financial assistant.

You have access to the following tools:
{tools_str}

To call a tool, you MUST use this exact format:
[TOOL_CALL: tool_name(param1=value1, param2=value2)]

**IMPORTANT**: The current reference date ("today") for all market analysis is {ref_date}. 
When users say "today", "yesterday", or ask for recent data, always calculate relative to this date ({ref_date}).

### Core Logic Rules:
1. **Efficiency**: Do NOT call the same tool twice with the same arguments in a single conversation unless the user explicitly asks for refresh.
2. **Context**: Use the tool results provided to answer the user. If a tool result contains an error, explain it gracefully.
3. **Python Analysis**: Use `python_analysis` for complex statistics, multi-stock correlations, or calculations not covered by specific tools. 
   - **Helpers**: `get_data(symbol, days)` (price DF), `get_fundamentals(symbol)` (dict), `get_signals(symbol)` (recent signals DF), `get_market_summary()` (dict).
   - **Environment**: You have `pandas (pd)` and `numpy (np)`. ALWAYS print() the results you want to see.
4. **Generative UI**: Use the protol below for specialized data.

### Generative UI Protocol
When presenting specialized data, you MUST use the `gen-ui` markdown block. 

**CRITICAL**: Wrap the JSON in triple backticks with the `gen-ui` language identifier. 

**Available Components & Schemas**:
- `MarketSummary`: Use for top gainers/losers.
  - Data Schema: `{"market_index": number, "top_gainers": [{"symbol": string, "sector": string, "price_change": number}], "top_losers": [...]}`
- `StockCard`: Use for individual stock deep-dives.
  - Data Schema: `{"symbol": string, "price": number, "change": number, "change_pct": number, "sector": string, "volume": number}`

**Example**:
```gen-ui
{
  "component": "MarketSummary",
  "data": {
    "market_index": 1.2,
    "top_gainers": [{"symbol": "RIDI", "sector": "Energy", "price_change": 5.6}],
    "top_losers": [{"symbol": "AKJCL", "sector": "Energy", "price_change": -2.6}]
  }
}
```
"""

def parse_tool_call(content: str) -> Dict[str, Any]:
    """Parse tool call string from LLM response"""
    # Regex to match TOOL_CALL: name(args) with optional brackets []
    # Matches:
    # 1. [TOOL_CALL: func(a=1)]
    # 2. TOOL_CALL: func(a=1)
    pattern = r'\[?TOOL_CALL:\s*(\w+)\((.*?)\)\]?'
    match = re.search(pattern, content)
    
    if not match:
        return None
    
    tool_name = match.group(1)
    args_str = match.group(2)
    
    arguments = {}
    if args_str:
        # Simple parsing for key=value pairs, handling quoted strings
        # This is a basic parser, might need improvement for complex nested objects
        # tailored for the expected output format of Phi-4
        try:
            # Try to parse as lazy json-like k=v
            # A more robust regex for key="value" or key=value
            arg_pattern = r'(\w+)=(?:"([^"]*)"|([^,]*))'
            for arg_match in re.finditer(arg_pattern, args_str):
                key = arg_match.group(1)
                val = arg_match.group(2) or arg_match.group(3)
                if val is not None:
                    # Strip quotes if they exist (group 2 captured inside quotes, group 3 captured without)
                    # If it was group 2, it's already a string.
                    # If it was group 3, it might be a number or string.
                    clean_val = val.strip()
                    
                    # Try to convert to number
                    if clean_val.isdigit():
                        arguments[key] = int(clean_val)
                    else:
                        try:
                            arguments[key] = float(clean_val)
                        except ValueError:
                            # Keep as string
                            arguments[key] = clean_val
        except Exception:
            pass
            
    return {"name": tool_name, "arguments": arguments}

# ==============================================================================
# Nodes
# ==============================================================================

async def model_node(state: AgentState):
    """
    The agent node that calls the LLM.
    It handles:
    1. Constructing the prompt
    2. Invoking the LLM
    3. Parsing the output for tool calls
    """
    messages = state['messages']
    
    # Ensure system prompt is the first message
    # In a real app, we might want to check if it's already there or manage it better
    system_prompt = get_system_prompt()
    
    # We construct a list for the LLM call, ensuring system prompt is first
    llm_messages = [SystemMessage(content=system_prompt)]
    
    # Append conversation history, filtering out system messages if we already added one
    for msg in messages:
        if isinstance(msg, SystemMessage):
            continue
        llm_messages.append(msg)
        
    # Initialize LLM based on provider
    provider = os.environ.get("LLM_PROVIDER", "ollama").lower()
    api_key = os.environ.get("LLM_API_KEY")
    
    if provider == "groq":
        from langchain_groq import ChatGroq
        model_name = os.environ.get("LLM_MODEL_NAME", "llama-3.3-70b-versatile")
        
        llm = ChatGroq(
            groq_api_key=api_key,
            model_name=model_name,
            temperature=0.3, # Low temp for tool consistency
            streaming=True,
        )
    elif provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        model_name = os.environ.get("LLM_MODEL_NAME", "gemini-1.5-flash")
        
        llm = ChatGoogleGenerativeAI(
            google_api_key=api_key,
            model=model_name,
            temperature=0.3,
            streaming=True,
        )
    else:
        # Default to Ollama
        # Hardcode for now as env var is missing in container
        base_url = os.environ.get("OLLAMA_BASE_URL", "http://stockastic-ollama:11434")
        model_name = os.environ.get("LLM_MODEL_NAME", "phi3.5")
        
        llm = ChatOllama(
            base_url=base_url,
            model=model_name,
            temperature=0.3, # Low temp for tool consistency
            num_ctx=8192,
            keep_alive="60m", # Keep model loaded for longer
            streaming=True, # Critical for token streaming
        )
    
    # Use astream to enable token-by-token processing by the tracer
    full_response = ""
    async for chunk in llm.astream(llm_messages):
        full_response += chunk.content
        
    content = full_response
    
    # Check for tool calls
    parsed = parse_tool_call(content)
    
    if parsed:
        # Check if we've already successfully called this tool with these args in this conversation
        call_key = f"{parsed['name']}({json.dumps(parsed['arguments'], sort_keys=True)})"
        
        previous_successful_calls = []
        for i, msg in enumerate(messages):
            if isinstance(msg, ToolMessage):
                # The message before a ToolMessage is usually the AIMessage that called it
                prev_msg = messages[i-1] if i > 0 else None
                if prev_msg and hasattr(prev_msg, 'tool_calls'):
                    for tc in prev_msg.tool_calls:
                        if tc['id'] == msg.tool_call_id:
                            previous_successful_calls.append(f"{tc['name']}({json.dumps(tc['args'], sort_keys=True)})")
        
        if call_key in previous_successful_calls:
            # We are repeating a tool call that ALREADY result in data. STOP.
            # We use a special marker to tell the user we're halting
            halt_content = "I've already obtained the data for this request. Here is the analysis: " + content.replace(f"[TOOL_CALL: {parsed['name']}", "[ALREADY_CALLED]")
            return {"messages": [AIMessage(content=halt_content)]}

        # We found a new tool call!
        import uuid
        call_id = str(uuid.uuid4())
        
        tool_call = {
            "name": parsed["name"],
            "args": parsed["arguments"],
            "id": call_id,
            "type": "tool_call"
        }
        
        return {"messages": [AIMessage(content=content, tool_calls=[tool_call])]}
    
    # No tool call, just normal response
    return {"messages": [AIMessage(content=content)]}


async def tool_node(state: AgentState):
    """
    Executes tools requested by the agent.
    """
    from asgiref.sync import sync_to_async
    
    messages = state['messages']
    last_message = messages[-1]
    user = state.get('user')
    
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        # Should not happen given the edge logic, but safe guard
        return {"messages": []}
    
    results = []
    
    for tool_call in last_message.tool_calls:
        tool_name = tool_call['name']
        args = tool_call['args']
        call_id = tool_call['id']
        
        print(f"🔧 Executing Tool: {tool_name} with args: {args}")
        
        # Get tool from registry
        tool = ToolRegistry.get_tool(tool_name)
        
        if tool:
            try:
                # Execute tool
                # We pass the user object if required by the tool.
                # Our BaseTool.execute takes (user, **kwargs)
                # Since tools access DB, we must wrap in sync_to_async or run in thread
                if user:
                    # sync_to_async wrapper for the tool execution
                    execute_async = sync_to_async(tool.execute)
                    tool_result = await execute_async(user, **args)
                else:
                    tool_result = {"error": "User context missing for tool execution"}
                    
            except Exception as e:
                tool_result = {"error": f"Tool execution failed: {str(e)}"}
        else:
            tool_result = {"error": f"Tool '{tool_name}' not found"}
            
        # Create ToolMessage
        results.append(ToolMessage(
            tool_call_id=call_id,
            name=tool_name,
            content=json.dumps(tool_result, default=str) # Content must be string, safer json dump
        ))
        
    return {"messages": results}

# ==============================================================================
# Graph Definition
# ==============================================================================

def should_continue(state: AgentState):
    """
    Determine the next node based on the last message.
    """
    messages = state['messages']
    last_message = messages[-1]
    
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tools"
    
    return END

# Initialize the graph
workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("agent", model_node)
workflow.add_node("tools", tool_node)

# Add edges
workflow.set_entry_point("agent")

workflow.add_conditional_edges(
    "agent",
    should_continue,
    {
        "tools": "tools",
        END: END
    }
)

workflow.add_edge("tools", "agent")

# Compile the graph
app = workflow.compile()
