import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const ML_SERVICE_URL = process.env.NEXT_PUBLIC_ML_SERVICE_URL || 'http://localhost:8001';

// Main backend API client
const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    xsrfCookieName: 'csrftoken',
    xsrfHeaderName: 'X-CSRFToken',
    withXSRFToken: true,
});

// ML service API client
export const mlApi = axios.create({
    baseURL: ML_SERVICE_URL,
    withCredentials: true,
    xsrfCookieName: 'csrftoken',
    xsrfHeaderName: 'X-CSRFToken',
    withXSRFToken: true,
});

// Helper to clear session
const logoutAndRedirect = () => {
    // Note: LocalStorage items are removed just in case of stale cache,
    // but the primary tokens are now in HttpOnly cookies which JS cannot clear manually.
    // The backend /api/auth/logout/ should be used to clear them properly.
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    // Attempt to clear non-httpOnly cookies if any were set by mistake
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';

    // Force redirect to login
    window.location.href = '/login';
};

// Request interceptor: The browser now handles the access_token cookie automatically 
// via withCredentials: true. No manual Authorization header injection is needed.
const addAuthInterceptor = (client: typeof api) => {
    client.interceptors.request.use(
        (config) => config,
        (error) => Promise.reject(error)
    );
};

// Apply interceptors to both API clients
addAuthInterceptor(api);
addAuthInterceptor(mlApi);

// Response interceptor for global error handling and JWT refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const status = error.response ? error.response.status : null;

        // If 401 (Unauthorized) and not already retrying
        if (status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                console.log('Attempting to refresh access token via HttpOnly cookies...');
                // Note: dj-rest-auth refresh endpoint automatically reads/writes 
                // httpOnly cookies if configured.
                await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {}, { withCredentials: true });

                // If successful, retry the original request which will now include the new cookie
                return api(originalRequest);
            } catch (refreshError) {
                console.error('Session expired or refresh failed. Logging out...');
                logoutAndRedirect();
            }
        }

        // Handle network/connection errors (backend down)
        if (error.code === 'ERR_NETWORK' || !error.response) {
            console.error('Terminal backend connection error. Verifying system status...');
            
            if (typeof window !== 'undefined') {
                try {
                    // Perform a secondary lightweight health check to verify if backend is truly unreachable
                    // or if this was just a transient/blocked request
                    const healthUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/api/stocks/health-check/';
                    const healthCheck = await axios.get(healthUrl, { timeout: 2000 });
                    
                    if (healthCheck.data.status === 'online') {
                        console.log('Backend is reachable. Treating previous error as transient.');
                    } else {
                        window.dispatchEvent(new CustomEvent('terminal-offline'));
                    }
                } catch (healthErr) {
                    console.error('Health check failed. Signaling system offline.');
                    window.dispatchEvent(new CustomEvent('terminal-offline'));
                }
            }
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
        const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        const response = await fetch(`${baseURL}/api/chat/sessions/${sessionId}/stream_message/`, {
            method: 'POST',
            credentials: 'include', 
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': Cookies.get('csrftoken') || '',
            },
            body: JSON.stringify({ role, content })
        });

        if (!response.ok) {
            console.error('Stream request failed:', response.status, response.statusText);
            if (response.status === 401) {
                console.error('Token expired during streaming. Redirecting to login.');
                logoutAndRedirect();
                return;
            }
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
