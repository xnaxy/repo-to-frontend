const array = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' && value.trim().length > 0;
const positive = value => Number.isFinite(value) && value > 0;
const names = value => Array.isArray(value) && value.length > 0 && value.every(text) && new Set(value).size === value.length;
export const stateSheetDeclaration = value => value?.kind === 'state-sheet' ? { kind: value.kind, imageSize: value.imageSize, fragments: value.fragments } : null;
export const validRect = (rect, size) => rect && size && ['x', 'y', 'width', 'height'].every(key => Number.isInteger(rect[key])) && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= size.width && rect.y + rect.height <= size.height;

// A state sheet is a physical design image, never a new product route. The
// contract inventories its excerpts before any final screenshot is inspected.
export function validateStateSheet(value, block, requirementIds) {
  if (value?.kind !== 'state-sheet') {
    if ((value?.kind !== undefined && value.kind !== 'page') || value?.fragments !== undefined) block('INVALID_REFERENCE_KIND', value?.id);
    return;
  }
  const fragments = array(value.fragments), size = value.imageSize;
  if (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height) || !positive(size.width) || !positive(size.height)) block('INVALID_SHEET_SIZE', value.id);
  if (!names(fragments.map(fragment => fragment?.id))) block('INVALID_FRAGMENT_IDS', value.id);
  const mapped = [];
  for (const fragment of fragments) {
    const id = `${value.id}/${fragment?.id}`, target = fragment?.target, viewport = target?.viewport;
    if (!validRect(fragment?.sourceRect, size)) block('INVALID_SOURCE_RECT', id);
    if (!text(target?.pageId) || target.pageId === value.id || !text(target?.stateId) || !viewport || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) || !positive(viewport.width) || !positive(viewport.height) || !positive(viewport.deviceScaleFactor)) block('INVALID_FRAGMENT_TARGET', id);
    if (!names(fragment?.regions)) block('MISSING_REGION_INVENTORY', id);
    if (!names(fragment?.requirementIds)) block('INVALID_FRAGMENT_REQUIREMENTS', id);
    mapped.push(...array(fragment?.requirementIds));
  }
  if (new Set(mapped).size !== mapped.length || (requirementIds && (mapped.length !== requirementIds.length || mapped.some(id => !requirementIds.includes(id))))) block('FRAGMENT_REQUIREMENT_COVERAGE', value.id);
  for (let i = 0; i < fragments.length; i++) for (let j = i + 1; j < fragments.length; j++) {
    const a = fragments[i]?.sourceRect, b = fragments[j]?.sourceRect;
    if (validRect(a, size) && validRect(b, size) && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) block('OVERLAPPING_SOURCE_RECTS', `${value.id}/${fragments[i].id}/${fragments[j].id}`);
  }
}
