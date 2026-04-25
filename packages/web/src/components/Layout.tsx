import { ReactNode } from 'react';
import { useTaskSSESync, useNodeSSESync } from '../hooks/use-tasks';
import { useQueueSSESync } from '../hooks/use-queue';
import { ConnectionStatus } from './ConnectionStatus';
import { ThemeToggle } from './ThemeToggle';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  // Enable SSE sync for all data
  useTaskSSESync();
  useNodeSSESync();
  useQueueSSESync();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Gradient header with theme toggle */}
      <header className="gradient-header shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Determinant
              </h1>
              <p className="text-white/80 text-sm mt-1">
                Task Management Portal
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Connection status indicator */}
      <ConnectionStatus />
    </div>
  );
}
