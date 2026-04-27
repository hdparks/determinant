import { ReactNode, useState } from 'react';
import { useTaskSSESync, useNodeSSESync } from '../hooks/use-tasks';
import { useQueueSSESync } from '../hooks/use-queue';
import { useHumanQueue, useHumanQueueSSESync } from '../hooks/use-human-queue';
import { ConnectionStatus } from './ConnectionStatus';
import { ThemeToggle } from './ThemeToggle';
import { HumanQueue } from './HumanQueue';
import { Badge } from './ui/Badge';

type View = 'tasks' | 'human-queue';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [currentView, setCurrentView] = useState<View>('tasks');
  
  // Enable SSE sync for all data
  useTaskSSESync();
  useNodeSSESync();
  useQueueSSESync();
  useHumanQueueSSESync();

  // Get human queue count for badge
  const { data: humanQueueItems } = useHumanQueue();
  const pendingCount = humanQueueItems?.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Gradient header with theme toggle */}
      <header className="gradient-header shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Determinant
                </h1>
                <p className="text-white/80 text-sm mt-1">
                  Task Management Portal
                </p>
              </div>
              
              {/* View Switcher */}
              <nav className="flex gap-2">
                <button
                  onClick={() => setCurrentView('tasks')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'tasks'
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Tasks
                </button>
                
                <button
                  onClick={() => setCurrentView('human-queue')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                    currentView === 'human-queue'
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Human Queue
                  {pendingCount > 0 && (
                    <Badge variant="warning" size="sm">
                      {pendingCount}
                    </Badge>
                  )}
                </button>
              </nav>
            </div>
            
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'tasks' ? children : <HumanQueue />}
      </main>

      {/* Connection status indicator */}
      <ConnectionStatus />
    </div>
  );
}
