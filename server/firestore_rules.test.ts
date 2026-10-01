import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Firestore Security Rules Verification Suite', async (t) => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules file must exist');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  await t.test('Rules file denies direct client access to the API-mediated control plane', () => {
    assert.match(rulesContent, /rules_version\s*=\s*'2';/, 'Must specify rules_version 2');
    assert.match(rulesContent, /service\s+cloud\.firestore/, 'Must target cloud.firestore service');
    assert.match(rulesContent, /match\s+\/databases\/\{database\}\/documents/, 'Must match database documents');
    assert.match(rulesContent, /allow\s+read,\s*write\s*:\s*if\s+false\s*;/, 'Control-plane client access must be denied by default');
    assert.doesNotMatch(rulesContent, /allow\s+read\s*,\s*write\s*:\s*if\s+true\s*;/, 'Unrestricted Firestore access is forbidden');
  });
});
