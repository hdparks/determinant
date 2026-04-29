import { NotificationConfig, DEFAULT_NOTIFICATION_CONFIG } from './types.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the default error sound file path
 */
function getDefaultErrorSound(): string {
  return join(__dirname, '../../assets/sounds/error.aiff');
}

/**
 * Get the default TTL expiration sound file path
 */
function getDefaultTTLSound(): string {
  return join(__dirname, '../../assets/sounds/error.aiff');
}

/**
 * Get the default queue empty sound file path
 */
function getDefaultQueueEmptySound(): string {
  return join(__dirname, '../../assets/sounds/queue-empty.aiff');
}

/**
 * Load notification configuration from environment variables and constructor options
 */
export function loadNotificationConfig(
  userConfig: Partial<NotificationConfig> = {}
): NotificationConfig {
  // Parse environment variables
  const envConfig: Partial<NotificationConfig> = {
    enabled: parseBool(process.env.DETERMINANT_NOTIFY_ENABLED, true),
    soundEnabled: parseBool(process.env.DETERMINANT_NOTIFY_SOUND_ENABLED, true),
    volume: parseFloat(process.env.DETERMINANT_NOTIFY_VOLUME ?? '0.5'),
    verbose: parseBool(process.env.DETERMINANT_NOTIFY_VERBOSE, false),
    sounds: {
      node_complete: process.env.DETERMINANT_NOTIFY_SOUND_SUCCESS,
      task_complete: process.env.DETERMINANT_NOTIFY_SOUND_SUCCESS,
      task_failed: process.env.DETERMINANT_NOTIFY_SOUND_ERROR ?? getDefaultErrorSound(),
      worker_complete: process.env.DETERMINANT_NOTIFY_SOUND_SUCCESS,
      queue_empty: process.env.DETERMINANT_NOTIFY_SOUND_WARNING ?? getDefaultQueueEmptySound(),
      ttl_expired: process.env.DETERMINANT_NOTIFY_SOUND_TTL_EXPIRED ?? getDefaultTTLSound(),
    },
  };

  // Merge: defaults < env vars < user config
  return {
    ...DEFAULT_NOTIFICATION_CONFIG,
    ...envConfig,
    ...userConfig,
    sounds: {
      ...DEFAULT_NOTIFICATION_CONFIG.sounds,
      ...envConfig.sounds,
      ...userConfig.sounds,
    },
  };
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Validate notification configuration
 */
export function validateConfig(config: NotificationConfig): void {
  if (config.volume < 0 || config.volume > 1) {
    throw new Error('Notification volume must be between 0.0 and 1.0');
  }
  
  // Validate sound file paths exist (warnings only)
  for (const [type, path] of Object.entries(config.sounds)) {
    if (path && config.verbose) {
      console.log(`[Notifications] ${type} sound: ${path}`);
    }
  }
}
