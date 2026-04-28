import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { DesignApprovalInput } from '@determinant/types';

/**
 * Mutation hook for approving or requesting changes to a design
 */
export function useApproveDesign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      nodeId, 
      data 
    }: { 
      nodeId: string; 
      data: DesignApprovalInput 
    }) => apiClient.approveDesign(nodeId, data),
    
    onSuccess: () => {
      // Invalidate relevant queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['humanQueue'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}
