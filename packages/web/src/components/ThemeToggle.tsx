import { useTheme } from '../contexts/theme-context';
import * as Switch from '@radix-ui/react-switch';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-white/90">
        {theme === 'light' ? '☀️' : '🌙'}
      </span>
      <Switch.Root
        checked={theme === 'dark'}
        onCheckedChange={toggleTheme}
        className="w-11 h-6 bg-white/20 rounded-full relative focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 data-[state=checked]:bg-purple-500 transition-colors"
        aria-label="Toggle theme"
      >
        <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-200 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}
