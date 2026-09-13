import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { selectRecipes, validateCatalog } from '../select-visual-recipe.mjs';

const catalog = () => JSON.parse(readFileSync(new URL('../../references/visual-recipes.json', import.meta.url), 'utf8'));
describe('visual recipe selection', () => {
  it('offers a mechanism diagram for understanding, not a marketing page', () => {
    const result = selectRecipes(catalog(), { artifact: 'diagram', task: 'understand', density: 'dense' });
    expect(result.status).toBe('CANDIDATES');
    expect(result.candidates.map(r => r.id)).toEqual(['technical-explainer']);
    expect(result.catalogSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('distinguishes analytical comparison from operating a form', () => {
    expect(selectRecipes(catalog(), { artifact: 'ui', task: 'compare', density: 'dense' }).candidates[0].id).toBe('analytical-workbench');
    expect(selectRecipes(catalog(), { artifact: 'ui', task: 'operate', density: 'medium' }).candidates[0].id).toBe('task-workspace');
  });
  it('does not guess from substring words or coerce malformed input', () => {
    for (const bad of [null, [], { artifact: 'liquid', task: 'understand', density: 'dense' }, { artifact: 'ui', task: 'compare' }, { artifact: 'ui', task: 'compare', density: 'dense', referenceLocked: 'false' }]) {
      expect(() => selectRecipes(catalog(), bad)).toThrow();
    }
  });
  it('keeps an existing locked reference outside the redesign selector', () => {
    const result = selectRecipes(catalog(), { referenceLocked: true });
    expect(result.status).toBe('REFERENCE_LOCKED');
    expect(result.candidates).toEqual([]);
  });
  it('returns no match instead of silently changing the users task', () => {
    expect(selectRecipes(catalog(), { artifact: 'brand-board', task: 'compare', density: 'dense' }).status).toBe('NO_MATCH');
  });
  it('preserves all recipes and reports actual matching reasons', () => {
    const c = catalog(), before = JSON.stringify(c);
    const r = selectRecipes(c, { artifact: 'document', task: 'read', density: 'dense' });
    expect(r.candidates[0].id).toBe('editorial-report');
    expect(r.candidates[0].matched).toEqual(['artifact:document', 'task:read', 'density:dense']);
    expect(JSON.stringify(c)).toBe(before);
  });
  it('rejects duplicate ids, dangling sources, invalid enums and unpublished recipes', () => {
    const mutations = [
      c => c.recipes.push(structuredClone(c.recipes[0])),
      c => { c.recipes[0].sourceIds = ['missing']; },
      c => { c.recipes[0].artifacts = ['random']; },
      c => { c.recipes[0].layout[0] = '原文未公开'; },
      c => { c.recipes[0].layout = []; },
      c => { c.sources[0].url = 'file:///private/example'; },
      c => { c.sources[0].reviewed = false; },
      c => { c.recipes[0].businessCopy = ['10M+']; }
    ];
    for (const mutate of mutations) { const c = catalog(); mutate(c); expect(() => validateCatalog(c)).toThrow(); }
  });
  it('binds provenance to catalog content so a changed recipe invalidates its hash', () => {
    const c = catalog(), p = { artifact: 'ui', task: 'compare', density: 'dense' };
    const old = selectRecipes(c, p).catalogSha256;
    c.recipes[0].layout[0] += ' Additional layout detail.';
    expect(selectRecipes(c, p).catalogSha256).not.toBe(old);
  });
});
