import axios from 'axios';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
});

// Helper to clear session
const logoutAndRedirect = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    // Clear cookies
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';

    // Force redirect to login
    window.location.href = '/login';
};

// Request interceptor for auth token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response interceptor for global error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response ? error.response.status : null;
        const detail = error.response?.data?.detail;

        // Check for 401 or specific invalid token error messages
        if (status === 401 || (detail && detail.includes('token not valid'))) {
            console.error('Session expired or invalid token. Logging out...');
            logoutAndRedirect();
        }

        return Promise.reject(error);
    }
);

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export interface ChatSession {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
}

export const chatApi = {
    getSessions: () => api.get<ChatSession[]>('/api/chat/sessions/'),
    createSession: (title: string = 'New Chat') => api.post<ChatSession>('/api/chat/sessions/', { title }),
    renameSession: (id: string, title: string) => api.patch<ChatSession>(`/api/chat/sessions/${id}/`, { title }),
    deleteSession: (id: string) => api.delete(`/api/chat/sessions/${id}/`),
    getMessages: (sessionId: string) => api.get<ChatMessage[]>(`/api/chat/sessions/${sessionId}/messages/`),
    addMessage: (sessionId: string, role: string, content: string) =>
        api.post<ChatMessage[]>(`/api/chat/sessions/${sessionId}/add_message/`, { role, content }),
    streamMessage: async (sessionId: string, role: string, content: string, onChunk: (chunk: string) => void) => {
        const token = localStorage.getItem('access_token');
        const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        const response = await fetch(`${baseURL}/api/chat/sessions/${sessionId}/stream_message/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ role, content })
        });

        if (!response.ok) {
            throw new Error(`Failed to stream: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) return;

        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // Keep the last partial line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(trimmedLine.slice(6));
                        if (data.content) {
                            onChunk(data.content);
                        } else if (data.error) {
                            console.error('Streaming error from backend:', data.error);
                        }
                    } catch (e) {
                        console.error('Error parsing stream chunk JSON:', e, 'Line:', trimmedLine);
                    }
                }
            }
        }
    }
};

export default api;
