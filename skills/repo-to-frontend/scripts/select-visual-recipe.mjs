import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const enums = {
  artifact: ['ui', 'diagram', 'document', 'brand-board'],
  task: ['operate', 'compare', 'understand', 'read', 'persuade', 'brand'],
  density: ['sparse', 'medium', 'dense'],
};
function requireThat(condition, message) { if (!condition) throw new Error(message); }
function object(value, keys, label) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  requireThat(Object.keys(value).every(key => keys.includes(key)), `${label}: unknown field`);
}
function text(value) {
  requireThat(typeof value === 'string' && value.trim().length > 0 && !/原文未公开|\b(?:TODO|TBD)\b/i.test(value), 'Missing or unpublished text');
}
function strings(values, allowed) {
  requireThat(Array.isArray(values) && values.length > 0, 'Expected nonempty list');
  values.forEach(text);
  requireThat(new Set(values).size === values.length, 'Duplicate list values');
  if (allowed) requireThat(values.every(value => allowed.includes(value)), 'Unknown list value');
}
function id(value) { text(value); requireThat(/^[a-z][a-z0-9-]*$/.test(value), 'Invalid id'); }

export function validateCatalog(catalog) {
  object(catalog, ['version', 'authorship', 'sources', 'recipes'], 'catalog');
  requireThat(catalog.version === 1, 'Unsupported catalog version');
  text(catalog.authorship);
  for (const key of ['sources', 'recipes']) requireThat(Array.isArray(catalog[key]) && catalog[key].length > 0, `Missing ${key}`);
  const sourceIds = new Set();
  for (const source of catalog.sources) {
    object(source, ['id', 'url', 'snapshotSha256', 'reviewed', 'scope'], 'source');
    id(source.id); requireThat(!sourceIds.has(source.id), 'Duplicate source id'); sourceIds.add(source.id);
    text(source.url); const url = new URL(source.url);
    requireThat(url.protocol === 'https:' && !url.username && !url.password, 'Source URL must use HTTPS without credentials');
    requireThat(typeof source.snapshotSha256 === 'string' && /^[a-f0-9]{64}$/.test(source.snapshotSha256), 'Invalid source hash');
    requireThat(source.reviewed === true, 'Source must have been reviewed'); text(source.scope);
  }
  const recipeIds = new Set();
  for (const recipe of catalog.recipes) {
    object(recipe, ['id', 'artifacts', 'tasks', 'densities', 'layout', 'avoid', 'sourceIds'], 'recipe');
    id(recipe.id); requireThat(!recipeIds.has(recipe.id), 'Duplicate recipe id'); recipeIds.add(recipe.id);
    strings(recipe.artifacts, enums.artifact); strings(recipe.tasks, enums.task); strings(recipe.densities, enums.density);
    strings(recipe.layout); strings(recipe.avoid); strings(recipe.sourceIds, [...sourceIds]);
  }
  return { status: 'CATALOG_VALID', recipeCount: catalog.recipes.length };
}

export function selectRecipes(catalog, profile) {
  validateCatalog(catalog);
  object(profile, ['artifact', 'task', 'density', 'referenceLocked'], 'profile');
  if ('referenceLocked' in profile) requireThat(typeof profile.referenceLocked === 'boolean', 'referenceLocked must be boolean');
  for (const [key, values] of Object.entries(enums)) {
    if (!profile.referenceLocked || key in profile) requireThat(values.includes(profile[key]), `Invalid or missing ${key}`);
  }
  const provenance = { catalogVersion: catalog.version, catalogSha256: createHash('sha256').update(JSON.stringify(catalog)).digest('hex') };
  if (profile.referenceLocked) return { ...provenance, status: 'REFERENCE_LOCKED', candidates: [] };
  const candidates = catalog.recipes.filter(r => r.artifacts.includes(profile.artifact) && r.tasks.includes(profile.task) && r.densities.includes(profile.density))
    .map(r => ({ ...structuredClone(r), matched: Object.keys(enums).map(key => `${key}:${profile[key]}`) }));
  return { ...provenance, status: candidates.length ? 'CANDIDATES' : 'NO_MATCH', candidates };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const catalog = JSON.parse(readFileSync(new URL('../references/visual-recipes.json', import.meta.url), 'utf8'));
    requireThat(process.argv.length === 3, 'Usage: node select-visual-recipe.mjs <profile.json|--validate>');
    const result = process.argv[2] === '--validate' ? validateCatalog(catalog) : selectRecipes(catalog, JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8')));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
