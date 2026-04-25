import { useState, useMemo } from 'react';
import { useTasks, useUpdateTaskVibe } from '../hooks/use-tasks';
import { useDependencyInfo } from '../hooks/use-dependencies';
import type { TaskState, Task } from '@determinant/types';
import { TASK_STATES } from '@determinant/types';
import { PriorityPill } from './PriorityPill';
import { StateProgressIndicator } from './StateProgressIndicator';
import { TaskCard } from './task/TaskCard';
import { TaskListSkeleton } from './feedback/LoadingSkeleton';
import { EmptyState } from './feedback/EmptyState';
import { ErrorBanner } from './feedback/ErrorBanner';
import { DependencyStatusIcon } from './dependencies/DependencyStatusIcon';
import { DependencyBadge } from './dependencies/DependencyBadge';
import { TaskDetailModal } from './TaskDetailModal';
import { formatDateTime } from '../lib/date-utils';

interface SortableHeaderProps {
  label: string;
  field: 'score' | 'createdAt';
  currentSort: { field: 'score' | 'createdAt'; direction: 'asc' | 'desc' } | null;
  onSort: (field: 'score' | 'createdAt') => void;
}

function SortableHeader({ label, field, currentSort, onSort }: SortableHeaderProps) {
  const isActive = currentSort?.field === field;
  const direction = isActive ? currentSort.direction : null;
  
  return (
    <th 
      scope="col" 
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none transition-colors"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-2">
        <span>{label}</span>
        <span className="flex flex-col text-gray-400 dark:text-gray-500">
          {direction === 'asc' ? (
            <span className="text-blue-600 dark:text-blue-400">↑</span>
          ) : direction === 'desc' ? (
            <span className="text-blue-600 dark:text-blue-400">↓</span>
          ) : (
            <span className="opacity-50">⇅</span>
          )}
        </span>
      </div>
    </th>
  );
}

export function TaskList() {
  const [filter, setFilter] = useState<TaskState | undefined>();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    field: 'score' | 'createdAt';
    direction: 'asc' | 'desc';
  } | null>(null);
  const { data: tasks, isLoading, isError, error, refetch } = useTasks(
    filter ? { state: filter } : undefined
  );
  const updateVibeMutation = useUpdateTaskVibe();

  const handleSort = (field: 'score' | 'createdAt') => {
    setSortConfig((current) => {
      // If clicking same field, toggle direction
      if (current?.field === field) {
        if (current.direction === 'desc') {
          return { field, direction: 'asc' };
        } else {
          // If ascending, clear sort (return to default)
          return null;
        }
      }
      // New field, start with descending
      return { field, direction: 'desc' };
    });
  };

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    setIsDetailModalOpen(true);
  };

  const handleTaskNavigate = (taskId: string) => {
    setSelectedTaskId(taskId);
    // Modal stays open, just switches task
  };

  // Helper component for dependency cell
  function TaskDependencyCell({ task }: { task: Task }) {
    const depInfo = useDependencyInfo(task);
    
    if (!depInfo) return null;
    
    return (
      <div className="flex items-center gap-2">
        <DependencyStatusIcon 
          isBlocked={depInfo.isBlocked} 
          isBlocking={depInfo.isBlocking} 
        />
        {depInfo.parent && (
          <DependencyBadge type="blocked" count={1} />
        )}
        {depInfo.dependents.length > 0 && (
          <DependencyBadge type="blocking" count={depInfo.dependents.length} />
        )}
      </div>
    );
  }

  const handleVibeEditStart = (task: Task) => {
    setEditingTaskId(task.id);
    setEditValue(task.vibe);
    setEditError(null);
  };

  const handleVibeEditCancel = () => {
    setEditingTaskId(null);
    setEditValue('');
    setEditError(null);
  };

  const handleVibeEditSave = async (taskId: string) => {
    // Client-side validation
    if (!editValue.trim()) {
      setEditError('Task description cannot be empty');
      return;
    }

    if (editValue.length > 1000) {
      setEditError('Description must be 1000 characters or less');
      return;
    }

    try {
      await updateVibeMutation.mutateAsync({
        id: taskId,
        data: { vibe: editValue.trim() },
      });
      setEditingTaskId(null);
      setEditValue('');
      setEditError(null);
    } catch (error) {
      if (error instanceof Error) {
        setEditError(error.message);
      } else {
        setEditError('Failed to update task. Please try again.');
      }
    }
  };

  const handleVibeKeyDown = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVibeEditSave(taskId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleVibeEditCancel();
    }
  };

  // Sort tasks based on user-selected configuration
  // - score field: Sort by calculated priority score (null scores to bottom)
  // - createdAt field: Sort by task creation date
  // - null sortConfig: Return tasks in default order (created_at DESC from API)
  const sortedTasks = useMemo(() => {
    if (!tasks || !sortConfig) {
      return tasks || [];
    }

    const sorted = [...tasks].sort((a, b) => {
      if (sortConfig.field === 'score') {
        // Handle null/undefined scores (Released tasks) - always sort to bottom
        if ((a.score === null || a.score === undefined) && (b.score === null || b.score === undefined)) return 0;
        if (a.score === null || a.score === undefined) return 1;
        if (b.score === null || b.score === undefined) return -1;
        
        // Sort by numeric score
        const comparison = b.score - a.score; // Default descending
        return sortConfig.direction === 'asc' ? -comparison : comparison;
      } else {
        // Sort by createdAt
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        const comparison = bTime - aTime; // Default descending (newest first)
        return sortConfig.direction === 'asc' ? -comparison : comparison;
      }
    });

    return sorted;
  }, [tasks, sortConfig]);

  if (isLoading) {
    return <TaskListSkeleton />;
  }

  if (isError) {
    return <ErrorBanner error={error} onRetry={refetch} />;
  }

  if (!tasks || tasks.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Tasks
        </h2>
        <div className="flex items-center gap-4">
          {/* Filter */}
          <div className="flex items-center gap-3">
            <label htmlFor="state-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Filter:
            </label>
            <select
              id="state-filter"
              value={filter || ''}
              onChange={(e) => setFilter(e.target.value as TaskState || undefined)}
              className="rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:border-blue-400 dark:focus:ring-blue-400 text-sm"
            >
              <option value="">All</option>
              {TASK_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
          {/* Sort */}
          <div className="flex items-center gap-3">
            <label htmlFor="sort-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Sort:
            </label>
            <select
              id="sort-select"
              value={sortConfig ? `${sortConfig.field}-${sortConfig.direction}` : ''}
              onChange={(e) => {
                if (!e.target.value) {
                  setSortConfig(null);
                } else {
                  const [field, direction] = e.target.value.split('-') as ['score' | 'createdAt', 'asc' | 'desc'];
                  setSortConfig({ field, direction });
                }
              }}
              className="rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:border-blue-400 dark:focus:ring-blue-400 text-sm"
            >
              <option value="">Default (Newest)</option>
              <option value="score-desc">Priority Score (High to Low)</option>
              <option value="score-asc">Priority Score (Low to High)</option>
              <option value="createdAt-desc">Created (Newest First)</option>
              <option value="createdAt-asc">Created (Oldest First)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Mobile view: Cards */}
      <div className="lg:hidden space-y-4">
        {sortedTasks.map(task => {
          const MobileTaskCard = () => {
            const depInfo = useDependencyInfo(task);
            return <TaskCard key={task.id} task={task} onEdit={handleVibeEditStart} dependencyInfo={depInfo} />;
          };
          return <MobileTaskCard key={task.id} />;
        })}
      </div>

      {/* Desktop view: Table */}
      <div className="hidden lg:block">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  ID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Vibe
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  State
                </th>
                <SortableHeader 
                  label="Priority" 
                  field="score" 
                  currentSort={sortConfig} 
                  onSort={handleSort} 
                />
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Dependencies
                </th>
                <SortableHeader 
                  label="Created" 
                  field="createdAt" 
                  currentSort={sortConfig} 
                  onSort={handleSort} 
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sortedTasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => handleTaskClick(task.id)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">
                    {task.id.substring(0, 8)}...
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                    {editingTaskId === task.id ? (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => handleVibeKeyDown(e, task.id)}
                          disabled={updateVibeMutation.isPending}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                          placeholder="Enter task description"
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleVibeEditSave(task.id)}
                            disabled={updateVibeMutation.isPending}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {updateVibeMutation.isPending ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleVibeEditCancel}
                            disabled={updateVibeMutation.isPending}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Cancel
                          </button>
                          {editError && (
                            <span className="text-sm text-red-600 dark:text-red-400">{editError}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVibeEditStart(task);
                        }}
                        className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors rounded px-2 py-1 -mx-2 -my-1"
                      >
                        {task.vibe.length > 50 ? `${task.vibe.substring(0, 50)}...` : task.vibe}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StateProgressIndicator currentState={task.state} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <PriorityPill priority={task.priority} score={task.score} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <TaskDependencyCell task={task} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDateTime(task.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        taskId={selectedTaskId}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onNavigate={handleTaskNavigate}
      />
    </div>
  );
}
