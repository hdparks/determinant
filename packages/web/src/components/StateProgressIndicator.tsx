import { type FC, memo } from 'react';
import { TASK_STATES, type TaskState } from '@determinant/types';

interface StateProgressIndicatorProps {
  currentState: TaskState;
  className?: string;
}

/**
 * Displays visual progress through workflow states as a row of dots.
 * 
 * Shows 7 dots representing the task workflow stages:
 * Proposal → Questions → Research → Plan → Implement → Validate → Released
 * 
 * Visual indicators:
 * - Green filled dots: Completed states (before current)
 * - Blue dot with ring: Current state
 * - Gray filled dots: Future states (not yet reached)
 * 
 * @example
 * ```tsx
 * <StateProgressIndicator currentState="Research" />
 * // Renders: ● ● ◉ ○ ○ ○ ○
 * //         (green) (blue) (gray)
 * ```
 * 
 * @param currentState - The current workflow state of the task
 * @param className - Optional additional CSS classes
 */
export const StateProgressIndicator: FC<StateProgressIndicatorProps> = memo(({ 
  currentState,
  className = '' 
}) => {
  // Validate and calculate current position
  const currentIndex = TASK_STATES.indexOf(currentState);
  
  // Edge case: Invalid state (shouldn't happen, but be defensive)
  if (currentIndex === -1) {
    if (import.meta.env.DEV) {
      console.warn(`StateProgressIndicator: Invalid state "${currentState}"`);
    }
    // Fallback: All gray dots (no current state highlighted)
    return (
      <div 
        className={`flex items-center gap-1 ${className}`}
        role="img" 
        aria-label="Task progress: unknown state"
      >
        {TASK_STATES.map((state) => (
          <span
            key={state}
            className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600"
            title={state}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }
  
  // Helper: Determine dot styling based on position relative to current
  const getDotStyle = (index: number): string => {
    const baseClasses = 'w-2 h-2 rounded-full';
    
    if (index < currentIndex) {
      // Completed states: Green
      return `${baseClasses} bg-green-500 dark:bg-green-400`;
    }
    
    if (index === currentIndex) {
      // Current state: Blue with ring emphasis
      return `${baseClasses} bg-blue-600 dark:bg-blue-500 ring-2 ring-blue-300 dark:ring-blue-400`;
    }
    
    // Future states: Gray
    return `${baseClasses} bg-gray-300 dark:bg-gray-600`;
  };
  
  return (
    <div 
      className={`flex items-center gap-1 ${className}`}
      role="img"
      aria-label={`Task progress: ${currentIndex + 1} of ${TASK_STATES.length} stages, currently at ${currentState}`}
    >
      {TASK_STATES.map((state, index) => (
        <span
          key={state}
          className={getDotStyle(index)}
          title={state}
          aria-hidden="true"
        />
      ))}
    </div>
  );
});

StateProgressIndicator.displayName = 'StateProgressIndicator';
