import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

/**
 * Fetch distinct working directories from tasks
 * Cached for 5 minutes to reduce server load
 */
export function useWorkDirs() {
  return useQuery({
    queryKey: ['work-dirs'],
    queryFn: () => apiClient.getWorkDirs(),
    select: (data) => data.workingDirs,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
