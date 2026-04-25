interface DependencyStatusIconProps {
  isBlocked: boolean;
  isBlocking: boolean;
}

export function DependencyStatusIcon({ isBlocked, isBlocking }: DependencyStatusIconProps) {
  if (!isBlocked && !isBlocking) return null;
  
  const icon = isBlocked ? '⛔' : '🔒';
  const label = isBlocked 
    ? 'Blocked - waiting on dependency' 
    : 'Blocking - other tasks depend on this';
  const colorClass = isBlocked
    ? 'text-red-600 dark:text-red-400'
    : 'text-amber-600 dark:text-amber-400';
  
  return (
    <span 
      className={`text-sm ${colorClass} cursor-help`} 
      role="img" 
      aria-label={label}
      title={label}
    >
      {icon}
    </span>
  );
}
