import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Storage Security Rules deny direct browser access to tenant artifacts', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');
  assert.match(content, /rules_version\s*=\s*'2';/);
  assert.match(content, /match\s+\/tenants\/\{orgId\}/);
  assert.match(content, /allow\s+read,\s*write\s*:\s*if\s+false\s*;/);
  assert.doesNotMatch(content, /allow\s+read\s*,\s*write\s*:\s*if\s+true\s*;/);
});
