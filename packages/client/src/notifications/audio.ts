import player from 'play-sound';
import { existsSync } from 'fs';

/**
 * Cross-platform audio player
 */
export class AudioPlayer {
  private player: ReturnType<typeof player>;
  private volume: number;

  constructor(volume: number = 0.5) {
    this.volume = volume;
    this.player = player({ player: this.detectPlayer() });
  }

  /**
   * Detect platform-specific audio player
   */
  private detectPlayer(): 'afplay' | 'aplay' | undefined {
    switch (process.platform) {
      case 'darwin':
        return 'afplay';
      case 'linux':
        return 'aplay';  // Falls back to mpg123 if available
      default:
        return undefined;
    }
  }

  /**
   * Play a sound file
   */
  async play(filePath: string): Promise<void> {
    // Validate file exists
    if (!existsSync(filePath)) {
      throw new Error(`Sound file not found: ${filePath}`);
    }

    return new Promise((resolve, reject) => {
      this.player.play(filePath, (err) => {
        if (err) {
          reject(new Error(`Failed to play sound: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Update volume (0.0 - 1.0)
   * Note: Volume control depends on platform player capabilities
   */
  setVolume(volume: number): void {
    if (volume < 0 || volume > 1) {
      throw new Error('Volume must be between 0.0 and 1.0');
    }
    this.volume = volume;
  }
}
