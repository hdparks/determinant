import type {
  Task,
  Node,
  QueueItem,
  CreateTaskRequest,
  UpdateTaskStateRequest,
  UpdateTaskPriorityRequest,
  UpdateTaskVibeRequest,
  UpdateTaskDependencyRequest,
  TaskFilter,
  GetDependentsResponse,
  GetDependencyChainResponse,
} from '@determinant/types';

const API_URL = import.meta.env.VITE_DETERMINANT_SERVER_URL || 
  (import.meta.env.DEV && typeof window !== 'undefined' 
    ? window.location.origin 
    : 'http://localhost:10110');
const API_KEY = import.meta.env.VITE_DETERMINANT_API_KEY;

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, error.error || 'Request failed');
  }

  return response.json();
}

export const apiClient = {
  // Health check
  health: () => fetchApi<{ status: string }>('/api/health'),

  // Task endpoints
  listTasks: (filter?: TaskFilter) => {
    const params = new URLSearchParams();
    if (filter?.state) params.set('state', filter.state);
    const query = params.toString();
    return fetchApi<{ tasks: Task[] }>(`/api/tasks${query ? `?${query}` : ''}`);
  },

  getTask: (id: string) =>
    fetchApi<{ task: Task; nodes: Node[] }>(`/api/tasks/${id}`),

  createTask: (data: CreateTaskRequest) =>
    fetchApi<{ task: Task }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTaskState: (id: string, data: UpdateTaskStateRequest) =>
    fetchApi<{ task: Task }>(`/api/tasks/${id}/state`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateTaskPriority: (id: string, data: UpdateTaskPriorityRequest) =>
    fetchApi<{ task: Task }>(`/api/tasks/${id}/priority`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateTaskVibe: (id: string, data: UpdateTaskVibeRequest) =>
    fetchApi<{ task: Task }>(`/api/tasks/${id}/vibe`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateTaskDependency: (id: string, data: UpdateTaskDependencyRequest) =>
    fetchApi<{ task: Task }>(`/api/tasks/${id}/dependency`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getDependents: (id: string) =>
    fetchApi<GetDependentsResponse>(`/api/tasks/${id}/dependents`),

  getDependencyChain: (id: string) =>
    fetchApi<GetDependencyChainResponse>(`/api/tasks/${id}/dependency-chain`),

  // Queue endpoints
  getQueue: (limit = 10) =>
    fetchApi<{ items: QueueItem[] }>(`/api/queue?limit=${limit}`),
};

export { ApiError };
