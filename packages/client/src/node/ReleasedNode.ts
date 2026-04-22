import { Node } from './Node.js';
import type { ProcessResult } from './types.js';

export class ReleasedNode extends Node {
  async process(): Promise<ProcessResult> {
    throw new Error('Cannot process ReleasedNode - this is the final stage');
  }
}
