import json
import re
from typing import List, Dict, Generator, Any
from ..tools.registry import ToolRegistry
from agentic.llm import LLMFactory


class StockasticAIAgent:
    """
    Main AI agent for Stockastic with tool calling capabilities
    """
    
    def __init__(self):
        self.llm_provider = LLMFactory.get_provider()
        self.tool_registry = ToolRegistry
        self.max_iterations = 5  # Prevent infinite loops
    
        return """You are Stockastic AI, an intelligent financial assistant for the Stockastic trading platform.

You have access to various tools to help users with stock price data, portfolio management, and market analysis.

To call a tool, use this format:
[TOOL_CALL: tool_name(param1="value1", param2="value2")]

### Generative UI Protocol
When presenting specialized data, use the `gen-ui` markdown block to render rich interactive components.
Example components: `StockCard`, `WhaleWatchCard`, `FibonacciCard`.

Example:
```gen-ui
{ "component": "StockCard", "data": { "symbol": "NABIL", "price": 450.5, "change": 5.2, "change_pct": 1.15 } }
```

When you receive tool results, analyze them and provide a clear response using these rich components when appropriate.

Available tools:
{tools}
"""
    
    def _format_tool_definitions(self) -> str:
        """Format tool definitions for the system prompt"""
        tools = self.tool_registry.get_all_tools()
        tool_descriptions = []
        
        for tool in tools:
            params = ", ".join([
                f"{p.name}: {p.type}" + (" (required)" if p.required else " (optional)")
                for p in tool.parameters
            ])
            tool_descriptions.append(
                f"- {tool.name}({params}): {tool.description}"
            )
        
        return "\n".join(tool_descriptions)
    
    def _execute_tool_call(self, user, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool call"""
        tool = self.tool_registry.get_tool(tool_name)
        
        if not tool:
            return {"error": f"Tool {tool_name} not found"}
        
        try:
            result = tool.execute(user, **arguments)
            return result
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {"error": f"Tool execution failed: {str(e)}"}
    
    def process_request(
        self, 
        user, 
        messages: List[Dict[str, str]]
    ) -> Generator[str, None, None]:
        """
        Process user request with tool calling support
        
        Args:
            user: Django user object
            messages: Conversation history
            
        Yields:
            Response chunks
        """
        # Add system prompt
        system_prompt = self._create_system_prompt().format(
            tools=self._format_tool_definitions()
        )
        
        full_messages = [
            {"role": "system", "content": system_prompt},
            *messages
        ]
        
        iteration = 0
        
        while iteration < self.max_iterations:
            iteration += 1
            
            # Get LLM response
            try:
                # Generate response from LLM
                response = self.llm_provider.generate_response(full_messages)
                
                # Check if response contains tool call
                tool_call = self._parse_tool_call(response)
                
                if tool_call:
                    # Execute tool
                    yield f"\n\n🔧 **Using tool**: `{tool_call['name']}`\n\n"
                    
                    result = self._execute_tool_call(
                        user,
                        tool_call['name'],
                        tool_call['arguments']
                    )
                    
                    # Add tool result to conversation
                    full_messages.append({
                        "role": "assistant",
                        "content": f"[TOOL_CALL: {tool_call['name']}({self._format_args(tool_call['arguments'])})]"
                    })
                    full_messages.append({
                        "role": "user",
                        "content": f"[TOOL_RESULT: {json.dumps(result, indent=2)}]\n\nNow provide a clear, helpful response to the user based on this data. Format numbers nicely and be concise."
                    })
                    
                    # Continue to get final response
                    continue
                else:
                    # No tool call, this is the final response
                    # Remove any remaining tool call markers
                    clean_response = re.sub(r'\[TOOL_CALL:.*?\]', '', response)
                    yield clean_response.strip()
                    break
                    
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"\n\n❌ **Error**: {str(e)}\n\n"
                break
        
        if iteration >= self.max_iterations:
            yield "\n\n⚠️ Maximum iterations reached. Please try rephrasing your question.\n\n"
    
    def _format_args(self, arguments: Dict[str, Any]) -> str:
        """Format arguments for display"""
        parts = []
        for key, value in arguments.items():
            if isinstance(value, str):
                parts.append(f'{key}="{value}"')
            else:
                parts.append(f'{key}={value}')
        return ", ".join(parts)
    
    def _parse_tool_call(self, response: str) -> Dict[str, Any]:
        """
        Parse tool call from LLM response
        
        Expected format:
        [TOOL_CALL: tool_name(arg1="value1", arg2="value2")]
        or
        [TOOL_CALL: tool_name(arg1=value1, arg2=value2)]
        """
        # Look for tool call pattern
        pattern = r'\[TOOL_CALL:\s*(\w+)\((.*?)\)\]'
        match = re.search(pattern, response, re.DOTALL)
        
        if not match:
            return None
        
        tool_name = match.group(1)
        args_str = match.group(2).strip()
        
        # Parse arguments
        arguments = {}
        if args_str:
            # More robust parsing: handle quoted strings and various formats
            # Pattern to match key=value pairs
            arg_pattern = r'(\w+)\s*=\s*([^,]+?)(?=,\s*\w+\s*=|$)'
            
            for match in re.finditer(arg_pattern, args_str):
                key = match.group(1).strip()
                value = match.group(2).strip()
                
                # Remove quotes if present
                if (value.startswith('"') and value.endswith('"')) or \
                   (value.startswith("'") and value.endswith("'")):
                    value = value[1:-1]
                
                # Try to convert to appropriate type
                try:
                    if value.lower() == 'true':
                        value = True
                    elif value.lower() == 'false':
                        value = False
                    elif value.lower() == 'none' or value.lower() == 'null':
                        value = None
                    elif value.isdigit():
                        value = int(value)
                    elif '.' in value:
                        try:
                            value = float(value)
                        except:
                            pass
                except:
                    pass
                
                arguments[key] = value
        
        return {
            "name": tool_name,
            "arguments": arguments
        }
