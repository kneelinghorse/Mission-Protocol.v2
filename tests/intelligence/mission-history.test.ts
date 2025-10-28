import path from 'path';
import { promises as fs } from 'fs';
import { MissionHistoryAnalyzer } from '../../src/intelligence/mission-history';
import { ensureTempDir, removeDir } from '../../src/utils/fs';

describe('MissionHistoryAnalyzer', () => {
  let tempDir: string;
  let sessionsPath: string;

  beforeEach(async () => {
    tempDir = await ensureTempDir('mission-history-');
    sessionsPath = path.join(tempDir, 'sessions.jsonl');
  });

  afterEach(async () => {
    await removeDir(tempDir);
  });

  async function writeEvents(lines: string[]): Promise<void> {
    await fs.writeFile(sessionsPath, `${lines.join('\n')}\n`, 'utf-8');
  }

  it('derives transitions from next hints and sequenced events', async () => {
    await writeEvents([
      JSON.stringify({
        ts: '2025-01-01T00:00:00Z',
        mission: 'A1.1',
        action: 'complete',
        status: 'completed',
        summary: 'Mission A complete.',
        next_hint: 'B2.1 promoted to Current.',
      }),
      JSON.stringify({
        ts: '2025-01-01T00:01:00Z',
        mission: 'B2.1',
        action: 'start',
        status: 'in_progress',
        summary: 'Beginning mission B.',
      }),
    ]);

    const analyzer = new MissionHistoryAnalyzer({ sessionsPath });
    const transitions = await analyzer.deriveTransitions();

    expect(transitions).toHaveLength(2);
    const sources = transitions.map((transition) => transition.source);
    expect(sources).toContain('next_hint');
    expect(sources).toContain('sequence');
    for (const transition of transitions) {
      expect(transition.from).toBe('B2.1');
      expect(transition.to).toBe('A1.1');
      expect(transition.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('collects recent completion highlights per mission', async () => {
    await writeEvents([
      JSON.stringify({
        ts: '2025-01-01T00:00:00Z',
        mission: 'A1.1',
        action: 'complete',
        status: 'completed',
        summary: 'First completion.',
        agent: 'gpt-5-codex',
      }),
      JSON.stringify({
        ts: '2025-01-02T00:00:00Z',
        mission: 'A1.1',
        action: 'complete',
        status: 'completed',
        summary: 'Second completion.',
        agent: 'gpt-5-codex',
      }),
      JSON.stringify({
        ts: '2025-01-02T12:00:00Z',
        action: 'complete',
        status: 'completed',
        summary: 'Missing mission should be ignored.',
      }),
      'not-valid-json',
      JSON.stringify({
        ts: '2025-01-03T00:00:00Z',
        mission: 'B2.1',
        action: 'complete',
        status: 'completed',
        summary: 'B mission done.',
        agent: 'claude',
      }),
    ]);

    const analyzer = new MissionHistoryAnalyzer({ sessionsPath });
    const highlights = await analyzer.collectHighlights(['A1.1', 'B2.1'], 1);

    expect(highlights).toHaveLength(2);
    const ids = highlights.map((highlight) => highlight.missionId);
    expect(ids).toContain('A1.1');
    expect(ids).toContain('B2.1');
    const aHighlight = highlights.find((highlight) => highlight.missionId === 'A1.1');
    expect(aHighlight?.summary).toBe('Second completion.');
  });

  it('skips self-references and filters duplicate transitions', async () => {
    await writeEvents([
      JSON.stringify({
        ts: '2025-01-01T00:00:00Z',
        mission: 'C3.1',
        action: 'complete',
        status: 'completed',
        next_hint: 'C3.1 has been wrapped up.',
      }),
      JSON.stringify({
        ts: '2025-01-01T00:05:00Z',
        mission: 'C3.1',
        action: 'start',
        status: 'in_progress',
      }),
      JSON.stringify({
        ts: '2025-01-01T00:10:00Z',
        mission: 'C3.1',
        action: 'complete',
        status: 'completed',
        next_hint: 'C3.2 queued next.',
      }),
      JSON.stringify({
        ts: '2025-01-01T00:10:30Z',
        mission: 'C3.2',
        action: 'start',
        status: 'in_progress',
      }),
      JSON.stringify({
        ts: '2025-01-01T00:12:00Z',
        mission: 'C3.2',
        action: 'start',
        status: 'in_progress',
      }),
      JSON.stringify({
        ts: '2025-01-01T00:15:00Z',
        mission: 'C3.1',
        action: 'complete',
        status: 'completed',
        next_hint: 'C3.2 queued next.',
      }),
    ]);

    const analyzer = new MissionHistoryAnalyzer({ sessionsPath });
    const transitions = await analyzer.deriveTransitions();

    expect(transitions).toHaveLength(2);
    const bySource = transitions.reduce<Record<string, number>>((acc, transition) => {
      acc[transition.source] = (acc[transition.source] ?? 0) + 1;
      expect(transition.from).toBe('C3.2');
      expect(transition.to).toBe('C3.1');
      return acc;
    }, {});
    expect(bySource.next_hint).toBe(1);
    expect(bySource.sequence).toBe(1);
  });

  it('returns empty highlights when no mission ids are supplied', async () => {
    await writeEvents([
      JSON.stringify({
        ts: '2025-01-01T00:00:00Z',
        mission: 'D4.1',
        action: 'complete',
        status: 'completed',
      }),
    ]);

    const analyzer = new MissionHistoryAnalyzer({ sessionsPath });
    const highlights = await analyzer.collectHighlights([], 2);

    expect(highlights).toHaveLength(0);
  });
});
