import json
import concurrent.futures
from typing import List, Dict, Generator, Any, Tuple
from .base import Agent
from .conversational import ConversationalAgent
from ..registry import AgentRegistry
from ..prompts.agent_prompts import SUPERVISOR_PLANNING_PROMPT

class SupervisorAgent(Agent):
    """
    Orchestrates specialized agents based on a multi-step plan.
    Planner-Coordinator Architecture with Parallel Execution capabilities.
    """
    def __init__(self):
        super().__init__()
        self.conversational_agent = ConversationalAgent()
        
        # Hydrate agent map from registry
        self.agent_map = {}
        for metadata in AgentRegistry.get_all_metadata():
            agent_cls = AgentRegistry.get_agent_class(metadata.name)
            if agent_cls:
                self.agent_map[metadata.name] = agent_cls()
        
        # Ensure CHAT_AGENT is always available as fallback
        if "CHAT_AGENT" not in self.agent_map:
             self.agent_map["CHAT_AGENT"] = self.conversational_agent

        # Shared memory for data context across steps
        self.shared_memory_df = None

    def _plan_tasks(self, messages: List[Dict[str, str]]) -> List[List[Dict[str, str]]]:
        """
        Uses the LLM to generate a JSON execution plan.
        Returns a List of Lists (Stages of Tasks).
        """
        # Dynamically generate the list of agents for the prompt
        agent_descriptions = AgentRegistry.get_registry_prompt()
        final_system_prompt = f"{SUPERVISOR_PLANNING_PROMPT}\n\n{agent_descriptions}"
        
        planning_messages = [
            {"role": "system", "content": final_system_prompt},
            *messages[-3:] 
        ]
        
        try:
            response = self.provider.generate_response(planning_messages).strip()
            # Clean possible markdown formatting
            response = response.replace("```json", "").replace("```", "").strip()
            plan = json.loads(response)
            
            # Normalize to List[List[Dict]]
            if isinstance(plan, list):
                if not plan: return [[{"agent": "CHAT_AGENT", "instruction": "Respond to user."}]]
                
                # Check if it's a flat list (Old format) -> Convert to 1 stage
                if isinstance(plan[0], dict):
                    return [[task for task in plan]]
                
                # Check if it's already list of lists (New format)
                if isinstance(plan[0], list):
                    return plan
                    
            return [[{"agent": "CHAT_AGENT", "instruction": "Respond to user."}]]
        except Exception as e:
            print(f"Planning Error: {e}")
            return [[{"agent": "CHAT_AGENT", "instruction": "Respond to user."}]]

    def _run_task_sync(self, task_info: Dict[str, Any]) -> Tuple[str, Any]:
        """
        Helper to run a task synchronously in a separate thread.
        Returns (full_text_response, dataframe_if_any).
        """
        agent_name = task_info.get("agent_name")
        instruction = task_info.get("instruction")
        messages = task_info.get("messages")
        
        target_agent = self.agent_map.get(agent_name, self.conversational_agent)
        
        # Inject context if needed (thread-safe copy logic handled by caller essentially)
        # Note: shared_memory_df read is safe, write is not (handled after join)
        if agent_name == "PLOTTING_AGENT" and self.shared_memory_df is not None:
             target_agent.set_data_context(self.shared_memory_df)

        # Execute
        full_response = []
        try:
            for chunk in target_agent.process_request(messages):
                full_response.append(chunk)
        except Exception as e:
            full_response.append(f"**Error in {agent_name}**: {str(e)}")
            
        # Capture Data
        latest_df = getattr(target_agent, 'latest_df', None)
        
        return "".join(full_response), latest_df

    def _is_potential_chat_only(self, text: str) -> bool:
        """
        Determines if the input is likely a simple conversational message 
        that should skip the planning phase.
        """
        text = text.lower()
        
        # 1. SAFETY GUARD: If any financial keyword exists -> FORCE PLANNER
        financial_keywords = [
            'stock', 'price', 'market', 'nepse', 'share', 'dividend', 'bonus', 
            'analysis', 'chart', 'graph', 'plot', 'rsi', 'macd', 'indicator', 
            'volume', 'turnover', 'trading', 'floorsheet', 'broker', 'sector', 
            'banking', 'hydro', 'finance', 'money', 'invest', 'buy', 'sell'
        ]
        
        if any(keyword in text for keyword in financial_keywords):
            return False
            
        # 2. CONVERSATIONAL PATTERNS: If matches common chat patterns -> FAST TRACK
        chat_patterns = [
            'hi', 'hello', 'hey', 'greetings', 'good morning', 'good evening', 
            'hi there', 'hello there', 'who are you', 'what are you', 
            'how are you', 'how r u', 'what is this', 'help', 'thanks', 
            'thank you', 'thx', 'bye', 'goodbye', 'ok', 'okay', 'cool', 
            'awesome', 'great', 'exit'
        ]
        
        # Check against patterns (simple inclusion or fuzzy match)
        # Using simple inclusion for now, but protecting against sub-words logic might be needed 
        # e.g. "high" contains "hi" -> False positive?
        # Let's use exact word matching or startswith for greetings
        
        import re
        # Create regex for whole word matches or start of sentence
        pattern_str = "|".join([re.escape(p) for p in chat_patterns])
        if re.search(f"\\b({pattern_str})\\b", text):
            return True
            
        return False

    def process_request(self, messages: List[Dict[str, str]]) -> Generator[str, None, None]:
        # FAST-TRACK for Greetings & Simple Chat
        if messages:
            last_msg = messages[-1]["content"].strip()
            
            if self._is_potential_chat_only(last_msg):
                yield "<<<THOUGHT_START:Fast-Track>>>\nDetected simple conversation. Bypassing planner and delegating to Chat Agent.\n<<<THOUGHT_END>>>\n\n"
                for chunk in self.conversational_agent.process_request(messages):
                    yield chunk
                yield "[[FINISH]]"
                return

        print("DEBUG: Supervisor Generating Plan...")
        yield "[[STATUS:Planning Strategy...]]\n\n"
        
        self.shared_memory_df = None
        stages = self._plan_tasks(messages)
        
        # NARRATE THE PLAN
        plan_narration = f"I have devised an execution plan with {len(stages)} stages:\n"
        for i, stage in enumerate(stages):
            if len(stage) > 1:
                plan_narration += f"Stage {i+1}: **PARALLEL EXECUTION** ({len(stage)} tasks)\n"
            else:
                plan_narration += f"Stage {i+1}: **Sequential Execution**\n"
            
            for task in stage:
                agent = task.get('agent', 'Unknown')
                comp = task.get('complexity', 'detailed')
                instr = task.get('instruction', '')
                plan_narration += f"  - [{agent}] ({comp}): {instr}\n"
        
        yield f"<<<THOUGHT_START:Planning Strategy>>>\n{plan_narration}\n<<<THOUGHT_END>>>\n\n"
        print(f"DEBUG: Execution Plan: {stages}")
        
        original_user_msg = messages[-1]["content"] if messages else ""
        
        for i, stage in enumerate(stages):
            # STAGE EXECUTION
            if len(stage) == 0: continue
            
            # Prepare tasks for this stage
            tasks_payload = []
            for task in stage:
                agent_name = task.get("agent", "CHAT_AGENT")
                instruction = task.get("instruction", original_user_msg)
                complexity = task.get("complexity", "detailed")
                
                # Prepend complexity tag for the sub-agent to parse
                final_instruction = f"[COMPLEXITY: {complexity}] {instruction}"
                
                # Prepare isolated message history for the agent
                current_messages = messages.copy()
                if current_messages:
                    current_messages[-1] = {"role": "user", "content": final_instruction}
                else:
                    current_messages = [{"role": "user", "content": final_instruction}]
                
                tasks_payload.append({
                    "agent_name": agent_name,
                    "instruction": final_instruction,
                    "messages": current_messages
                })

            # Check for Parallelism
            if len(stage) > 1:
                # Parallel Execution
                
                with concurrent.futures.ThreadPoolExecutor(max_workers=len(stage)) as executor:
                    future_to_agent = {executor.submit(self._run_task_sync, t_info): t_info for t_info in tasks_payload}
                    
                    for future in concurrent.futures.as_completed(future_to_agent):
                        task_info = future_to_agent[future]
                        agent_name = task_info["agent_name"]
                        try:
                            response_text, df_result = future.result()
                            
                            # Readable Name Mapping
                            readable_names = {
                                "CHAT_AGENT": "General Chit-Chat",
                                "DAILY_PRICE_AGENT": "Market Price Analysis",
                                "INDICATOR_AGENT": "Technical Indicator Analysis",
                                "CANDLE_AGENT": "Candlestick Pattern Analysis",
                                "FLOORSHEET_AGENT": "Accumulation & Floorsheet Analysis",
                                "FUNDAMENTAL_AGENT": "Fundamental Financial Analysis",
                                "PLOTTING_AGENT": "Data Visualization"
                            }
                            display_name = readable_names.get(agent_name, agent_name.replace("_", " ").title())
                            
                            yield f"### {display_name} Report\n"
                            yield response_text
                            yield "\n\n"
                            
                            # Merge Data (Simple strategy: Update if new data found)
                            if df_result is not None and not df_result.empty:
                                self.shared_memory_df = df_result
                        except Exception as exc:
                            yield f"**{agent_name} failed**: {exc}\n"
            else:
                # Sequential Execution (Stream it to keep it snappy)
                # Move step description to Thinking block as requested
                task_instr = tasks_payload[0]['instruction']
                yield f"<<<THOUGHT_START:Sequential Task>>>\nExecuting: {task_instr}\n<<<THOUGHT_END>>>\n\n"
                
                # Direct streaming from the single agent
                task_info = tasks_payload[0]
                agent_name = task_info["agent_name"]
                target_agent = self.agent_map.get(agent_name, self.conversational_agent)
                
                if agent_name == "PLOTTING_AGENT" and self.shared_memory_df is not None:
                     target_agent.set_data_context(self.shared_memory_df)
                     
                for chunk in target_agent.process_request(task_info["messages"]):
                    yield chunk
                
                # Capture Data
                if hasattr(target_agent, 'latest_df') and not target_agent.latest_df.empty:
                    self.shared_memory_df = target_agent.latest_df
