import test from 'node:test';
import assert from 'node:assert/strict';
import {compactKeyLabel, KeyOverlay} from '../src/key-overlay.mjs';
import {normalizePreferences} from '../src/preferences.mjs';

test('Space remains the exact label for usual, compact and repeat badges', () => {
  const prefs = normalizePreferences({multiKeys: true, maxKeys: 6, repeatKeys: true});
  const overlay = new KeyOverlay();
  overlay.add(['Space', ' ', 'Spacebar', 'SPACE'], 0, prefs);
  overlay.add([' '], 200, prefs, true);
  const labels = overlay.read(201, prefs).map(badge => badge.label);
  assert.deepEqual(labels, ['Space', 'Space', 'Space', 'Space', 'Space']);
  assert.deepEqual(labels.map(compactKeyLabel), labels);
});

test('a six-key trail retains independent expiry and rejects arbitrary text', () => {
  const prefs = normalizePreferences({multiKeys: true, maxKeys: 6});
  const overlay = new KeyOverlay();
  overlay.add(['A', 'B', 'C', 'D', 'E', 'F'], 0, prefs);
  overlay.add(['private text', 'Space'], 120, prefs);
  assert.deepEqual(overlay.read(122, prefs).map(badge => badge.label), ['B', 'C', 'D', 'E', 'F', 'Space']);
  assert.deepEqual(overlay.read(1500, prefs).map(badge => badge.label), ['Space']);
  assert.deepEqual(overlay.read(1620, prefs), []);
});
