import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { useTask } from '../hooks/use-tasks';
import { useDependencyInfo } from '../hooks/use-dependencies';
import { DependencyList } from './dependencies/DependencyList';
import { StateProgressIndicator } from './StateProgressIndicator';
import { PriorityPill } from './PriorityPill';
import { formatDateTime } from '../lib/date-utils';

interface TaskDetailModalProps {
  taskId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (taskId: string) => void;
}

export function TaskDetailModal({ taskId, isOpen, onClose, onNavigate }: TaskDetailModalProps) {
  const { data: taskData, isLoading } = useTask(taskId || '');
  const task = taskData?.task;
  const depInfo = useDependencyInfo(task);
  
  if (!taskId) return null;
  
  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
          {isLoading ? (
            <>
              <VisuallyHidden.Root asChild>
                <Dialog.Title>Loading Task Details</Dialog.Title>
              </VisuallyHidden.Root>
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
            </>
          ) : task ? (
            <>
              <Dialog.Title className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                {task.vibe}
              </Dialog.Title>
              
              <div className="space-y-6">
                {/* Metadata */}
                <div className="flex items-center gap-4 flex-wrap">
                  <StateProgressIndicator currentState={task.state} />
                  <PriorityPill priority={task.priority} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Created: {formatDateTime(task.createdAt)}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                    ID: {task.id}
                  </span>
                </div>
                
                {/* Dependencies Section */}
                {depInfo && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Dependencies
                    </h3>
                    {depInfo.parent || depInfo.dependents.length > 0 ? (
                      <DependencyList
                        parent={depInfo.parent}
                        dependents={depInfo.dependents}
                        onNavigate={(id) => {
                          onNavigate?.(id);
                        }}
                      />
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No dependencies</p>
                    )}
                  </div>
                )}
                
                {/* Nodes Timeline */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Progress
                  </h3>
                  {taskData?.nodes && taskData.nodes.length > 0 ? (
                    <ul className="space-y-2">
                      {taskData.nodes.map(node => (
                        <li key={node.id} className="text-sm text-gray-700 dark:text-gray-300">
                          {node.fromStage ? `${node.fromStage} → ` : ''}{node.toStage}
                          {node.processedAt && (
                            <span className="ml-2 text-xs text-gray-500">
                              ✓ {new Date(node.processedAt).toLocaleString()}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No progress nodes</p>
                  )}
                </div>

                {/* Pins */}
                {task.pins && task.pins.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Pins
                    </h3>
                    <ul className="list-disc list-inside space-y-1">
                      {task.pins.map((pin, idx) => (
                        <li key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                          {pin}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Hints */}
                {task.hints && task.hints.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Hints
                    </h3>
                    <ul className="list-disc list-inside space-y-1">
                      {task.hints.map((hint, idx) => (
                        <li key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                          {hint}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              
              <Dialog.Close asChild>
                <button className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                  Close
                </button>
              </Dialog.Close>
            </>
          ) : (
            <>
              <VisuallyHidden.Root asChild>
                <Dialog.Title>Error Loading Task</Dialog.Title>
              </VisuallyHidden.Root>
              <div className="text-center py-8 text-red-600 dark:text-red-400">Task not found</div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
