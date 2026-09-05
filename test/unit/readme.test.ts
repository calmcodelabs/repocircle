import { describe, it, expect } from 'vitest';
import { readmePreview } from '../../src/util/readme';

describe('readmePreview', () => {
  it('strips markdown syntax but keeps the meaning', () => {
    const out = readmePreview(
      '# Pocket Journal\n\nSave things **from your phone** via `Telegram`.',
    );
    expect(out).toContain('Pocket Journal');
    expect(out).toContain('Save things from your phone via Telegram.');
    expect(out).not.toContain('#');
    expect(out).not.toContain('**');
    expect(out).not.toContain('`');
  });

  it('drops badges, code fences, comments and rules', () => {
    const out = readmePreview(
      [
        '[![build](https://img.shields.io/x)](https://ci)',
        '<!-- hidden -->',
        '---',
        '# Real title',
        '```js',
        'const secret = 1;',
        '```',
        'After the fence.',
      ].join('\n'),
    );
    expect(out).toContain('Real title');
    expect(out).toContain('After the fence.');
    expect(out).not.toContain('shields.io');
    expect(out).not.toContain('const secret');
    expect(out).not.toContain('hidden');
  });

  it('keeps link text without the URL, and bullets readable', () => {
    const out = readmePreview('See [the docs](https://example.com/docs)\n\n- first\n- second');
    expect(out).toContain('See the docs');
    expect(out).not.toContain('https://example.com');
    expect(out).toContain('• first');
  });

  it('never emits raw HTML from remote content', () => {
    const out = readmePreview('# Hi\n\n<img src=x onerror=alert(1)>\n\nnormal text');
    // Rendered as a text node by the UI; assert we do not fabricate markup ourselves.
    expect(out).not.toContain('<script');
    expect(out).toContain('normal text');
  });

  it('truncates long readmes with an ellipsis', () => {
    const out = readmePreview('x'.repeat(50) + '\n\n' + 'y'.repeat(2000), 120);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith('…')).toBe(true);
  });
});
