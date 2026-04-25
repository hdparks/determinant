import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateTaskState } from './use-tasks';
import * as apiClient from '../lib/api-client';
import type { ReactNode } from 'react';

// Mock API client
vi.mock('../lib/api-client');

// Mock celebration hook
const mockCelebrate = vi.fn();
vi.mock('./use-task-celebration', () => ({
  useTaskCelebration: () => ({
    celebrate: mockCelebrate,
  }),
}));

describe('useUpdateTaskState - confetti integration', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create fresh QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Wrapper component for React Query
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    // Mock API client success response
    vi.mocked(apiClient.apiClient.updateTaskState).mockResolvedValue({
      id: 'test-task-id',
      title: 'Test Task',
      state: 'Released',
      priority: 'Medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
  });

  it('triggers celebration when task is marked as Released', async () => {
    const { result } = renderHook(() => useUpdateTaskState(), { wrapper });

    // Trigger mutation with Released state
    result.current.mutate({
      id: 'test-task-id',
      data: { state: 'Released' },
    });

    // Wait for mutation to complete
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify celebration was triggered
    expect(mockCelebrate).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger celebration for non-Released states', async () => {
    // Mock API to return Implement state
    vi.mocked(apiClient.apiClient.updateTaskState).mockResolvedValue({
      id: 'test-task-id',
      title: 'Test Task',
      state: 'Implement',
      priority: 'Medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    const { result } = renderHook(() => useUpdateTaskState(), { wrapper });

    // Trigger mutation with Implement state
    result.current.mutate({
      id: 'test-task-id',
      data: { state: 'Implement' },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify celebration was NOT triggered
    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('does NOT trigger celebration when mutation fails', async () => {
    // Mock API to fail
    vi.mocked(apiClient.apiClient.updateTaskState).mockRejectedValue(
      new Error('Network error')
    );

    const { result } = renderHook(() => useUpdateTaskState(), { wrapper });

    // Trigger mutation
    result.current.mutate({
      id: 'test-task-id',
      data: { state: 'Released' },
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Verify celebration was NOT triggered on error
    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('does NOT trigger celebration for Validate state', async () => {
    vi.mocked(apiClient.apiClient.updateTaskState).mockResolvedValue({
      id: 'test-task-id',
      title: 'Test Task',
      state: 'Validate',
      priority: 'Medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    const { result } = renderHook(() => useUpdateTaskState(), { wrapper });

    result.current.mutate({
      id: 'test-task-id',
      data: { state: 'Validate' },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockCelebrate).not.toHaveBeenCalled();
  });

  it('does NOT trigger celebration for Proposal state', async () => {
    vi.mocked(apiClient.apiClient.updateTaskState).mockResolvedValue({
      id: 'test-task-id',
      title: 'Test Task',
      state: 'Proposal',
      priority: 'Medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    const { result } = renderHook(() => useUpdateTaskState(), { wrapper });

    result.current.mutate({
      id: 'test-task-id',
      data: { state: 'Proposal' },
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockCelebrate).not.toHaveBeenCalled();
  });
});
