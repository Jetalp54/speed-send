// Centralized frontend API layer with stable named exports
// Provides compatibility with existing pages that import named APIs

// Use different URLs for server-side and client-side requests
// Server-side: Use Docker service name, Client-side: Use server IP
// Use different URLs for server-side and client-side requests
// Server-side: Use Docker service name, Client-side: Use server IP
export const API_URL: string = (() => {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000';
  }

  // Client-side logic
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  // If the env var is set to the docker service name (default in compose), it's useless for the browser.
  // We prefer the environment variable ONLY if it's a real URL (not "backend" or internal docker name).
  if (envUrl && !envUrl.includes('backend') && envUrl !== 'http://backend:8000') {
    return envUrl;
  }

  // Dynamic fallback: Use the current page's hostname with port 8000
  // This works for localhost, IP addresses, and domains (assuming API is on same host:8000)
  return `${window.location.protocol}//${window.location.hostname}:8000`;
})();

export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  error?: string;
  status?: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': options.body instanceof FormData ? undefined as any : 'application/json',
          ...(options.headers || {}),
        } as any,
        ...options,
      });
      const contentType = response.headers.get('content-type') || '';
      let payload: any = undefined;
      if (contentType.includes('application/json')) {
        payload = await response.json();
      } else {
        payload = await response.text();
      }
      if (!response.ok) {
        return { error: (payload && (payload.detail || payload.error)) || `HTTP ${response.status}`, status: response.status };
      }
      return { data: payload, status: response.status };
    } catch (err: any) {
      return { error: err?.message || 'Network error' };
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;

// Simple health check utility used across pages
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({}));
    return json && (json.status === 'healthy' || json.status === 'ok' || json.name);
  } catch {
    return false;
  }
}

// Service Accounts API (backend prefix is /api/v1)
export const serviceAccountsApi = {
  list: () => apiClient.request(`/api/v1/accounts/`),
  create: (payload: any) => apiClient.request(`/api/v1/accounts/`, { method: 'POST', body: JSON.stringify(payload) }),
  delete: (id: number | string) => apiClient.request(`/api/v1/accounts/${id}`, { method: 'DELETE' }),
  // Note: backend sync endpoint may not exist yet; frontend expects it.
  sync: (id: number | string, admin_email: string) =>
    apiClient.request(`/api/v1/accounts/${id}/sync`, { method: 'POST', body: JSON.stringify({ admin_email }) }),
};

// Users API
export const usersApi = {
  list: (params?: { service_account_id?: number; is_active?: boolean; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.service_account_id != null) q.set('service_account_id', String(params.service_account_id));
    if (params?.is_active != null) q.set('is_active', String(params.is_active));
    if (params?.skip != null) q.set('skip', String(params.skip));
    if (params?.limit != null) q.set('limit', String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : '';
    return apiClient.request(`/api/v1/users/${suffix}`);
  },
};

// Campaigns API
export const campaignsApi = {
  list: () => apiClient.request(`/api/v1/campaigns/`),
  create: (payload: any) => apiClient.request(`/api/v1/campaigns/`, { method: 'POST', body: JSON.stringify(payload) }),
  get: (id: number | string) => apiClient.request(`/api/v1/campaigns/${id}`),
  update: (id: number | string, payload: any) => apiClient.request(`/api/v1/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
};

// Drafts API
export const draftsApi = {
  list: () => apiClient.request(`/api/v1/drafts/`),
  create: (payload: any) => apiClient.request(`/api/v1/drafts/`, { method: 'POST', body: JSON.stringify(payload) }),
};

// Data Lists API
export const dataListsApi = {
  list: () => apiClient.request(`/api/v1/data-lists/`),
  get: (id: number | string) => apiClient.request(`/api/v1/data-lists/${id}`),
  create: (payload: any) => apiClient.request(`/api/v1/data-lists/`, { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: number | string, payload: any) => apiClient.request(`/api/v1/data-lists/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  delete: (id: number | string) => apiClient.request(`/api/v1/data-lists/${id}`, { method: 'DELETE' }),
};

// Contacts API
export const contactsApi = {
  list: () => apiClient.request(`/api/v1/contacts/`),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.request(`/api/v1/contacts/upload`, { method: 'POST', body: formData });
  },
};

// Dashboard API
export const dashboardApi = {
  stats: () => apiClient.request(`/api/v1/dashboard/stats`),
};
