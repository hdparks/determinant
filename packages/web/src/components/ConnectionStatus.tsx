import { useSSEContext } from '../contexts/sse-context';

export function ConnectionStatus() {
  const { state, reconnect } = useSSEContext();
  
  if (state === 'connected') return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 px-4 py-2 rounded-lg shadow-lg z-50">
      {state === 'connecting' && 'Connecting...'}
      {state === 'disconnected' && (
        <>
          Disconnected{' '}
          <button onClick={reconnect} className="underline hover:no-underline font-semibold">
            Retry
          </button>
        </>
      )}
      {state === 'error' && (
        <>
          Connection error{' '}
          <button onClick={reconnect} className="underline hover:no-underline font-semibold">
            Retry
          </button>
        </>
      )}
    </div>
  );
}
