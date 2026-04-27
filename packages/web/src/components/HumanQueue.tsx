import { useState } from 'react';
import { useHumanQueue } from '../hooks/use-human-queue';
import { QuestionAnswersModal } from './QuestionAnswersModal';
import { Badge } from './ui/Badge';
import { EmptyState } from './feedback/EmptyState';
import { ErrorBanner } from './feedback/ErrorBanner';
import type { QueueItem } from '@determinant/types';

export function HumanQueue() {
  const { data: items, isLoading, error } = useHumanQueue();
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  
  if (isLoading) {
    return (
      <div className="p-4 text-gray-600 dark:text-gray-300">
        Loading human queue...
      </div>
    );
  }
  
  if (error) {
    return (
      <ErrorBanner error={error} />
    );
  }
  
  if (!items || items.length === 0) {
    return (
      <EmptyState
        title="No pending approvals"
        description="All tasks are running smoothly!"
      />
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Human Queue
        </h2>
        <Badge variant="warning" size="sm">
          {items.length} pending
        </Badge>
      </div>
      
      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.node.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {item.task.vibe}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="info" size="sm">
                    {item.node.toStage}
                  </Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {item.task.id.slice(0, 8)}
                  </span>
                </div>
              </div>
              
              <button
                onClick={() => setSelectedItem(item)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                Review
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {selectedItem && (
        <QuestionAnswersModal
          queueItem={selectedItem}
          isOpen={true}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
