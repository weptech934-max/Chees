# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default Deny**: All paths not explicitly matched (`/users/{userId}` and `/games/{gameId}`) are strictly denied.
2. **Verified Identity**: Write operations require `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every document ID (`{userId}`, `{gameId}`) must satisfy `isValidId(id)` (`size <= 128` and regex `^[a-zA-Z0-9_\-]+$`).
4. **UserProfile Ownership & No PII Leakage**: `/users/{userId}` contains only public contender statistics (`uid`, `displayName`, `rating`, `wins`, `losses`, `draws`, `createdAt`, `updatedAt`) with zero PII (`email`, `phone`, `address` are forbidden by `hasOnly`). Only the owner (`request.auth.uid == userId`) can read or write their profile document, and `uid` and `createdAt` are immutable on update.
5. **CompletedGame Integrity & Terminal State Locking**: `/games/{gameId}` requires `ownerUid == request.auth.uid`, valid existence of `/users/$(request.auth.uid)`, `status == 'completed'`, and strict server timestamp `createdAt == request.time`. Because `status` is `'completed'` (a terminal state), updates and deletes are strictly forbidden (`allow update, delete: if false`).
6. **Secure List Queries**: `allow list` on `/games/{gameId}` enforces `resource.data.ownerUid == request.auth.uid` so clients cannot scrape other users' games.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` attempting `create` on `/users/user_1`.
2. **Unverified Email Spoof**: `auth = { uid: 'user_1', token: { email_verified: false } }` attempting `create` on `/users/user_1`.
3. **Identity Spoofing on UserProfile**: `auth.uid = 'user_1'` attempting `create` on `/users/user_2` or setting `uid: 'user_2'`.
4. **Shadow Field Injection on UserProfile**: Adding `isAdmin: true` or `email: 'leak@example.com'` to `/users/user_1`.
5. **Resource Poisoning (Oversized DisplayName)**: Setting `displayName` to a 500-character string (`> 50`).
6. **Temporal Forgery on UserProfile Create**: Setting `createdAt` to a past timestamp instead of `request.time`.
7. **Immortal Field Mutation on UserProfile Update**: Attempting to mutate `createdAt` or `uid` during an update to `/users/user_1`.
8. **Value Poisoning on UserProfile Update**: Updating `rating` with a string `'9999'` instead of an `int`/`number` in `[100, 4000]`.
9. **Orphaned Game Creation**: Creating `/games/game_1` when `/users/$(request.auth.uid)` does not exist.
10. **Cross-User Game Spoofing**: Creating `/games/game_1` with `ownerUid: 'other_user'`.
11. **Terminal State Mutation**: Attempting to `update` `/games/game_1` after `status == 'completed'`.
12. **Unauthorized List Scrape**: Querying `/games` without filtering `ownerUid == request.auth.uid`.
