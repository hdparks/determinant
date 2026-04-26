import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Node } from './Node.js';
import { DeterminantClient } from '../client/index.js';
import { OpenCodeConfig } from './types.js';
import { writeFile, mkdir, rm, chmod } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Node as NodeInterface } from '@determinant/types';

// Create a concrete test implementation of the abstract Node class
class TestNode extends Node {
  async process() {
    return {
      childNode: this,
      artifactPath: 'test',
    };
  }
}

describe('Node Linking Helpers', () => {
  let testDir: string;
  let mockClient: any;
  let config: OpenCodeConfig;
  let testNodeData: NodeInterface;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = join(tmpdir(), `test-determinant-${Date.now()}`);
    await mkdir(join(testDir, '.determinant/artifacts/test_task_123'), { recursive: true });

    // Mock client
    mockClient = {
      getNode: vi.fn(),
      createNode: vi.fn(),
      updateNode: vi.fn(),
    };

    config = {
      workingDir: testDir,
    };

    testNodeData = {
      id: 'test_node_123',
      taskId: 'test_task_123',
      parentNodeId: null,
      fromStage: null,
      toStage: 'Proposal' as const,
      content: '# Test Content',
      confidenceBefore: null,
      confidenceAfter: null,
      claimable: true,
      createdAt: new Date(),
      processedAt: new Date(),
    };
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('getRelativeArtifactPath', () => {
    it('returns correct relative path format', () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const path = (testNode as any).getRelativeArtifactPath('node_123_abc');
      expect(path).toBe('./node_123_abc.md');
    });
  });

  describe('getStageArtifactPath', () => {
    it('returns deterministic path based on stage', () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const path = (testNode as any).getStageArtifactPath();
      expect(path).toBe(join(testDir, '.determinant/artifacts/test_task_123/proposal.md'));
    });

    it('uses lowercase stage name', () => {
      const researchNode = new TestNode({
        ...testNodeData,
        toStage: 'Research' as const,
      }, mockClient as DeterminantClient, config);
      const path = (researchNode as any).getStageArtifactPath();
      expect(path).toContain('/research.md');
    });

    it('throws error when workingDir not configured', () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, { workingDir: undefined });
      expect(() => (testNode as any).getStageArtifactPath()).toThrow('workingDir is not configured');
    });

    it('is deterministic - same stage always returns same path', () => {
      const node1 = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const node2 = new TestNode({
        ...testNodeData,
        id: 'different_node_id_456', // Different node ID
      }, mockClient as DeterminantClient, config);
      
      const path1 = (node1 as any).getStageArtifactPath();
      const path2 = (node2 as any).getStageArtifactPath();
      
      // Same stage, same task → same path (enabling crash recovery)
      expect(path1).toBe(path2);
    });
  });

  describe('artifactExists', () => {
    it('returns true when artifact exists', async () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const nodeId = 'node_test_001';
      const artifactPath = join(testDir, '.determinant/artifacts/test_task_123', `${nodeId}.md`);
      await writeFile(artifactPath, '# Test Content');

      const exists = await (testNode as any).artifactExists(nodeId);
      expect(exists).toBe(true);
    });

    it('returns false when artifact does not exist', async () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const exists = await (testNode as any).artifactExists('nonexistent_node');
      expect(exists).toBe(false);
    });
  });

  describe('extractSummary', () => {
    it('returns full content when under maxLines', () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const content = '# Title\n\nLine 1\nLine 2\nLine 3';
      const summary = (testNode as any).extractSummary(content, 10);
      expect(summary).toBe(content);
    });

    it('truncates content when over maxLines', () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      const content = lines.join('\n');
      const summary = (testNode as any).extractSummary(content, 50);
      
      const summaryLines = summary.split('\n');
      expect(summaryLines.length).toBeLessThan(100);
      expect(summary).toContain('[Summary truncated');
    });

    it('defaults to 50 lines when maxLines not specified', () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      const content = lines.join('\n');
      const summary = (testNode as any).extractSummary(content);
      
      expect(summary).toContain('[Summary truncated');
    });
  });

  describe('getLinkText', () => {
    it('extracts title from markdown heading', () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const node = new TestNode({
        ...testNodeData,
        id: 'node_test',
        toStage: 'Research' as const,
        content: '# Research Questions: Test Topic\n\nSome content...',
      }, mockClient as DeterminantClient, config);
      
      const linkText = (testNode as any).getLinkText(node);
      expect(linkText).toBe('Research: Research Questions: Test Topic');
    });

    it('falls back to stage name when no heading found', () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const node = new TestNode({
        ...testNodeData,
        id: 'node_test',
        toStage: 'Research' as const,
        content: 'Some content without a heading',
      }, mockClient as DeterminantClient, config);
      
      const linkText = (testNode as any).getLinkText(node);
      expect(linkText).toBe('Research Document');
    });
  });

  describe('createArtifactLink', () => {
    it('generates valid markdown link', async () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const targetNode = new TestNode({
        ...testNodeData,
        id: 'node_target_123',
        toStage: 'Research' as const,
        content: '# Test Research\n\nContent...',
        confidenceBefore: 3,
        confidenceAfter: 8,
      }, mockClient as DeterminantClient, config);

      const link = await (testNode as any).createArtifactLink(targetNode, false);
      expect(link).toMatch(/\[Research: Test Research\]\(\.\/node_target_123\.md\)/);
    });

    it('includes metadata when requested', async () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const targetNode = new TestNode({
        ...testNodeData,
        id: 'node_target_123',
        toStage: 'Research' as const,
        content: '# Test Research\n\nContent...',
        confidenceBefore: 3,
        confidenceAfter: 8,
      }, mockClient as DeterminantClient, config);

      const link = await (testNode as any).createArtifactLink(targetNode, true);
      expect(link).toContain('**Path**:');
      expect(link).toContain('**Stage**: Research');
      expect(link).toContain('**Confidence**: 3 → 8');
    });
  });

  describe('readArtifactWithFallback', () => {
    it('reads from file when available', async () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const nodeId = 'node_test_003';
      const artifactPath = join(testDir, '.determinant/artifacts/test_task_123', `${nodeId}.md`);
      const testContent = '# Test Content\n\nThis is a test.';
      await writeFile(artifactPath, testContent);

      const content = await (testNode as any).readArtifactWithFallback(nodeId);
      expect(content).toBe(testContent);
    });

    it('falls back to database when file missing', async () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const nodeId = 'node_test_004';
      const dbContent = '# Database Content\n\nFrom database.';
      
      mockClient.getNode.mockResolvedValue({
        id: nodeId,
        content: dbContent,
        taskId: 'test_task_123',
        parentNodeId: null,
        fromStage: null,
        toStage: 'Research',
        confidenceBefore: null,
        confidenceAfter: null,
        createdAt: new Date(),
        processedAt: new Date(),
      });

      const content = await (testNode as any).readArtifactWithFallback(nodeId);
      expect(content).toBe(dbContent);
    });

    it('throws when both file and database unavailable', async () => {
      const testNode = new TestNode(testNodeData, mockClient as DeterminantClient, config);
      const nodeId = 'node_test_005';
      
      mockClient.getNode.mockResolvedValue({
        id: nodeId,
        content: null,
        taskId: 'test_task_123',
        parentNodeId: null,
        fromStage: null,
        toStage: 'Research',
        confidenceBefore: null,
        confidenceAfter: null,
        createdAt: new Date(),
        processedAt: new Date(),
      });

      await expect(
        (testNode as any).readArtifactWithFallback(nodeId)
      ).rejects.toThrow(/both unavailable/);
    });
  });
});
