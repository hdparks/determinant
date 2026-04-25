import { Task } from '@determinant/types';

interface DependencyBadgeProps {
  type: 'blocking' | 'blocked';
  count?: number;
  task?: Task;
  onClick?: () => void;
}

export function DependencyBadge({ type, count, task, onClick }: DependencyBadgeProps) {
  const isBlocking = type === 'blocking';
  const label = isBlocking ? 'Blocks' : 'Blocked by';
  const icon = isBlocking ? '🔒' : '⛔';
  
  if (count !== undefined && count === 0) return null;
  
  const displayText = count !== undefined 
    ? `${label} ${count}`
    : task 
    ? `${label}: ${task.vibe.substring(0, 20)}...`
    : label;
  
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
        transition-colors
        ${isBlocking 
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/50'
          : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-900/50'
        }
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
      `}
      disabled={!onClick}
    >
      <span>{icon}</span>
      <span>{displayText}</span>
    </button>
  );
}
