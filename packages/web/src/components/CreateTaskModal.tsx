import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';
import { toast } from 'sonner';
import { useCreateTask, useTasks } from '../hooks/use-tasks';
import { DynamicListInput } from './DynamicListInput';
import { CustomSelect } from './ui/Select';
import { useWorkDirs } from '../hooks/use-work-dirs';
import { apiClient } from '../lib/api-client';
import { PRIORITY_CONFIG } from './PriorityPill';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTaskModal({ isOpen, onClose }: CreateTaskModalProps) {
  const [vibe, setVibe] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [pins, setPins] = useState<string[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [dependsOnTaskId, setDependsOnTaskId] = useState<string | null>(null);
  const [priority, setPriority] = useState<number>(3); // Default to Medium
  
  // Working directory state
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customPath, setCustomPath] = useState('');
  const [pathWarning, setPathWarning] = useState<string | null>(null);
  
  const createTaskMutation = useCreateTask();
  const { data: tasks, isLoading: isLoadingTasks } = useTasks();
  
  // Fetch existing working directories
  const { data: workDirs } = useWorkDirs();

  // Validate custom path (non-blocking)
  const validateCustomPath = async (path: string) => {
    if (!path.trim()) {
      setPathWarning(null);
      return;
    }

    try {
      const result = await apiClient.validatePath(path);
      
      if (!result.exists) {
        setPathWarning('Directory does not exist. Task may fail at execution.');
      } else if (!result.isDirectory) {
        setPathWarning('Path exists but is not a directory. Task may fail.');
      } else {
        setPathWarning(null);
      }
    } catch (error) {
      // Validation endpoint error - allow submission anyway
      setPathWarning('Unable to validate path.');
    }
  };

  // Debounced validation
  useEffect(() => {
    if (showCustomInput && customPath) {
      const timeout = setTimeout(() => validateCustomPath(customPath), 500);
      return () => clearTimeout(timeout);
    } else {
      setPathWarning(null);
    }
  }, [customPath, showCustomInput]);

  const handleWorkingDirChange = (value: string) => {
    if (value === '__custom__') {
      setShowCustomInput(true);
      setWorkingDir(null);
      setCustomPath('');
    } else {
      setShowCustomInput(false);
      setWorkingDir(value);
      setCustomPath('');
      setPathWarning(null);
    }
  };

  const handleClose = () => {
    setVibe('');
    setPins([]);
    setHints([]);
    setDependsOnTaskId(null);
    setPriority(3); // Reset to default
    setError(null);
    setWorkingDir(null);
    setShowCustomInput(false);
    setCustomPath('');
    setPathWarning(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation: Empty check
    if (!vibe.trim()) {
      setError('Task description cannot be empty');
      return;
    }

    // Validation: Max length check
    if (vibe.length > 1000) {
      setError('Description must be 1000 characters or less');
      return;
    }

    // Filter empty pins/hints before submission
    const filteredPins = pins
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    const filteredHints = hints
      .map(h => h.trim())
      .filter(h => h.length > 0);

    // Submit to API
    try {
      await createTaskMutation.mutateAsync({
        vibe: vibe.trim(),
        priority: priority,
        // Only include pins/hints if non-empty
        pins: filteredPins.length > 0 ? filteredPins : undefined,
        hints: filteredHints.length > 0 ? filteredHints : undefined,
        // Include dependsOnTaskId if set
        ...(dependsOnTaskId && { dependsOnTaskId }),
        // Include workingDir if set (custom or selected)
        workingDir: showCustomInput 
          ? (customPath.trim() || undefined) 
          : (workingDir || undefined),
      });
      toast.success('Task created successfully');
      handleClose();
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
        toast.error(`Failed to create task: ${error.message}`);
      } else {
        setError('Failed to create task. Please try again.');
        toast.error('Failed to create task. Please try again.');
      }
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 max-w-[500px] w-full -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl max-h-[80vh] overflow-y-auto">
          <Dialog.Title className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Create New Task
          </Dialog.Title>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Vibe Input */}
            <div>
              <label
                htmlFor="vibe"
                className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
              >
                What do you want to accomplish?
              </label>
              <textarea
                id="vibe"
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                placeholder="Describe your task..."
                rows={4}
                autoFocus
                disabled={createTaskMutation.isPending}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 resize-y"
              />
            </div>

            {/* Priority Dropdown */}
            <div>
              <label
                htmlFor="priority"
                className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
              >
                Priority
              </label>
              
              <Select.Root 
                value={priority.toString()} 
                onValueChange={(val) => setPriority(Number(val))}
              >
                <Select.Trigger
                  id="priority"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  aria-describedby="priority-description"
                >
                  <Select.Value />
                  <Select.Icon className="ml-2">
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="currentColor"
                      className="text-gray-500 dark:text-gray-400"
                    >
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" />
                    </svg>
                  </Select.Icon>
                </Select.Trigger>
                
                <Select.Portal>
                  <Select.Content
                    className="overflow-hidden bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50"
                    position="popper"
                    sideOffset={5}
                  >
                    <Select.Viewport className="p-1">
                      {Object.entries(PRIORITY_CONFIG).map(([value, config]) => (
                        <Select.Item
                          key={value}
                          value={value}
                          className="relative flex items-center px-8 py-2 text-sm text-gray-900 dark:text-white rounded cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 focus:bg-blue-50 dark:focus:bg-blue-900/20 focus:outline-none data-[state=checked]:bg-blue-100 dark:data-[state=checked]:bg-blue-900/30"
                        >
                          <Select.ItemText>{config.label}</Select.ItemText>
                          <Select.ItemIndicator className="absolute left-2">
                            <svg 
                              width="12" 
                              height="12" 
                              viewBox="0 0 12 12" 
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="2,6 5,9 10,3" />
                            </svg>
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
              
              <p 
                id="priority-description" 
                className="mt-1 text-xs text-gray-500 dark:text-gray-400"
              >
                {PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG]?.label || 'Medium'} priority
                {priority === 1 && ' - Highest priority, requires immediate attention'}
                {priority === 2 && ' - Important, should be addressed soon'}
                {priority === 3 && ' - Standard priority (default)'}
                {priority === 4 && ' - Can wait for later'}
                {priority === 5 && ' - Lowest priority, background task'}
              </p>
            </div>

            {/* Pins Input */}
            <DynamicListInput
              label="Pins"
              items={pins}
              onChange={setPins}
              placeholder="Add a pin (e.g., 'Must use TypeScript')"
              disabled={createTaskMutation.isPending}
            />

            {/* Hints Input */}
            <DynamicListInput
              label="Hints"
              items={hints}
              onChange={setHints}
              placeholder="Add a hint (e.g., 'Check existing auth patterns')"
              disabled={createTaskMutation.isPending}
            />

            {/* Dependency Dropdown */}
            <div>
              <label
                htmlFor="dependency"
                className="block text-sm font-medium text-gray-900 dark:text-white mb-2"
              >
                Depends on (optional)
              </label>
              <CustomSelect
                value={dependsOnTaskId}
                onValueChange={setDependsOnTaskId}
                placeholder={isLoadingTasks ? "Loading tasks..." : "Select a task..."}
                disabled={isLoadingTasks}
                options={tasks?.map(task => ({
                  value: task.id,
                  label: task.vibe,
                })) ?? []}
              />
            </div>

            {/* Working Directory Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Working Directory (optional)
              </label>
              
              <Select.Root 
                value={showCustomInput ? '__custom__' : (workingDir || '')} 
                onValueChange={handleWorkingDirChange}
              >
                <Select.Trigger 
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md hover:border-gray-400 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <Select.Value placeholder="Select working directory..." />
                </Select.Trigger>
                
                <Select.Portal>
                  <Select.Content 
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg overflow-hidden z-50"
                    position="popper"
                    sideOffset={4}
                  >
                    <Select.Viewport className="p-1">
                      {workDirs && workDirs.length > 0 && workDirs.map((dir) => (
                        <Select.Item 
                          key={dir} 
                          value={dir}
                          className="px-3 py-2 text-sm text-gray-900 dark:text-white rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer outline-none focus:bg-gray-100 dark:focus:bg-gray-700 truncate"
                          title={dir}
                        >
                          <Select.ItemText>{dir}</Select.ItemText>
                        </Select.Item>
                      ))}
                      
                      <Select.Separator className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                      
                      <Select.Item 
                        value="__custom__"
                        className="px-3 py-2 text-sm text-gray-900 dark:text-white rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer outline-none focus:bg-gray-100 dark:focus:bg-gray-700"
                      >
                        <Select.ItemText>Custom path...</Select.ItemText>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
              
              {showCustomInput && (
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/absolute/path/to/directory"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}
              
              {pathWarning && (
                <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md">
                  <span>⚠️</span>
                  <span>{pathWarning}</span>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div>
                <span className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTaskMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
