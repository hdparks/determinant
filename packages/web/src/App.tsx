import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from './lib/query-client';
import { SSEProvider } from './contexts/sse-context';
import { ThemeProvider } from './contexts/theme-context';
import { Layout } from './components/Layout';
import { TaskList } from './components/TaskList';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SSEProvider>
          <Toaster position="top-right" richColors />
          <Layout>
            <TaskList />
          </Layout>
        </SSEProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

