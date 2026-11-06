import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubmoduleStatus } from '../src/features/ops/submodules';

test('submodule status parser classifies clean, modified and uninitialized entries', () => {
  const rows = parseSubmoduleStatus('C:/repo', ' 1a2b3c4d libs/clean\n+9e8d7c6b libs/modified (dirty)\n-00000000 libs/missing\n');
  assert.deepEqual(rows.map(r => [r.path, r.status, r.head]), [
    ['libs/clean', 'clean', '1a2b3c4d'],
    ['libs/modified', 'modified', '9e8d7c6b'],
    ['libs/missing', 'uninitialized', '00000000'],
  ]);
});
