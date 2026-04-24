import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';

export function useQueue(limit = 10) {
  return useQuery({
    queryKey: ['queue', limit],
    queryFn: () => apiClient.getQueue(limit),
    select: (data) => data.items,
    refetchInterval: 5000, // Poll every 5 seconds
  });
}
