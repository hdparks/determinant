import { NotificationConfig, NotificationType, NotificationOptions } from './types.js';
import { loadNotificationConfig, validateConfig } from './config.js';
import { AudioPlayer } from './audio.js';

/**
 * Main notification service for Determinant CLI
 */
export class NotificationService {
  private config: NotificationConfig;
  private audioPlayer: AudioPlayer | null = null;

  constructor(config?: Partial<NotificationConfig>) {
    this.config = loadNotificationConfig(config);
    validateConfig(this.config);

    // Initialize audio player if sound is enabled
    if (this.config.soundEnabled) {
      try {
        this.audioPlayer = new AudioPlayer(this.config.volume);
      } catch (error) {
        if (this.config.verbose) {
          console.warn('[Notifications] Failed to initialize audio player:', error);
        }
      }
    }
  }

  /**
   * Send a notification
   */
  async notify(type: NotificationType, options: NotificationOptions = {}): Promise<void> {
    // Check if notifications are enabled
    if (!this.config.enabled) {
      return;
    }

    // Log message if provided
    if (options.message && this.config.verbose) {
      console.log(`[Notification:${type}] ${options.message}`);
    }

    // Play sound if enabled and not skipped
    if (this.config.soundEnabled && !options.skipSound && this.audioPlayer) {
      const soundPath = this.config.sounds[type];
      if (soundPath) {
        try {
          await this.audioPlayer.play(soundPath);
        } catch (error) {
          // Gracefully handle audio playback failures
          if (this.config.verbose) {
            console.warn(`[Notifications] Failed to play sound for ${type}:`, error);
          }
        }
      }
    }
  }

  /**
   * Convenience method: Notify when a node completes
   */
  async notifyNodeComplete(nodeId: string, toStage: string): Promise<void> {
    await this.notify('node_complete', {
      message: `Node ${nodeId.slice(-8)} → ${toStage}`,
      data: { nodeId, toStage },
    });
  }

  /**
   * Convenience method: Notify when a task completes
   */
  async notifyTaskComplete(taskId: string, vibe: string): Promise<void> {
    await this.notify('task_complete', {
      message: `Task completed: ${vibe}`,
      data: { taskId, vibe },
    });
  }

  /**
   * Convenience method: Notify on task/node failure
   */
  async notifyError(message: string, error?: Error): Promise<void> {
    await this.notify('task_failed', {
      message,
      data: { error: error?.message },
    });
  }

  /**
   * Convenience method: Notify when worker starts
   */
  async notifyWorkerStarted(): Promise<void> {
    await this.notify('worker_started', {
      message: 'Worker started processing tasks',
    });
  }

  /**
   * Convenience method: Notify when worker completes
   */
  async notifyWorkerComplete(processed: number): Promise<void> {
    await this.notify('worker_complete', {
      message: `Worker completed: ${processed} nodes processed`,
      data: { processed },
    });
  }

  /**
   * Convenience method: Notify when queue is empty
   */
  async notifyQueueEmpty(): Promise<void> {
    await this.notify('queue_empty', {
      message: 'Queue is empty - no more tasks to process',
    });
  }

  /**
   * Convenience method: Notify when worker TTL expires
   */
  async notifyTTLExpired(ttlSeconds: number, processed: number): Promise<void> {
    await this.notify('ttl_expired', {
      message: `Worker TTL expired (${ttlSeconds}s): ${processed} nodes processed`,
      data: { ttlSeconds, processed },
    });
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<NotificationConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      sounds: {
        ...this.config.sounds,
        ...updates.sounds,
      },
    };

    // Reinitialize audio player if volume changed
    if (updates.volume !== undefined && this.audioPlayer) {
      this.audioPlayer.setVolume(updates.volume);
    }
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }
}
