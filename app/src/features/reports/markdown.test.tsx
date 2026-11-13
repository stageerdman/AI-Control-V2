// @vitest-environment happy-dom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown, safeUrl } from './markdown';

const html = (src: string) => render(<Markdown source={src} />).container;

describe('report markdown (sanitised subset)', () => {
  it('headings drop a level under the page title (h3 / h4)', () => {
    const c = html('# Top\n## What we compared\n### Detail');
    expect([...c.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Top', 'What we compared']);
    expect(c.querySelector('h4')?.textContent).toBe('Detail');
    expect(c.querySelector('h1,h2')).toBeNull();
  });
  it('paragraphs join wrapped lines; blank lines split them', () => {
    const c = html('Stripe wins\non fees.\n\nAdyen if EU.');
    expect([...c.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'Stripe wins on fees.',
      'Adyen if EU.',
    ]);
  });
  it('lists: bullets and numbers', () => {
    const c = html('- Stripe — 1.5%\n* Adyen\n\n1. one\n2. two');
    expect(c.querySelectorAll('ul li')).toHaveLength(2);
    expect([...c.querySelectorAll('ol li')].map((l) => l.textContent)).toEqual(['one', 'two']);
  });
  it('inline: bold, em, code, links', () => {
    const c = html('**Fees** and *speed* in `pay.ts` — see [pricing](https://stripe.com/pricing).');
    expect(c.querySelector('strong')?.textContent).toBe('Fees');
    expect(c.querySelector('em')?.textContent).toBe('speed');
    expect(c.querySelector('code')?.textContent).toBe('pay.ts');
    const a = c.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://stripe.com/pricing');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noreferrer');
  });
  it('fenced code keeps its text verbatim', () => {
    const c = html('```ts\nconst a = 1 < 2;\n**not bold**\n```');
    expect(c.querySelector('pre code')?.textContent).toBe('const a = 1 < 2;\n**not bold**');
    expect(c.querySelector('strong')).toBeNull();
  });
  it('tables, quotes and rules', () => {
    const c = html('| Provider | Fee |\n|---|---|\n| Stripe | 1.5% |\n| Adyen | ++ |\n\n> a quote\n\n---');
    expect([...c.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Provider', 'Fee']);
    expect(c.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(c.querySelector('blockquote')?.textContent).toBe('a quote');
    expect(c.querySelector('hr')).not.toBeNull();
  });
  it('raw HTML and unsafe links stay inert text', () => {
    const c = html(
      '<script>alert(1)</script> <img src=x onerror=alert(1)>\n\n[click](javascript:alert(1)) [f](file:///etc/passwd)',
    );
    expect(c.querySelector('script,img')).toBeNull();
    expect(c.querySelector('a')).toBeNull();
    expect(c.textContent).toContain('<script>alert(1)</script>');
    expect(c.textContent).toContain('click');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('http://x.dev/a')).toBe('http://x.dev/a');
  });
});

describe('markdown — intraword underscores', () => {
  it('AI_STUDIO_RUNNER stays plain; _em_ and *em* still emphasise', () => {
    const c = html('Run AI_STUDIO_RUNNER=fake with _care_ and *joy*.');
    expect(c.textContent).toContain('AI_STUDIO_RUNNER=fake');
    expect([...c.querySelectorAll('em')].map((e) => e.textContent)).toEqual(['care', 'joy']);
  });
});
