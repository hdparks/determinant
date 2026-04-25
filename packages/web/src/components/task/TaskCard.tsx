import { Task, TaskDependencyInfo } from '@determinant/types';
import { Card } from '../ui/Card';
import { PriorityPill } from '../PriorityPill';
import { StateProgressIndicator } from '../StateProgressIndicator';
import { DependencyStatusIcon } from '../dependencies/DependencyStatusIcon';
import { DependencyBadge } from '../dependencies/DependencyBadge';
import { formatDateTime } from '../../lib/date-utils';

interface TaskCardProps {
  task: Task;
  onEdit?: (task: Task) => void;
  dependencyInfo?: TaskDependencyInfo | null;
}

export function TaskCard({ task, onEdit, dependencyInfo }: TaskCardProps) {
  return (
    <Card variant="bordered" padding="md" className="hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* Header: ID + Priority */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {task.id.substring(0, 8)}...
            </div>
            <div className="mt-1 font-medium text-gray-900 dark:text-white truncate">
              {task.vibe || 'Untitled Task'}
            </div>
          </div>
          <PriorityPill priority={task.priority} score={task.score} />
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-2 flex-wrap">
          <StateProgressIndicator currentState={task.state} />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDateTime(task.createdAt)}
          </span>
        </div>

        {/* Dependencies */}
        {dependencyInfo && (dependencyInfo.parent || dependencyInfo.dependents.length > 0) && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-200 dark:border-gray-700">
            <DependencyStatusIcon 
              isBlocked={dependencyInfo.isBlocked} 
              isBlocking={dependencyInfo.isBlocking} 
            />
            {dependencyInfo.parent && (
              <DependencyBadge type="blocked" task={dependencyInfo.parent} />
            )}
            {dependencyInfo.dependents.length > 0 && (
              <DependencyBadge type="blocking" count={dependencyInfo.dependents.length} />
            )}
          </div>
        )}

        {/* Action button (optional) */}
        {onEdit && (
          <button
            onClick={() => onEdit(task)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          >
            Edit
          </button>
        )}
      </div>
    </Card>
  );
}
