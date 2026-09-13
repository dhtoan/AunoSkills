import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceGraph } from '../src/index.ts';

test('evidence graph bounds confidence and keeps workspace scope', () => {
  const graph = new EvidenceGraph();
  graph.add({ subject: 'nextjs', signal: 'dependency', weight: 0.55, source: 'package.json', scope: 'apps/web' });
  graph.add({ subject: 'nextjs', signal: 'config', weight: 0.55, source: 'next.config.ts', scope: 'apps/web' });
  graph.add({ subject: 'nextjs', signal: 'archived-example', weight: -0.2, source: 'examples/old', scope: 'apps/web' });
  graph.add({ subject: 'nextjs', signal: 'dependency', weight: 0.4, source: 'package.json', scope: 'apps/admin' });
  assert.equal(graph.score('nextjs', 'apps/web'), 0.9);
  assert.equal(graph.score('nextjs', 'apps/admin'), 0.4);
  assert.equal(graph.score('missing', 'apps/web'), 0);
});

test('evidence graph exposes explainable positive and negative signals', () => {
  const graph = new EvidenceGraph();
  graph.add({ subject: 'wordpress', signal: 'plugin-header', weight: 0.7, source: 'plugin.php', scope: '.' });
  graph.add({ subject: 'wordpress', signal: 'vendor-only', weight: -0.1, source: 'vendor/', scope: '.' });
  const explanation = graph.explain('wordpress', '.');
  assert.deepEqual(explanation.map((item) => item.signal), ['plugin-header', 'vendor-only']);
});
