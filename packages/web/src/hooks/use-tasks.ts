import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { useSSE } from './use-sse';
import { useTaskCelebration } from './use-task-celebration';
import type {
  CreateTaskRequest,
  UpdateTaskStateRequest,
  UpdateTaskPriorityRequest,
  UpdateTaskVibeRequest,
  TaskFilter,
  Task,
  Node,
  SSEEvent,
} from '@determinant/types';

export function useTasks(filter?: TaskFilter) {
  return useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => apiClient.listTasks(filter),
    select: (data) => data.tasks,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => apiClient.getTask(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTaskRequest) => apiClient.createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTaskState() {
  const queryClient = useQueryClient();
  const { celebrate } = useTaskCelebration();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskStateRequest }) =>
      apiClient.updateTaskState(id, data),
    onSuccess: (_, variables) => {
      // Celebrate when task reaches Released state
      if (variables.data.state === 'Released') {
        celebrate();
      }

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', variables.id] });
    },
  });
}

export function useUpdateTaskPriority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskPriorityRequest }) =>
      apiClient.updateTaskPriority(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', variables.id] });
    },
  });
}

export function useUpdateTaskVibe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskVibeRequest }) =>
      apiClient.updateTaskVibe(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', variables.id] });
    },
  });
}

// SSE sync hooks
export function useTaskSSESync() {
  const queryClient = useQueryClient();
  
  useSSE('task:created', (event: SSEEvent) => {
    if (event.type !== 'task:created') return;
    
    // Add new task to all relevant task list caches
    queryClient.setQueriesData(
      { queryKey: ['tasks'] },
      (old: { tasks: Task[] } | undefined) => {
        if (!old) return old;
        // Prepend new task to maintain backend's created_at DESC ordering
        // Backend returns tasks sorted newest-first (see task-store.ts:245)
        return { tasks: [event.data, ...old.tasks] };
      }
    );
  });
  
  useSSE('task:updated', (event: SSEEvent) => {
    if (event.type !== 'task:updated') return;
    
    // Update task in list cache
    queryClient.setQueriesData(
      { queryKey: ['tasks'] },
      (old: { tasks: Task[] } | undefined) => {
        if (!old) return old;
        return {
          tasks: old.tasks.map(t => 
            t.id === event.data.id ? event.data : t
          )
        };
      }
    );
    
    // Update individual task cache
    queryClient.setQueryData(
      ['task', event.data.id],
      (old: { task: Task; nodes: Node[] } | undefined) => {
        if (!old) return old;
        return { ...old, task: event.data };
      }
    );
  });
  
  useSSE('task:deleted', (event: SSEEvent) => {
    if (event.type !== 'task:deleted') return;
    
    const taskId = event.data; // string ID
    
    // Remove from list cache
    queryClient.setQueriesData(
      { queryKey: ['tasks'] },
      (old: { tasks: Task[] } | undefined) => {
        if (!old) return old;
        return {
          tasks: old.tasks.filter(t => t.id !== taskId)
        };
      }
    );
    
    // Remove individual task cache
    queryClient.removeQueries({ queryKey: ['task', taskId] });
  });
}

export function useNodeSSESync() {
  const queryClient = useQueryClient();
  
  useSSE('node:created', (event: SSEEvent) => {
    if (event.type !== 'node:created') return;
    
    const { task, node } = event.data;
    
    // Update task in list (task data may have changed)
    queryClient.setQueriesData(
      { queryKey: ['tasks'] },
      (old: { tasks: Task[] } | undefined) => {
        if (!old) return old;
        return {
          tasks: old.tasks.map(t => 
            t.id === task.id ? task : t
          )
        };
      }
    );
    
    // Add node to task detail cache
    queryClient.setQueryData(
      ['task', task.id],
      (old: { task: Task; nodes: Node[] } | undefined) => {
        if (!old) return old;
        return {
          task,
          nodes: [...old.nodes, node]
        };
      }
    );
  });
  
  useSSE('node:updated', (event: SSEEvent) => {
    if (event.type !== 'node:updated') return;
    
    const node = event.data;
    
    // Update node in task detail cache
    queryClient.setQueryData(
      ['task', node.taskId],
      (old: { task: Task; nodes: Node[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          nodes: old.nodes.map(n => 
            n.id === node.id ? node : n
          )
        };
      }
    );
  });
  
  useSSE('node:processed', (event: SSEEvent) => {
    if (event.type !== 'node:processed') return;
    
    // Same logic as node:updated (processed nodes update processedAt)
    const node = event.data;
    
    queryClient.setQueryData(
      ['task', node.taskId],
      (old: { task: Task; nodes: Node[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          nodes: old.nodes.map(n => 
            n.id === node.id ? node : n
          )
        };
      }
    );
  });
}

