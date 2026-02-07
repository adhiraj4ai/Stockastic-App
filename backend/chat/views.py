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
            from agentic.agents import SupervisorAgent
            
            try:
                # Use the Supervisor Agent to route and handle the request
                agent = SupervisorAgent()
                
                full_content = ""
                # process_request determines the correct sub-agent and streams its response
                for chunk in agent.process_request(history_data):
                    if chunk:
                        # Defensive: Ensure chunk is a string
                        if not isinstance(chunk, str):
                            print(f"Warning: agent yielded non-string chunk: {type(chunk)} - {chunk}")
                            chunk = str(chunk)
                            
                        full_content += chunk
                        yield f"data: {json.dumps({'content': chunk})}\n\n"
                
                # Save the complete AI response
                if full_content:
                    ChatMessage.objects.create(
                        session=session,
                        role='assistant',
                        content=full_content
                    )
                    
                # Signal completion to frontend
                yield f"data: {json.dumps({'content': '[[FINISH]]'})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        response = StreamingHttpResponse(stream_generator(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        return response
