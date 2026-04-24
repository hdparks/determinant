import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { Layout } from './components/Layout';
import { TaskList } from './components/TaskList';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <TaskList />
      </Layout>
    </QueryClientProvider>
  );
}

export default App;

