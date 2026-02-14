from django.http import StreamingHttpResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import ChatSession, ChatMessage
from .serializers import ChatSessionSerializer, ChatMessageSerializer
import json

class ChatSessionViewSet(viewsets.ModelViewSet):
    serializer_class = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        session = self.get_object()
        messages = session.messages.all().order_by('timestamp')
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def add_message(self, request, pk=None):
        session = self.get_object()
        serializer = ChatMessageSerializer(data=request.data)
        if serializer.is_valid():
            user_msg = serializer.save(session=session)
            # Update session's updated_at timestamp
            session.save()

            # If the user sent a message, trigger AI response
            if user_msg.role == 'user':
                try:
                    from agentic.agents import SupervisorAgent
                    agent = SupervisorAgent()
                    
                    # Prepare message history
                    history = []
                    for msg in session.messages.all().order_by('timestamp'):
                        history.append({
                            "role": msg.role,
                            "content": msg.content
                        })
                    
                    # Generate response (consume generator)
                    ai_content = "".join(list(agent.process_request(history)))
                    
                    # Save AI response
                    ChatMessage.objects.create(
                        session=session,
                        role='assistant',
                        content=ai_content
                    )
                    
                    # Reload messages to include the AI response
                    messages = session.messages.all().order_by('timestamp')
                    return Response(ChatMessageSerializer(messages, many=True).data, status=status.HTTP_201_CREATED)
                except Exception as e:
                    print(f"Error generating AI response: {str(e)}")
                    # Still return the user message even if AI fails
            
            # Always return the full message list for consistency
            messages = session.messages.all().order_by('timestamp')
            return Response(ChatMessageSerializer(messages, many=True).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def stream_message(self, request, pk=None):
        session = self.get_object()
        serializer = ChatMessageSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        user_msg = serializer.save(session=session)
        session.save() # Update updated_at

        # Pre-fetch history to ensure the latest message is included and avoid DB race conditions
        history_data = []
        for msg in session.messages.all().order_by('timestamp'):
            history_data.append({"role": msg.role, "content": msg.content})
            
        # Defensive: If for some reason the DB query didn't catch the just-saved message (transaction timing),
        # force append it.
        if not history_data or history_data[-1]['content'] != user_msg.content:
            history_data.append({"role": user_msg.role, "content": user_msg.content})

        def stream_generator():
            import queue
            import threading
            import asyncio
            from chat.graph import app
            from langchain_core.messages import HumanMessage, AIMessage
            from asgiref.sync import sync_to_async
            
            # Queue to bridge async producer and sync consumer
            q = queue.Queue()
            
            def run_async():
                # Create a new event loop for this thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                async def produce():
                    try:
                        # Prepare inputs
                        langchain_messages = []
                        for msg in history_data:
                            if msg['role'] == 'user':
                                langchain_messages.append(HumanMessage(content=msg['content']))
                            elif msg['role'] == 'assistant':
                                langchain_messages.append(AIMessage(content=msg['content']))
                        
                        if not langchain_messages or langchain_messages[-1].content != user_msg.content:
                            langchain_messages.append(HumanMessage(content=user_msg.content))
                        
                        inputs = {
                            "messages": langchain_messages,
                            "user": request.user
                        }

                        full_content = ""
                        current_turn_content = ""
                        suppress_this_turn = False
                        turn_count = 0
                        MAX_TURNS = 10 # Safety limit for tool calls
                        
                        # Async stream
                        async for event in app.astream_events(inputs, version="v1"):
                            kind = event["event"]
                            
                            if kind == "on_chat_model_start":
                                turn_count += 1
                                if turn_count > MAX_TURNS:
                                    q.put(f"data: {json.dumps({'content': '\n\n⚠️ **Error**: Too many tool calls. Stopping to prevent loop.'})}\n\n")
                                    break
                                
                                # print(f"DEBUG: Turn started for {event.get('name')}")
                                current_turn_content = ""
                                suppress_this_turn = False
                                
                            elif kind == "on_chat_model_stream":
                                content = event["data"]["chunk"].content
                                if content:
                                    current_turn_content += content
                                    
                                    # Anti-Hallucination: If we see a tool call start, we stop sending tokens
                                    # for this turn, as the model should only be outputting the tool call.
                                    if "[TOOL_CALL:" in current_turn_content:
                                        if not suppress_this_turn:
                                            # print(f"DEBUG: Tool call turn detected - suppressing stream")
                                            suppress_this_turn = True
                                        full_content += content
                                        continue
                                        
                                    full_content += content
                                    # print(f"DEBUG: Yielding token: {content}")
                                    q.put(f"data: {json.dumps({'content': content})}\n\n")
                            
                            elif kind == "on_chain_end" and event['name'] == "agent":
                                # Catch any content that was returned by the node but not streamed
                                # This is crucial for loop prevention halts
                                try:
                                    output = event['data']['output']
                                    if 'messages' in output and output['messages']:
                                        last_msg = output['messages'][-1]
                                        if isinstance(last_msg, AIMessage) and last_msg.content:
                                            # If this content is NOT already in our turned content, push it
                                            # We check if it's longer than what we've seen or significantly different
                                            if last_msg.content not in full_content:
                                                new_stuff = last_msg.content
                                                # If it starts with the stuff we already have, just get the diff
                                                if new_stuff.startswith(current_turn_content):
                                                   new_stuff = new_stuff[len(current_turn_content):]
                                                
                                                if new_stuff:
                                                    q.put(f"data: {json.dumps({'content': new_stuff})}\n\n")
                                                    full_content += new_stuff
                                except Exception as e:
                                    print(f"Error handling agent end: {e}")
                                    
                            elif kind == "on_chain_start" and event['name'] == "tools":
                                # Custom tool node start
                                try:
                                    # The input to the node is the state, so we get the last message
                                    messages = event['data']['input']['messages']
                                    last_msg = messages[-1]
                                    
                                    if hasattr(last_msg, 'tool_calls') and last_msg.tool_calls:
                                        for tc in last_msg.tool_calls:
                                            tool_name = tc.get('name')
                                            tool_args = tc.get('args')
                                            args_str = json.dumps(tool_args) if tool_args else "{}"
                                            
                                            update = f"\n\n🔧 **Using Tool**: `{tool_name}` with args: `{args_str}`\n\n"
                                            # Send to frontend ONLY, do not save to database to keep context clean
                                            q.put(f"data: {json.dumps({'content': update})}\n\n")
                                except Exception as e:
                                    print(f"Error parsing tool start: {e}")

                            elif kind == "on_tool_start":
                                # Keep this for compatibility if we switch to standard tools
                                tool_name = event['name']
                                tool_inputs = event['data'].get('input')
                                if tool_inputs:
                                     args = json.dumps(tool_inputs)
                                else:
                                     args = "{}"
                                
                                update = f"\n\n🔧 **Using Tool**: `{tool_name}` with args: `{args}`\n\n"
                                # Send to frontend ONLY
                                q.put(f"data: {json.dumps({'content': update})}\n\n")

                        # Save interaction
                        if full_content:
                            @sync_to_async
                            def save_message():
                                try:
                                    msg = ChatMessage.objects.create(
                                        session=session,
                                        role='assistant',
                                        content=full_content
                                    )
                                    print(f"DEBUG: Saved assistant message {msg.id} for session {session.id}")
                                    return msg
                                except Exception as save_err:
                                    print(f"ERROR: Failed to save message: {save_err}")
                                    raise
                            await save_message()
                        else:
                            print("DEBUG: No content to save for assistant message")
                            
                        q.put(f"data: {json.dumps({'content': '[[FINISH]]'})}\n\n")
                        q.put(None) # Done

                    except Exception as e:
                        import traceback
                        traceback.print_exc()
                        q.put(f"data: {json.dumps({'error': str(e)})}\n\n")
                        q.put(None)

                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(produce())
                finally:
                    try:
                        # Proper async cleanup
                        loop.run_until_complete(loop.shutdown_asyncgens())
                    except:
                        pass
                    loop.close()
                    # print("DEBUG: Async producer thread finished and loop closed")

            # Start the async producer in a separate thread
            t = threading.Thread(target=run_async, daemon=True)
            t.start()

            # Consume from queue synchronously
            while True:
                item = q.get()
                if item is None:
                    break
                yield item

        response = StreamingHttpResponse(stream_generator(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        return response
