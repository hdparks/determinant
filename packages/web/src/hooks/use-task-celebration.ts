import confetti from 'canvas-confetti';
import { useCallback, useRef } from 'react';

/**
 * Custom hook for triggering task completion celebrations
 * 
 * Features:
 * - Throttles celebrations (2-second minimum between triggers)
 * - Respects prefers-reduced-motion accessibility preference
 * - Uses brand colors (blue/purple gradient)
 * - Responsive positioning (mobile vs desktop)
 * - Conservative particle count for subtlety
 */
export function useTaskCelebration() {
  const lastCelebrationTime = useRef<number>(0);
  const THROTTLE_MS = 2000; // Minimum 2 seconds between celebrations

  const celebrate = useCallback(() => {
    // Throttle rapid celebrations
    const now = Date.now();
    const timeSinceLastCelebration = now - lastCelebrationTime.current;
    
    if (timeSinceLastCelebration < THROTTLE_MS) {
      console.debug('🎉 Celebration throttled (too soon since last celebration)');
      return;
    }

    // Respect reduced motion preference (accessibility)
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    
    if (prefersReducedMotion) {
      console.debug('🎉 Celebration skipped (prefers-reduced-motion enabled)');
      return;
    }

    // Update throttle timestamp
    lastCelebrationTime.current = now;

    // Responsive origin - centered but adjusted for mobile
    const isMobile = window.innerWidth < 768; // Tailwind's md breakpoint
    const origin = isMobile 
      ? { x: 0.5, y: 0.5 }  // Exact center on mobile
      : { y: 0.6 };          // Slightly below center on desktop

    // Trigger confetti with brand colors
    confetti({
      particleCount: 50,                    // Conservative count for subtlety
      spread: isMobile ? 70 : 60,          // Slightly wider on mobile
      origin,
      colors: [
        '#2563eb', // Blue-600 (brand primary)
        '#3b82f6', // Blue-500 (lighter blue)
        '#9333ea', // Purple-600 (brand secondary)
        '#a855f7', // Purple-500 (lighter purple)
        '#60a5fa', // Blue-400 (even lighter for variety)
        '#c084fc', // Purple-400 (even lighter for variety)
      ],
      startVelocity: 25,                   // Moderate speed
      decay: 0.92,                         // Faster disappearance
      ticks: 150,                          // ~1.5 second duration
      gravity: 1.2,                        // Faster fall
      scalar: 0.8,                         // Smaller particles
    });

    console.debug('🎉 Celebration triggered');
  }, []);

  return { celebrate };
}
