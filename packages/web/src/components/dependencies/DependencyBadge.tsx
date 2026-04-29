import { Task } from '@determinant/types';

interface DependencyBadgeProps {
  type: 'blocking' | 'blocked' | 'unlocked';
  count?: number;
  task?: Task;
  onClick?: () => void;
}

export function DependencyBadge({ type, count, task, onClick }: DependencyBadgeProps) {
  const config = {
    blocked: {
      label: 'Blocked by',
      icon: '⛔',
      bgClass: 'bg-red-100 dark:bg-red-900/30',
      textClass: 'text-red-800 dark:text-red-200',
      hoverClass: 'hover:bg-red-200 dark:hover:bg-red-900/50',
    },
    unlocked: {
      label: 'Was blocked by',
      icon: '🔓',
      bgClass: 'bg-green-100 dark:bg-green-900/30',
      textClass: 'text-green-800 dark:text-green-200',
      hoverClass: 'hover:bg-green-200 dark:hover:bg-green-900/50',
    },
    blocking: {
      label: 'Blocks',
      icon: '🔒',
      bgClass: 'bg-amber-100 dark:bg-amber-900/30',
      textClass: 'text-amber-800 dark:text-amber-200',
      hoverClass: 'hover:bg-amber-200 dark:hover:bg-amber-900/50',
    },
  };

  const { label, icon, bgClass, textClass, hoverClass } = config[type];
  
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
        ${bgClass} ${textClass} ${onClick ? hoverClass : ''}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
      `}
      disabled={!onClick}
    >
      <span>{icon}</span>
      <span>{displayText}</span>
    </button>
  );
}
