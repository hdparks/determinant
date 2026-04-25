import { type FC } from 'react';

type Priority = 1 | 2 | 3 | 4 | 5;

interface PriorityConfig {
  className: string;
  label: string;
}

interface PriorityPillProps {
  priority: number;
  score?: number | null;
  onClick?: (priority: number) => void; // Optional for future interactivity
  className?: string; // Optional additional styling
}

const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  1: { className: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200', label: 'Critical' },
  2: { className: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200', label: 'High' },
  3: { className: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200', label: 'Medium' },
  4: { className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200', label: 'Low' },
  5: { className: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200', label: 'Minimal' },
} as const;

function normalizePriority(priority: number | null | undefined): Priority {
  // Log warnings only in development
  const shouldWarn = import.meta.env.DEV;
  
  if (priority === null || priority === undefined) {
    if (shouldWarn) console.warn('Priority is null or undefined, defaulting to 3');
    return 3;
  }
  
  if (!Number.isInteger(priority)) {
    const rounded = Math.round(priority);
    if (shouldWarn) console.warn(`Priority ${priority} is not an integer, rounding to ${rounded}`);
    priority = rounded;
  }
  
  if (priority < 1) {
    if (shouldWarn) console.warn(`Priority ${priority} is below minimum (1), clamping to 1`);
    return 1;
  }
  
  if (priority > 5) {
    if (shouldWarn) console.warn(`Priority ${priority} is above maximum (5), clamping to 5`);
    return 5;
  }
  
  return priority as Priority;
}

export const PriorityPill: FC<PriorityPillProps> = ({ 
  priority, 
  score,
  onClick,
  className = '' 
}) => {
  const normalizedPriority = normalizePriority(priority);
  const config = PRIORITY_CONFIG[normalizedPriority];
  
  const handleClick = onClick ? () => onClick(normalizedPriority) : undefined;
  
  // Format score to 1 decimal place
  const scoreDisplay = score !== null && score !== undefined 
    ? score.toFixed(1) 
    : null;
  
  return (
    <span
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${config.className} ${onClick ? 'cursor-pointer hover:opacity-80' : ''} ${className}`}
      aria-label={`Priority ${normalizedPriority}: ${config.label}${scoreDisplay ? ` (Score: ${scoreDisplay})` : ''}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span>{config.label}</span>
      {scoreDisplay && (
        <>
          <span className="opacity-50">•</span>
          <span className="font-mono font-semibold">{scoreDisplay}</span>
        </>
      )}
    </span>
  );
};
