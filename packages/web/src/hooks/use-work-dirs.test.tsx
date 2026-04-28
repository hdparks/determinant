import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkDirs } from './use-work-dirs';
import { apiClient } from '../lib/api-client';
import type { ReactNode } from 'react';

vi.mock('../lib/api-client');

describe('useWorkDirs', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  });

  it('fetches working directories successfully', async () => {
    const mockDirs = ['/path/one', '/path/two'];
    vi.mocked(apiClient.getWorkDirs).mockResolvedValue({ 
      workingDirs: mockDirs 
    });

    const { result } = renderHook(() => useWorkDirs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockDirs);
    expect(apiClient.getWorkDirs).toHaveBeenCalledTimes(1);
  });

  it('handles empty working directories', async () => {
    vi.mocked(apiClient.getWorkDirs).mockResolvedValue({ 
      workingDirs: [] 
    });

    const { result } = renderHook(() => useWorkDirs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(apiClient.getWorkDirs).mockRejectedValue(
      new Error('API Error')
    );

    const { result } = renderHook(() => useWorkDirs(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeTruthy();
  });
});
