import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import type { QuestionAnswersInput } from '@determinant/types';

/**
 * Mutation hook for approving questions
 */
export function useApproveQuestions() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ 
      nodeId, 
      data 
    }: { 
      nodeId: string; 
      data: QuestionAnswersInput 
    }) => apiClient.approveQuestions(nodeId, data),
    
    onSuccess: () => {
      // Invalidate relevant queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['humanQueue'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}
