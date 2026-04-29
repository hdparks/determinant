import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { Task, TaskDependencyInfo, UpdateTaskDependencyRequest } from '@determinant/types';

/**
 * Get tasks that depend on this task (reverse dependencies)
 */
export function useTaskDependents(taskId: string) {
  return useQuery({
    queryKey: ['task-dependents', taskId],
    queryFn: () => apiClient.getDependents(taskId),
    select: (data) => data.dependents,
    enabled: !!taskId,
  });
}

/**
 * Get full dependency chain from task to root
 */
export function useDependencyChain(taskId: string) {
  return useQuery({
    queryKey: ['dependency-chain', taskId],
    queryFn: () => apiClient.getDependencyChain(taskId),
    select: (data) => data.chain,
    enabled: !!taskId,
  });
}

/**
 * Compute dependency info for a task
 */
export function useDependencyInfo(task: Task | undefined): TaskDependencyInfo | null {
  const { data: chain } = useDependencyChain(task?.id || '');
  const { data: dependents } = useTaskDependents(task?.id || '');
  
  if (!task) return null;
  
  const parent = chain && chain.length > 1 ? chain[1] : null;
  const isBlocked = parent !== null && parent.state !== 'Released';
  const hasReleasedParent = parent !== null && parent.state === 'Released';
  const isBlocking = (dependents?.length || 0) > 0;
  
  return {
    parent,
    dependents: dependents || [],
    chainLength: chain?.length || 1,
    isBlocked,
    isBlocking,
    hasReleasedParent,
  };
}

/**
 * Mutation to update task dependency
 */
export function useUpdateTaskDependency() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskDependencyRequest }) =>
      apiClient.updateTaskDependency(id, data),
    onSuccess: (_, variables) => {
      // Invalidate all dependency-related queries
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['task-dependents'] });
      queryClient.invalidateQueries({ queryKey: ['dependency-chain'] });
    },
  });
}
