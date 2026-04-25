import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTaskCelebration } from './use-task-celebration';
import confetti from 'canvas-confetti';

// Mock canvas-confetti module
vi.mock('canvas-confetti');

describe('useTaskCelebration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Mock matchMedia (default: no reduced motion)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers confetti when celebrate is called', () => {
    const { result } = renderHook(() => useTaskCelebration());
    
    result.current.celebrate();
    
    expect(confetti).toHaveBeenCalledTimes(1);
    expect(confetti).toHaveBeenCalledWith(
      expect.objectContaining({
        particleCount: 50,
        spread: 60,
        startVelocity: 25,
        decay: 0.92,
        ticks: 150,
        gravity: 1.2,
        scalar: 0.8,
      })
    );
  });

  it('respects prefers-reduced-motion preference', () => {
    // Override matchMedia to return reduced motion preference
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useTaskCelebration());
    result.current.celebrate();
    
    // Confetti should NOT be triggered
    expect(confetti).not.toHaveBeenCalled();
  });

  it('throttles rapid celebrations', () => {
    const { result } = renderHook(() => useTaskCelebration());
    
    // First celebration - should trigger
    result.current.celebrate();
    expect(confetti).toHaveBeenCalledTimes(1);
    
    // Immediate second celebration - should be throttled
    result.current.celebrate();
    expect(confetti).toHaveBeenCalledTimes(1); // Still 1, not 2
    
    // Advance time by 1 second - still within throttle period
    vi.advanceTimersByTime(1000);
    result.current.celebrate();
    expect(confetti).toHaveBeenCalledTimes(1); // Still 1
    
    // Advance time past throttle period (2100ms total)
    vi.advanceTimersByTime(1100);
    result.current.celebrate();
    expect(confetti).toHaveBeenCalledTimes(2); // Now 2
  });

  it('uses brand colors', () => {
    const { result } = renderHook(() => useTaskCelebration());
    result.current.celebrate();
    
    const callArgs = (confetti as any).mock.calls[0][0];
    expect(callArgs.colors).toEqual(
      expect.arrayContaining([
        '#2563eb', // Blue-600
        '#9333ea', // Purple-600
      ])
    );
    expect(callArgs.colors).toHaveLength(6); // All 6 color variations
  });

  it('uses responsive origin for mobile', () => {
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 375, // iPhone size
    });

    const { result } = renderHook(() => useTaskCelebration());
    result.current.celebrate();
    
    const callArgs = (confetti as any).mock.calls[0][0];
    expect(callArgs.origin).toEqual({ x: 0.5, y: 0.5 }); // Centered
    expect(callArgs.spread).toBe(70); // Wider spread for mobile
  });

  it('uses responsive origin for desktop', () => {
    // Mock desktop viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 1920,
    });

    const { result } = renderHook(() => useTaskCelebration());
    result.current.celebrate();
    
    const callArgs = (confetti as any).mock.calls[0][0];
    expect(callArgs.origin).toEqual({ y: 0.6 }); // Slightly below center
    expect(callArgs.spread).toBe(60); // Standard spread
  });

  it('allows celebrations after throttle period expires', () => {
    const { result } = renderHook(() => useTaskCelebration());
    
    // Trigger celebration
    result.current.celebrate();
    expect(confetti).toHaveBeenCalledTimes(1);
    
    // Wait full throttle period
    vi.advanceTimersByTime(2100);
    
    // Should allow new celebration
    result.current.celebrate();
    expect(confetti).toHaveBeenCalledTimes(2);
    
    // Wait again
    vi.advanceTimersByTime(2100);
    
    // Should allow another
    result.current.celebrate();
    expect(confetti).toHaveBeenCalledTimes(3);
  });
});
