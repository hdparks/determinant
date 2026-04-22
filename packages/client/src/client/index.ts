import { Task, TaskState, Node, HeapConfig, QueueItem, CreateTaskRequest, UpdateTaskStateRequest, UpdateTaskPriorityRequest } from '@determinant/types';

const DEFAULT_BASE_URL = process.env.DETERMINANT_SERVER_URL ?? 'http://localhost:10110';

export class DeterminantClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(options?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
    this.apiKey = options?.apiKey ?? process.env.DETERMINANT_API_KEY ?? '';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error ?? `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async health(): Promise<{ status: string }> {
    return this.request('/api/health');
  }

  async listTasks(state?: TaskState): Promise<{ tasks: Task[] }> {
    const query = state ? `?state=${state}` : '';
    return this.request(`/api/tasks${query}`);
  }

  async createTask(req: CreateTaskRequest): Promise<{ task: Task }> {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async getTask(id: string): Promise<{ task: Task; nodes: Node[] }> {
    return this.request(`/api/tasks/${id}`);
  }

  async updateTaskState(id: string, req: UpdateTaskStateRequest): Promise<{ task: Task }> {
    return this.request(`/api/tasks/${id}/state`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  }

  async updateTaskPriority(id: string, req: UpdateTaskPriorityRequest): Promise<{ task: Task }> {
    return this.request(`/api/tasks/${id}/priority`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  }

  /**
   * Create a new node in the system
   */
  async createNode(nodeData: Omit<Node, 'id' | 'createdAt'>): Promise<Node> {
    const response = await this.request<{ node: Node }>(`/api/tasks/${nodeData.taskId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(nodeData),
    });
    return response.node;
  }

  /**
   * Get a specific node by ID
   */
  async getNode(nodeId: string): Promise<Node> {
    const response = await this.request<{ node: Node }>(`/api/nodes/${nodeId}`, {
      method: 'GET',
    });
    return response.node;
  }

  /**
   * Update an existing node
   */
  async updateNode(nodeId: string, updates: Partial<Node>): Promise<Node> {
    const response = await this.request<{ node: Node }>(`/api/nodes/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return response.node;
  }

  async getQueue(limit: number = 10): Promise<{ items: QueueItem[] }> {
    return this.request(`/api/queue?limit=${limit}`);
  }

  async getHeapConfig(): Promise<{ config: HeapConfig }> {
    return this.request('/api/heap-config');
  }

  async updateHeapConfig(config: Partial<HeapConfig>): Promise<{ config: HeapConfig }> {
    return this.request('/api/heap-config', {
      method: 'PATCH',
      body: JSON.stringify(config),
    });
  }
}