/**
 * Notification types for different system events
 */
export type NotificationType = 
  | 'node_complete'      // Node processing finished successfully
  | 'task_complete'      // Task reached Released state
  | 'task_failed'        // Task or node processing failed
  | 'worker_started'     // Worker loop started
  | 'worker_complete'    // Worker loop finished all tasks
  | 'queue_empty'        // No more tasks in queue
  | 'ttl_expired';       // Worker TTL timeout

/**
 * Configuration for notification system
 */
export interface NotificationConfig {
  enabled: boolean;                                    // Global notification toggle
  soundEnabled: boolean;                               // Sound playback toggle
  volume: number;                                      // 0.0 - 1.0
  sounds: Partial<Record<NotificationType, string>>;   // Path to sound files per type
  verbose: boolean;                                    // Log notification events
}

/**
 * Options for individual notification calls
 */
export interface NotificationOptions {
  message?: string;                    // Custom message to log
  data?: Record<string, any>;          // Additional context data
  skipSound?: boolean;                 // Skip sound for this notification
}

/**
 * Default configuration values
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true,
  soundEnabled: true,
  volume: 0.5,
  sounds: {},
  verbose: false,
};
