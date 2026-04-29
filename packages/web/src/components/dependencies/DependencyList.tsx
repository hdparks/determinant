import { Task } from '@determinant/types';
import { DependencyBadge } from './DependencyBadge';

interface DependencyListProps {
  parent: Task | null;
  dependents: Task[];
  onNavigate?: (taskId: string) => void;
}

export function DependencyList({ parent, dependents, onNavigate }: DependencyListProps) {
  const hasAny = parent || dependents.length > 0;
  
  if (!hasAny) return null;
  
  return (
    <div className="space-y-2">
      {/* Blocking dependency (parent) */}
      {parent && (
        <div className="flex items-center gap-2">
          <DependencyBadge 
            type={parent.state === 'Released' ? 'unlocked' : 'blocked'}
            task={parent}
            onClick={onNavigate ? () => onNavigate(parent.id) : undefined}
          />
          <span className={`text-xs ${
            parent.state === 'Released'
              ? 'text-green-600 dark:text-green-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}>
            State: {parent.state}
          </span>
        </div>
      )}
      
      {/* Blocked tasks (dependents) */}
      {dependents.length > 0 && (
        <div className="space-y-1">
          <DependencyBadge type="blocking" count={dependents.length} />
          <ul className="ml-6 space-y-1">
            {dependents.map(dep => (
              <li key={dep.id} className="text-xs">
                <button
                  onClick={onNavigate ? () => onNavigate(dep.id) : undefined}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {dep.vibe.substring(0, 40)}...
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
