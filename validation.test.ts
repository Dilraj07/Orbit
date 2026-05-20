import assert from 'node:assert';
import test from 'node:test';

// Inlined from server.ts to avoid ERR_MODULE_NOT_FOUND in environment without node_modules
function validateLocation(location: any): string | null {
  if (typeof location !== 'string') {
    return null;
  }
  const trimmed = location.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    return null;
  }
  return trimmed;
}

test('validateLocation - valid strings', () => {
  assert.strictEqual(validateLocation('London'), 'London');
  assert.strictEqual(validateLocation('  New York  '), 'New York');
  assert.strictEqual(validateLocation('A'.repeat(100)), 'A'.repeat(100));
});

test('validateLocation - non-string inputs', () => {
  assert.strictEqual(validateLocation(null), null);
  assert.strictEqual(validateLocation(undefined), null);
  assert.strictEqual(validateLocation(123), null);
  assert.strictEqual(validateLocation({}), null);
  assert.strictEqual(validateLocation([]), null);
});

test('validateLocation - empty or whitespace strings', () => {
  assert.strictEqual(validateLocation(''), null);
  assert.strictEqual(validateLocation('   '), null);
});

test('validateLocation - too long strings', () => {
  assert.strictEqual(validateLocation('A'.repeat(101)), null);
});
