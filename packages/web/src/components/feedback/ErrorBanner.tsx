import { Button } from '../ui/Button';

interface ErrorBannerProps {
  error: unknown;
  onRetry?: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return 'Unable to connect to server. Please check your connection.';
    }
    if (error.message.includes('timeout')) {
      return 'Request timed out. The server may be slow or unavailable.';
    }
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <svg
            className="w-6 h-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">
            Error loading tasks
          </h3>

          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            {getErrorMessage(error)}
          </p>

          {onRetry && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
