interface DependencyStatusIconProps {
  isBlocked: boolean;
  isBlocking: boolean;
  hasReleasedParent: boolean;
}

export function DependencyStatusIcon({ 
  isBlocked, 
  isBlocking,
  hasReleasedParent 
}: DependencyStatusIconProps) {
  // Return null if no dependency state
  if (!isBlocked && !isBlocking && !hasReleasedParent) return null;
  
  let icon: string;
  let label: string;
  let colorClass: string;
  
  // Priority order: blocked > unlocked > blocking
  if (isBlocked) {
    icon = '⛔';
    label = 'Blocked - waiting on dependency';
    colorClass = 'text-red-600 dark:text-red-400';
  } else if (hasReleasedParent) {
    icon = '🔓';
    label = 'Dependency Released - ready to proceed';
    colorClass = 'text-green-600 dark:text-green-400';
  } else if (isBlocking) {
    icon = '🔒';
    label = 'Blocking - other tasks depend on this';
    colorClass = 'text-amber-600 dark:text-amber-400';
  } else {
    return null;
  }
  
  return (
    <span 
      className={`text-sm ${colorClass} cursor-help transition-colors duration-300`}
      role="img" 
      aria-label={label}
      title={label}
    >
      {icon}
    </span>
  );
}
