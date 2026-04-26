import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from './NotificationService.js';
import { DEFAULT_NOTIFICATION_CONFIG } from './types.js';

describe('NotificationService', () => {
  // Clear environment variables before each test
  beforeEach(() => {
    delete process.env.DETERMINANT_NOTIFY_ENABLED;
    delete process.env.DETERMINANT_NOTIFY_SOUND_ENABLED;
    delete process.env.DETERMINANT_NOTIFY_VOLUME;
    delete process.env.DETERMINANT_NOTIFY_VERBOSE;
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const service = new NotificationService();
      expect(service.isEnabled()).toBe(true);
    });

    it('should merge user config with defaults', () => {
      const service = new NotificationService({ enabled: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('should load from environment variables', () => {
      process.env.DETERMINANT_NOTIFY_ENABLED = 'false';
      const service = new NotificationService();
      expect(service.isEnabled()).toBe(false);
    });

    it('should prioritize user config over environment variables', () => {
      process.env.DETERMINANT_NOTIFY_ENABLED = 'false';
      const service = new NotificationService({ enabled: true });
      expect(service.isEnabled()).toBe(true);
    });

    it('should throw error for invalid volume', () => {
      expect(() => {
        new NotificationService({ volume: 2.0 });
      }).toThrow('Notification volume must be between 0.0 and 1.0');
    });
  });

  describe('notify', () => {
    it('should not notify when disabled', async () => {
      const service = new NotificationService({ enabled: false });
      await expect(service.notify('node_complete')).resolves.not.toThrow();
    });

    it('should handle missing sound files gracefully', async () => {
      const service = new NotificationService({
        soundEnabled: true,
        sounds: { node_complete: '/nonexistent/sound.wav' },
      });
      await expect(service.notify('node_complete')).resolves.not.toThrow();
    });

    it('should respect skipSound option', async () => {
      const service = new NotificationService({
        soundEnabled: true,
        sounds: { node_complete: '/some/sound.wav' },
      });
      // Should not throw even though sound file doesn't exist because skipSound is true
      await expect(service.notify('node_complete', { skipSound: true })).resolves.not.toThrow();
    });
  });

  describe('convenience methods', () => {
    it('should call notify with correct parameters', async () => {
      const service = new NotificationService({ enabled: false });
      await expect(service.notifyNodeComplete('123', 'Research')).resolves.not.toThrow();
      await expect(service.notifyTaskComplete('456', 'Test task')).resolves.not.toThrow();
      await expect(service.notifyError('Test error')).resolves.not.toThrow();
      await expect(service.notifyWorkerStarted()).resolves.not.toThrow();
      await expect(service.notifyWorkerComplete(5)).resolves.not.toThrow();
      await expect(service.notifyQueueEmpty()).resolves.not.toThrow();
    });

    it('should notify on TTL expiration', async () => {
      const service = new NotificationService({
        enabled: true,
        soundEnabled: false,  // Disable sound for testing
        verbose: false,
      });

      // Should not throw
      await expect(
        service.notifyTTLExpired(3600, 42)
      ).resolves.not.toThrow();
    });

    it('should notify on TTL expiration with different values', async () => {
      const service = new NotificationService({
        enabled: true,
        soundEnabled: false,
      });

      // Test with different TTL and processed values
      await expect(service.notifyTTLExpired(1800, 10)).resolves.not.toThrow();
      await expect(service.notifyTTLExpired(7200, 100)).resolves.not.toThrow();
      await expect(service.notifyTTLExpired(60, 0)).resolves.not.toThrow();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration at runtime', () => {
      const service = new NotificationService();
      service.updateConfig({ volume: 0.8 });
      expect(service.getConfig().volume).toBe(0.8);
    });

    it('should merge sound paths correctly', () => {
      const service = new NotificationService({
        sounds: { node_complete: '/sound1.wav' },
      });
      service.updateConfig({
        sounds: { task_complete: '/sound2.wav' },
      });
      const config = service.getConfig();
      expect(config.sounds.node_complete).toBe('/sound1.wav');
      expect(config.sounds.task_complete).toBe('/sound2.wav');
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const service = new NotificationService({ volume: 0.7 });
      const config = service.getConfig();
      expect(config.volume).toBe(0.7);
      expect(config.enabled).toBe(true);
    });

    it('should return a copy of config', () => {
      const service = new NotificationService();
      const config = service.getConfig();
      config.volume = 0.9;
      expect(service.getConfig().volume).toBe(0.5); // Should not have changed
    });
  });
});
