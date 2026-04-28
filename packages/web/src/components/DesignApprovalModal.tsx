import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { useApproveDesign } from '../hooks/use-approve-design';
import type { QueueItem } from '@determinant/types';
import { useTask } from '../hooks/use-tasks';

interface DesignApprovalModalProps {
  queueItem: QueueItem;
  isOpen: boolean;
  onClose: () => void;
}

export function DesignApprovalModal({ 
  queueItem, 
  isOpen, 
  onClose 
}: DesignApprovalModalProps) {
  // Fetch full task data to get all nodes
  const { data: taskData, isLoading: isLoadingTask, error: taskError } = useTask(queueItem.task.id);
  
  // Find the Design node (parent of DesignApproval node)
  const designNode = taskData?.nodes.find(n => 
    n.id === queueItem.node.parentNodeId && n.toStage === 'Design'
  );
  
  // Form state
  const [approved, setApproved] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState('');
  
  const { mutate: approve, isPending } = useApproveDesign();
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate approval decision was made
    if (approved === null) {
      toast.error('Please select to approve or request changes');
      return;
    }
    
    // Validate feedback if requesting changes
    if (!approved && !feedback.trim()) {
      toast.error('Please provide feedback for requested changes');
      return;
    }
    
    // Submit
    approve(
      {
        nodeId: queueItem.node.id,
        data: {
          approved,
          feedback: feedback.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(approved ? 'Design approved successfully' : 'Feedback submitted successfully');
          onClose();
        },
        onError: (error) => {
          toast.error(`Failed to submit: ${error.message}`);
        },
      }
    );
  };
  
  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6">
          
          <Dialog.Title className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Review Design - {queueItem.task.vibe}
          </Dialog.Title>
          
          {taskError ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              Error loading design: {taskError.message}
            </div>
          ) : isLoadingTask ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Loading design...
            </div>
          ) : !designNode ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              Error: Could not find Design node (parent node ID: {queueItem.node.parentNodeId})
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Design Content Display */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Technical Design
                </label>
                <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-md p-4 max-h-96 overflow-y-auto">
                  <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                    {designNode.content || 'No design content available'}
                  </pre>
                </div>
              </div>
              
              {/* Approval Decision */}
              <div className="mb-6 space-y-3">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Decision
                </label>
                
                <label className="flex items-start gap-3 p-4 border-2 border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer has-[:checked]:border-green-500 has-[:checked]:bg-green-50 dark:has-[:checked]:bg-green-900/20">
                  <input
                    type="radio"
                    name="approval-decision"
                    checked={approved === true}
                    onChange={() => setApproved(true)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      ✓ Approve Design
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      The design is ready for implementation
                    </div>
                  </div>
                </label>
                
                <label className="flex items-start gap-3 p-4 border-2 border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer has-[:checked]:border-yellow-500 has-[:checked]:bg-yellow-50 dark:has-[:checked]:bg-yellow-900/20">
                  <input
                    type="radio"
                    name="approval-decision"
                    checked={approved === false}
                    onChange={() => setApproved(false)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      ↻ Request Changes
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      The design needs revision
                    </div>
                  </div>
                </label>
              </div>
              
              {/* Feedback Field */}
              <div className="mb-6 space-y-2">
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Feedback {approved === false && <span className="text-red-600 dark:text-red-400">(required)</span>}
                  {approved === true && <span className="text-gray-500 dark:text-gray-400">(optional)</span>}
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={
                    approved === false 
                      ? "Describe what changes are needed..." 
                      : "Add any additional notes or context..."
                  }
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isPending ? 'Submitting...' : 'Submit Decision'}
                </button>
              </div>
            </form>
          )}
          
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
