const API_BASE = 'http://localhost:5000/api';

export const getAuthToken = (): string | null => {
  return localStorage.getItem('caflow_token');
};

export const setAuthToken = (token: string): void => {
  localStorage.setItem('caflow_token', token);
};

export const removeAuthToken = (): void => {
  localStorage.removeItem('caflow_token');
  localStorage.removeItem('caflow_user');
};

export const getCurrentUser = (): any | null => {
  const str = localStorage.getItem('caflow_user');
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
};

export const setCurrentUser = (user: any): void => {
  localStorage.setItem('caflow_user', JSON.stringify(user));
};

const inFlightGetRequests = new Map<string, Promise<any>>();

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const token = getAuthToken();

  // Deduplicate in-flight GET requests to prevent React StrictMode duplicate requests
  if (method === 'GET') {
    const dedupeKey = `${token || 'anon'}:${endpoint}`;
    const inFlight = inFlightGetRequests.get(dedupeKey);
    if (inFlight) {
      return inFlight as Promise<T>;
    }

    const requestPromise = executeRequest<T>(endpoint, options, token).finally(() => {
      inFlightGetRequests.delete(dedupeKey);
    });
    inFlightGetRequests.set(dedupeKey, requestPromise);
    return requestPromise;
  }

  return executeRequest<T>(endpoint, options, token);
}

async function executeRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  token: string | null
): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    ...(options.headers as Record<string, string> || {}),
  };

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    cache: 'no-store',
    ...options,
    headers,
  });

  // Handle empty bodies, HTTP 204 No Content
  if (res.status === 204) {
    return { success: true, data: [] } as any;
  }

  const text = await res.text();
  let data: any = null;
  if (text && text.trim().length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`API request failed with status ${res.status}`);
      }
      return text as any;
    }
  } else {
    data = { success: res.ok, data: [] };
  }

  if (!res.ok) {
    throw new Error(data?.message || `API request failed with status ${res.status}`);
  }

  return data;
}

export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  getMe: () => apiRequest('/auth/me'),
  getUsers: () => apiRequest('/auth/users'),

  // Dashboard
  getDashboardMetrics: () => apiRequest('/dashboard/metrics'),

  // Clients
  getClients: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    return apiRequest(`/clients${qs ? `?${qs}` : ''}`);
  },
  getClientGroups: () => apiRequest('/clients/meta/groups'),
  getClient: (id: string) => apiRequest(`/clients/${id}`),
  createClient: async (data: any) => {
    const res = await apiRequest('/clients', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('caflow:client-created', { detail: res.client }));
        window.dispatchEvent(new CustomEvent('caflow:clients-updated'));
        try {
          localStorage.setItem('caflow:last_client_update', Date.now().toString());
        } catch {}
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('caflow_client_events');
            bc.postMessage({ type: 'client-created', client: res.client, timestamp: Date.now() });
            bc.close();
          }
        } catch {}
      }
    }
    return res;
  },
  updateClient: async (id: string, data: any) => {
    const res = await apiRequest(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    if (res && res.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('caflow:clients-updated'));
        try {
          localStorage.setItem('caflow:last_client_update', Date.now().toString());
        } catch {}
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('caflow_client_events');
            bc.postMessage({ type: 'client-updated', timestamp: Date.now() });
            bc.close();
          }
        } catch {}
      }
    }
    return res;
  },
  deleteClient: async (id: string) => {
    const res = await apiRequest(`/clients/${id}`, { method: 'DELETE' });
    if (res && res.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('caflow:clients-updated'));
        try {
          localStorage.setItem('caflow:last_client_update', Date.now().toString());
        } catch {}
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('caflow_client_events');
            bc.postMessage({ type: 'client-deleted', timestamp: Date.now() });
            bc.close();
          }
        } catch {}
      }
    }
    return res;
  },

  // Tasks
  getTasks: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    return apiRequest(`/tasks${qs ? `?${qs}` : ''}`);
  },
  getTask: (id: string) => apiRequest(`/tasks/${id}`),
  createTask: (data: any) =>
    apiRequest('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTaskStatus: (id: string, status: string, remarks?: string) =>
    apiRequest(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, remarks }) }),
  toggleChecklist: (taskId: string, itemId: string, isCompleted: boolean) =>
    apiRequest(`/tasks/${taskId}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isCompleted }) }),
  addTaskComment: (taskId: string, comment: string) =>
    apiRequest(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ comment }) }),

  // To-Do
  getTodos: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    return apiRequest(`/todos${qs ? `?${qs}` : ''}`);
  },
  createTodo: (data: any) =>
    apiRequest('/todos', { method: 'POST', body: JSON.stringify(data) }),
  toggleTodo: (id: string) =>
    apiRequest(`/todos/${id}/toggle`, { method: 'PATCH' }),
  deleteTodo: (id: string) =>
    apiRequest(`/todos/${id}`, { method: 'DELETE' }),

  // Attendance
  getDailyAttendance: (date?: string) =>
    apiRequest(`/attendance/daily${date ? `?date=${date}` : ''}`),
  checkIn: () => apiRequest('/attendance/check-in', { method: 'POST' }),
  checkOut: () => apiRequest('/attendance/check-out', { method: 'POST' }),

  // Renewals
  getRenewals: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    return apiRequest(`/renewals${qs ? `?${qs}` : ''}`);
  },
  createRenewal: (data: any) =>
    apiRequest('/renewals', { method: 'POST', body: JSON.stringify(data) }),
  updateRenewalStatus: (id: string, status: string) =>
    apiRequest(`/renewals/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // Documents
  getInOutRecords: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    return apiRequest(`/documents/in-out${qs ? `?${qs}` : ''}`);
  },
  createInOutRecord: (data: any) =>
    apiRequest('/documents/in-out', { method: 'POST', body: JSON.stringify(data) }),
  returnDocument: (id: string) =>
    apiRequest(`/documents/in-out/${id}/return`, { method: 'PATCH' }),
  getVaultDocuments: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    return apiRequest(`/documents/vault${qs ? `?${qs}` : ''}`);
  },
  uploadVaultDocument: (data: FormData | any) => {
    const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
    return apiRequest('/documents/vault', {
      method: 'POST',
      body: isFormData ? data : JSON.stringify(data),
    });
  },
  downloadVaultDocument: async (id: string): Promise<Blob> => {
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/documents/vault/${id}/download`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      let msg = `Download failed with status ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.message) msg = errJson.message;
      } catch {}
      throw new Error(msg);
    }
    return res.blob();
  },
  getDocumentRequests: () => apiRequest('/documents/requests'),
  createDocumentRequest: (data: any) =>
    apiRequest('/documents/requests', { method: 'POST', body: JSON.stringify(data) }),

  // Finance
  getInvoices: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    return apiRequest(`/finance/invoices${qs ? `?${qs}` : ''}`);
  },
  createInvoice: (data: any) =>
    apiRequest('/finance/invoices', { method: 'POST', body: JSON.stringify(data) }),
  getPayments: () => apiRequest('/finance/payments'),
  createPayment: (data: any) =>
    apiRequest('/finance/payments', { method: 'POST', body: JSON.stringify(data) }),
  getExpenses: () => apiRequest('/finance/expenses'),

  // Timesheets
  getTimesheets: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    return apiRequest(`/timesheets${qs ? `?${qs}` : ''}`);
  },
  createTimesheet: (data: any) =>
    apiRequest('/timesheets', { method: 'POST', body: JSON.stringify(data) }),
  approveTimesheet: (id: string, status: string, remarks?: string) =>
    apiRequest(`/timesheets/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ status, remarks }) }),

  // Services
  getServices: () => apiRequest('/services'),
  createService: (data: any) =>
    apiRequest('/services', { method: 'POST', body: JSON.stringify(data) }),
  getRetainers: () => apiRequest('/services/retainers'),
  createRetainer: (data: any) =>
    apiRequest('/services/retainers', { method: 'POST', body: JSON.stringify(data) }),

  // Notifications
  getNotifications: () => apiRequest('/notifications'),
  getInAppNotifications: () => apiRequest('/notifications/in-app'),
  markNotificationRead: (id: string) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => apiRequest('/notifications/mark-all-read', { method: 'POST' }),
  sendNotification: (data: any) =>
    apiRequest('/notifications/send', { method: 'POST', body: JSON.stringify(data) }),

  // Reports
  getReportsSummary: () => apiRequest('/reports/summary'),

  // Settings
  getOrganizationSettings: () => apiRequest('/settings/organization'),
  updateOrganizationSettings: (data: any) =>
    apiRequest('/settings/organization', { method: 'PUT', body: JSON.stringify(data) }),
  getTeam: () => apiRequest('/settings/team'),

  // Voice Assistant
  processVoiceCommand: (transcript: string, language: string = 'en-IN', context?: any, history?: any[]) =>
    apiRequest('/voice/process', {
      method: 'POST',
      body: JSON.stringify({ transcript, language, context, history }),
    }),
  confirmVoiceAction: (confirmationToken: string, action: 'CONFIRM' | 'CANCEL') =>
    apiRequest('/voice/confirm', {
      method: 'POST',
      body: JSON.stringify({ confirmationToken, action }),
    }),
  getVoiceHistory: () => apiRequest('/voice/history'),
  clearVoiceHistory: () => apiRequest('/voice/history', { method: 'DELETE' }),
  synthesizeVoiceAudio: (text: string, language: string = 'en-IN') =>
    apiRequest('/voice/tts', {
      method: 'POST',
      body: JSON.stringify({ text, language }),
    }),
  transcribeVoiceAudio: async (audioBlob: Blob, language: string = 'en-IN') => {
    const token = getAuthToken();
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('language', language);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('http://localhost:5000/api/voice/stt', {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'STT failed');
    return data;
  },

  // Client Portal Authentication & Operations
  loginClientPortal: (businessName: string, phonePassword: string) =>
    apiRequest('/client-portal/login', {
      method: 'POST',
      body: JSON.stringify({ businessName, phonePassword }),
    }),
  validateClientPortal: (mobileNumber: string, clientName?: string) =>
    apiRequest('/client-portal/validate', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber, mobile: mobileNumber, clientName: clientName || undefined, name: clientName || undefined }),
    }),
  sendClientPortalOtp: (mobileNumber: string, clientName?: string) =>
    apiRequest('/client-portal/send-otp', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber, mobile: mobileNumber, clientName: clientName || undefined, name: clientName || undefined }),
    }),
  verifyClientPortalOtp: (mobileNumber: string, otp: string, clientName?: string) =>
    apiRequest('/client-portal/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber, mobile: mobileNumber, otp, clientName: clientName || undefined, name: clientName || undefined }),
    }),
  resendClientPortalOtp: (mobileNumber: string, clientName?: string) =>
    apiRequest('/client-portal/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber, mobile: mobileNumber, clientName: clientName || undefined, name: clientName || undefined }),
    }),
  logoutClientPortal: () =>
    apiRequest('/client-portal/logout', { method: 'POST' }),
  getClientPortalMe: () =>
    apiRequest('/client-portal/me'),
  getClientPortalDashboard: () =>
    apiRequest('/client-portal/dashboard'),
  uploadClientPortalDocument: (data: { name: string; category?: string; fileUrl: string; fileSize?: number; fileType?: string }) =>
    apiRequest('/client-portal/documents/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Universal Custom Dropdown Options for All Dashboards
  getCustomOptions: () =>
    apiRequest('/settings/custom-options'),
  addCustomOption: (categoryKey: string, option: string) =>
    apiRequest('/settings/custom-options', {
      method: 'POST',
      body: JSON.stringify({ categoryKey, option }),
    }),

  // Admin Client Portal Management
  getAdminClientPortal: (clientId: string) =>
    apiRequest(`/clients/${clientId}/portal`),
  updateAdminClientPortalStatus: (clientId: string, status: string) =>
    apiRequest(`/clients/${clientId}/portal/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  revokeAdminClientPortalSessions: (clientId: string) =>
    apiRequest(`/clients/${clientId}/portal/revoke-sessions`, {
      method: 'POST',
    }),
  updateAdminClientPortalMobile: (clientId: string, newMobile: string, reason?: string) =>
    apiRequest(`/clients/${clientId}/portal/update-mobile`, {
      method: 'POST',
      body: JSON.stringify({ newMobile, reason }),
    }),
  // Team & Employee Management with Credentials
  getTeamMembers: () =>
    apiRequest('/settings/team'),
  addTeamMember: (data: {
    fullName: string;
    email: string;
    password: string;
    role?: string;
    designation?: string;
    department?: string;
    phone?: string;
  }) =>
    apiRequest('/settings/team', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTeamMemberStatus: (id: string, isActive: boolean) =>
    apiRequest(`/settings/team/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),
  resetTeamMemberPassword: (id: string, newPassword: string) =>
    apiRequest(`/settings/team/${id}/credentials`, {
      method: 'PATCH',
      body: JSON.stringify({ newPassword }),
    }),
};
