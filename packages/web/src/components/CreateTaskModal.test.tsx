import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateTaskModal } from './CreateTaskModal';
import { apiClient } from '../lib/api-client';
import type { ReactNode } from 'react';

// Mock API client
vi.mock('../lib/api-client');

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CreateTaskModal - Priority Dropdown', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    wrapper = ({ children }: { children: ReactNode}) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    // Mock successful API response
    vi.mocked(apiClient.createTask).mockResolvedValue({
      task: {
        id: 'test-task-id',
        vibe: 'Test task',
        priority: 3,
        pins: [],
        hints: [],
        state: 'Proposal',
        manualWeight: 0,
        workingDir: null,
        dependsOnTaskId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  it('renders priority dropdown with default value (Medium/3)', () => {
    render(<CreateTaskModal isOpen={true} onClose={mockOnClose} />, { wrapper });
    
    // Check label exists
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
    
    // Check helper text shows Medium description
    expect(screen.getByText(/Standard priority \(default\)/i)).toBeInTheDocument();
  });

  it('submits with default priority when not changed', async () => {
    const user = userEvent.setup();
    render(<CreateTaskModal isOpen={true} onClose={mockOnClose} />, { wrapper });

    // Fill vibe only
    await user.type(screen.getByLabelText('What do you want to accomplish?'), 'Standard task');

    // Submit without changing priority
    await user.click(screen.getByRole('button', { name: /create task/i }));

    // Verify API called with default priority (3)
    await waitFor(() => {
      expect(apiClient.createTask).toHaveBeenCalledWith({
        vibe: 'Standard task',
        priority: 3,
      });
    });
  });

  it('has proper accessibility attributes', () => {
    render(<CreateTaskModal isOpen={true} onClose={mockOnClose} />, { wrapper });

    const trigger = screen.getByLabelText('Priority');
    
    // Check aria-describedby links to helper text
    expect(trigger).toHaveAttribute('aria-describedby', 'priority-description');
    
    // Check helper text has correct id
    const helperText = document.getElementById('priority-description');
    expect(helperText).toBeInTheDocument();
    expect(helperText?.textContent).toContain('Medium priority');
  });

  it('handles API errors gracefully', async () => {
    const user = userEvent.setup();
    
    // Mock API failure
    vi.mocked(apiClient.createTask).mockRejectedValue(
      new Error('Priority must be between 1 and 5')
    );

    render(<CreateTaskModal isOpen={true} onClose={mockOnClose} />, { wrapper });

    await user.type(screen.getByLabelText('What do you want to accomplish?'), 'Test task');
    await user.click(screen.getByRole('button', { name: /create task/i }));

    // Verify error displayed
    await waitFor(() => {
      expect(screen.getByText(/Priority must be between 1 and 5/i)).toBeInTheDocument();
    });

    // Modal should stay open
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
