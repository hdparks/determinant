import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StateProgressIndicator } from './StateProgressIndicator';
import { TASK_STATES } from '@determinant/types';

describe('StateProgressIndicator', () => {
  describe('Rendering', () => {
    it('renders 7 dots for all workflow states', () => {
      const { container } = render(<StateProgressIndicator currentState="Research" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      expect(dots).toHaveLength(7);
    });
    
    it('renders dots in correct order matching TASK_STATES', () => {
      const { container } = render(<StateProgressIndicator currentState="Research" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      dots.forEach((dot, index) => {
        expect(dot).toHaveAttribute('title', TASK_STATES[index]);
      });
    });
  });
  
  describe('Current state highlighting', () => {
    it('highlights first state (Proposal) correctly', () => {
      const { container } = render(<StateProgressIndicator currentState="Proposal" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      // First dot should be current (blue with ring)
      expect(dots[0].className).toContain('bg-blue-600');
      expect(dots[0].className).toContain('ring-2');
      // Rest should be future (gray)
      expect(dots[1].className).toContain('bg-gray-300');
    });
    
    it('highlights middle state (Plan) correctly', () => {
      const { container } = render(<StateProgressIndicator currentState="Plan" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      // First 3 should be completed (green)
      expect(dots[0].className).toContain('bg-green-500');
      expect(dots[1].className).toContain('bg-green-500');
      expect(dots[2].className).toContain('bg-green-500');
      // 4th should be current (blue with ring)
      expect(dots[3].className).toContain('bg-blue-600');
      expect(dots[3].className).toContain('ring-2');
      // Rest should be future (gray)
      expect(dots[4].className).toContain('bg-gray-300');
    });
    
    it('highlights last state (Released) correctly', () => {
      const { container } = render(<StateProgressIndicator currentState="Released" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      // First 6 should be completed (green)
      for (let i = 0; i < 6; i++) {
        expect(dots[i].className).toContain('bg-green-500');
      }
      // Last should be current (blue with ring)
      expect(dots[6].className).toContain('bg-blue-600');
      expect(dots[6].className).toContain('ring-2');
    });
  });
  
  describe('Styling', () => {
    it('applies green color to completed states', () => {
      const { container } = render(<StateProgressIndicator currentState="Implement" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      // First 4 dots should have green background
      for (let i = 0; i < 4; i++) {
        expect(dots[i].className).toContain('bg-green-500');
      }
    });
    
    it('applies blue ring to current state', () => {
      const { container } = render(<StateProgressIndicator currentState="Research" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      expect(dots[2].className).toContain('bg-blue-600');
      expect(dots[2].className).toContain('ring-2');
      expect(dots[2].className).toContain('ring-blue-300');
    });
    
    it('applies gray color to future states', () => {
      const { container } = render(<StateProgressIndicator currentState="Proposal" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      // All dots except first should be gray
      for (let i = 1; i < 7; i++) {
        expect(dots[i].className).toContain('bg-gray-300');
      }
    });
    
    it('applies dark mode classes correctly', () => {
      const { container } = render(<StateProgressIndicator currentState="Plan" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      // Check that dark: variants are present
      expect(dots[0].className).toContain('dark:bg-green-400');
      expect(dots[3].className).toContain('dark:bg-blue-500');
      expect(dots[4].className).toContain('dark:bg-gray-600');
    });
  });
  
  describe('Accessibility', () => {
    it('has role="img" on container', () => {
      const { container } = render(<StateProgressIndicator currentState="Research" />);
      const imgElement = container.querySelector('[role="img"]');
      expect(imgElement).toBeTruthy();
    });
    
    it('has descriptive aria-label', () => {
      const { container } = render(<StateProgressIndicator currentState="Research" />);
      const imgElement = container.querySelector('[role="img"]');
      expect(imgElement).toHaveAttribute(
        'aria-label',
        'Task progress: 3 of 7 stages, currently at Research'
      );
    });
    
    it('hides individual dots from screen readers', () => {
      const { container } = render(<StateProgressIndicator currentState="Research" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      expect(dots.length).toBe(7);
      dots.forEach(dot => {
        expect(dot).toHaveAttribute('aria-hidden', 'true');
      });
    });
    
    it('provides tooltips via title attribute', () => {
      const { container } = render(<StateProgressIndicator currentState="Research" />);
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      TASK_STATES.forEach((state, index) => {
        expect(dots[index]).toHaveAttribute('title', state);
      });
    });
  });
  
  describe('Edge cases', () => {
    it('handles all 7 states without errors', () => {
      TASK_STATES.forEach(state => {
        expect(() => render(<StateProgressIndicator currentState={state} />)).not.toThrow();
      });
    });
    
    it('handles invalid state gracefully', () => {
      // Suppress console.warn for this test
      const originalWarn = console.warn;
      console.warn = () => {};
      
      // @ts-expect-error - testing runtime behavior with invalid input
      const { container } = render(<StateProgressIndicator currentState="InvalidState" />);
      
      // Should render fallback (all gray dots)
      const dots = container.querySelectorAll('span[aria-hidden="true"]');
      expect(dots).toHaveLength(7);
      dots.forEach(dot => {
        expect(dot.className).toContain('bg-gray-300');
      });
      
      const imgElement = container.querySelector('[role="img"]');
      expect(imgElement).toHaveAttribute('aria-label', 'Task progress: unknown state');
      
      // Restore console.warn
      console.warn = originalWarn;
    });
  });
});
