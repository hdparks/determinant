import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomSelect, SelectOption } from './Select';

/**
 * Note: Radix UI Select has known issues with JSDOM testing environments,
 * particularly around dropdown interactions (hasPointerCapture errors).
 * These tests focus on rendering and basic functionality that can be reliably tested.
 * Full interactive testing should be done with E2E tests or manual testing.
 */

describe('CustomSelect', () => {
  const mockOptions: SelectOption[] = [
    { value: '1', label: 'Task 1' },
    { value: '2', label: 'Task 2' },
    { value: '3', label: 'Task 3' },
  ];

  describe('Rendering', () => {
    it('renders with placeholder when no value selected', () => {
      render(
        <CustomSelect
          options={mockOptions}
          placeholder="Select a task..."
          onValueChange={vi.fn()}
        />
      );
      expect(screen.getByText('Select a task...')).toBeInTheDocument();
    });

    it('renders with custom placeholder', () => {
      render(
        <CustomSelect
          options={mockOptions}
          placeholder="Custom placeholder"
          onValueChange={vi.fn()}
        />
      );
      expect(screen.getByText('Custom placeholder')).toBeInTheDocument();
    });

    it('renders combobox role', () => {
      render(
        <CustomSelect
          options={mockOptions}
          onValueChange={vi.fn()}
        />
      );
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('disables trigger when disabled prop is true', () => {
      render(
        <CustomSelect
          disabled
          options={mockOptions}
          onValueChange={vi.fn()}
        />
      );

      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper role attribute', () => {
      render(
        <CustomSelect
          options={mockOptions}
          onValueChange={vi.fn()}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('applies custom className to trigger', () => {
      const { container } = render(
        <CustomSelect
          options={mockOptions}
          onValueChange={vi.fn()}
          className="custom-class"
        />
      );

      const trigger = container.querySelector('.custom-class');
      expect(trigger).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('accepts and renders with all expected props', () => {
      const handleChange = vi.fn();
      
      render(
        <CustomSelect
          value="1"
          options={mockOptions}
          placeholder="Test placeholder"
          disabled={false}
          onValueChange={handleChange}
          className="test-class"
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders with empty options array', () => {
      render(
        <CustomSelect
          options={[]}
          onValueChange={vi.fn()}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders with null value', () => {
      render(
        <CustomSelect
          value={null}
          options={mockOptions}
          onValueChange={vi.fn()}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });
});
