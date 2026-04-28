import { forwardRef } from 'react';
import * as Select from '@radix-ui/react-select';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value?: string | null;
  onValueChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A reusable select dropdown component built on Radix UI Select.
 * 
 * Features:
 * - Dark mode support
 * - Nullable value (allows clearing selection via "None" option)
 * - Loading/disabled states
 * - Empty state handling
 * - Keyboard navigation and accessibility
 * - Text truncation for long labels
 * 
 * @example
 * ```tsx
 * const [value, setValue] = useState<string | null>(null);
 * 
 * <CustomSelect
 *   value={value}
 *   onValueChange={setValue}
 *   placeholder="Choose an option..."
 *   options={[
 *     { value: '1', label: 'Option 1' },
 *     { value: '2', label: 'Option 2' },
 *   ]}
 * />
 * ```
 */
export const CustomSelect = forwardRef<HTMLButtonElement, SelectProps>(
  ({ value, onValueChange, options, placeholder = 'Select...', disabled = false, className = '' }, ref) => {
    const handleValueChange = (newValue: string) => {
      // Allow clearing selection by passing special value
      onValueChange(newValue === '__CLEAR__' ? null : newValue);
    };

    return (
      <Select.Root 
        value={value ?? undefined} 
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <Select.Trigger
          ref={ref}
          className={`w-full px-3 py-2 text-sm text-left border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-between ${className}`}
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon className="ml-2">
            <span className="text-gray-500 dark:text-gray-400">▼</span>
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content 
            className="bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
            position="popper"
            sideOffset={5}
          >
            <Select.Viewport className="p-1">
              {/* Show "None" option when value is selected */}
              {value && (
                <Select.Item 
                  value="__CLEAR__"
                  className="relative flex items-center px-8 py-2 text-sm rounded cursor-pointer text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 outline-none data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700"
                >
                  <Select.ItemIndicator className="absolute left-2">
                    <span className="text-blue-600 dark:text-blue-400">✓</span>
                  </Select.ItemIndicator>
                  <Select.ItemText>
                    <em className="text-gray-500 dark:text-gray-400">None</em>
                  </Select.ItemText>
                </Select.Item>
              )}

              {/* Show options */}
              {options.length > 0 ? (
                options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    className="relative flex items-center px-8 py-2 text-sm rounded cursor-pointer text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 outline-none data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700"
                  >
                    <Select.ItemIndicator className="absolute left-2">
                      <span className="text-blue-600 dark:text-blue-400">✓</span>
                    </Select.ItemIndicator>
                    <Select.ItemText className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                      {option.label}
                    </Select.ItemText>
                  </Select.Item>
                ))
              ) : (
                <div className="px-8 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No options available
                </div>
              )}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    );
  }
);

CustomSelect.displayName = 'CustomSelect';
