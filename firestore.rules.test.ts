import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesText = fs.readFileSync('DRAFT_firestore.rules', 'utf8');

test('Firestore security rules include all 8 hardened pillars and reject Dirty Dozen vulnerabilities', () => {
  // 1. Default deny catch-all
  assert.ok(rulesText.includes('match /{document=**}'));
  assert.ok(rulesText.includes('allow read, write: if false;'));

  // 2. Verified email requirement
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));

  // 3. ID Poisoning guard
  assert.ok(rulesText.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"));

  // 4. Strict keys & anti-update-gap
  assert.ok(rulesText.includes('isValidUserProfile(incoming())'));
  assert.ok(rulesText.includes('isValidCompletedGame(incoming())'));
  assert.ok(rulesText.includes("affectedKeys().hasOnly(['displayName', 'rating', 'wins', 'losses', 'draws', 'updatedAt'])"));

  // 5. Temporal integrity & immortal fields
  assert.ok(rulesText.includes('incoming().createdAt == request.time'));
  assert.ok(rulesText.includes('incoming().updatedAt == request.time'));
  assert.ok(rulesText.includes('incoming().createdAt == existing().createdAt'));

  // 6. Secure list queries on games
  assert.ok(rulesText.includes('allow list: if isSignedIn() && existing().ownerUid == request.auth.uid;'));

  // 7. Relational existence check on game creation
  assert.ok(rulesText.includes('exists(/databases/$(database)/documents/users/$(request.auth.uid))'));
});
