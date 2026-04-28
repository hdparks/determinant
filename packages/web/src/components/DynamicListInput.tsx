import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface DynamicListInputProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  maxItems?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
}

export function DynamicListInput({
  label,
  items,
  onChange,
  maxItems = 10,
  maxLength = 200,
  placeholder = '',
  disabled = false,
}: DynamicListInputProps) {
  // Validation errors per index
  const [errors, setErrors] = useState<Record<number, string>>({});
  
  // Refs for focus management
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  // Add new item
  const handleAdd = () => {
    if (items.length >= maxItems) return;
    onChange([...items, '']);
  };
  
  // Remove item at index
  const handleRemove = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
    
    // Focus management: focus previous input or first if removing first
    const focusIndex = index > 0 ? index - 1 : 0;
    setTimeout(() => {
      inputRefs.current[focusIndex]?.focus();
    }, 0);
  };
  
  // Update item at index
  const handleChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    onChange(newItems);
    
    // Validate
    if (value.length > maxLength) {
      setErrors(prev => ({
        ...prev,
        [index]: `Maximum ${maxLength} characters`,
      }));
    } else {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[index];
        return newErrors;
      });
    }
  };
  
  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      if (items.length < maxItems) {
        handleAdd();
      }
    }
  };
  
  // Auto-focus newest input
  useEffect(() => {
    const lastIndex = items.length - 1;
    if (lastIndex >= 0) {
      inputRefs.current[lastIndex]?.focus();
    }
  }, [items.length]);
  
  return (
    <div className="space-y-2">
      {/* Label + Counter */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-900 dark:text-white">
          {label}
        </label>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {items.length}/{maxItems} items
        </span>
      </div>
      
      {/* Items List */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index}>
            <div className="flex gap-2">
              <input
                ref={el => inputRefs.current[index] = el}
                type="text"
                value={item}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e)}
                placeholder={placeholder}
                disabled={disabled}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              >
                <X size={16} />
              </button>
            </div>
            
            {/* Inline Error */}
            {errors[index] && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {errors[index]}
              </p>
            )}
          </div>
        ))}
      </div>
      
      {/* Add Button */}
      <button
        type="button"
        onClick={handleAdd}
        disabled={disabled || items.length >= maxItems}
        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        + Add {label.endsWith('s') ? label.slice(0, -1) : label}
      </button>
      
      {/* Helper text when max reached */}
      {items.length >= maxItems && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Maximum {maxItems} items reached
        </p>
      )}
    </div>
  );
}
