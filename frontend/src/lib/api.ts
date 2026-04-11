import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const ML_SERVICE_URL = process.env.NEXT_PUBLIC_ML_SERVICE_URL || 'http://localhost:8001';

// Main backend API client
const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

// ML service API client
export const mlApi = axios.create({
    baseURL: ML_SERVICE_URL,
    withCredentials: true,
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

// Request interceptor to add JWT token to both clients
const addAuthInterceptor = (client: typeof api) => {
    client.interceptors.request.use(
        (config) => {
            const token = Cookies.get('access_token') || localStorage.getItem('access_token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        },
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
        const detail = error.response?.data?.detail;

        // If 401 and not already retrying
        if (status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            const refreshToken = Cookies.get('refresh_token') || localStorage.getItem('refresh_token');

            if (refreshToken) {
                try {
                    console.log('Attempting to refresh access token...');
                    const response = await axios.post(`${API_BASE_URL}/api/token/refresh/`, {
                        refresh: refreshToken
                    });

                    const { access, refresh: newRefresh } = response.data;

                    // Cookie expiry matches login behaviour (1 day) so the 5-second
                    // cookie-presence check in DashboardLayout doesn't evict the user
                    // between activity bursts. The JWT itself is still only valid for
                    // 15 min server-side; expiry is enforced there.
                    Cookies.set('access_token', access, { expires: 1, sameSite: 'lax' });
                    localStorage.setItem('access_token', access);

                    // Persist rotated refresh token (ROTATE_REFRESH_TOKENS=True means the
                    // old one is blacklisted after use — must store the new one or the
                    // next refresh attempt will fail and force a logout).
                    if (newRefresh) {
                        Cookies.set('refresh_token', newRefresh, { expires: 7, sameSite: 'lax' });
                        localStorage.setItem('refresh_token', newRefresh);
                    }

                    // Update header and retry
                    originalRequest.headers.Authorization = `Bearer ${access}`;
                    return api(originalRequest);
                } catch (refreshError) {
                    console.error('Refresh token expired or invalid. Logging out...');
                    logoutAndRedirect();
                }
            } else {
                logoutAndRedirect();
            }
        }

        // Handle network/connection errors (backend down)
        if (error.code === 'ERR_NETWORK' || !error.response) {
            console.error('Terminal backend is unreachable. System might be offline.');
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('terminal-offline'));
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
        // Check cookies first, then localStorage (same as axios interceptor)
        const token = Cookies.get('access_token') || localStorage.getItem('access_token');
        const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        if (!token) {
            console.error('No authentication token found');
            throw new Error('Authentication required');
        }

        const response = await fetch(`${baseURL}/api/chat/sessions/${sessionId}/stream_message/`, {
            method: 'POST',
            credentials: 'include', // Important for CORS with cookies
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
