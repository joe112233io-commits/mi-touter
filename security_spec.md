# TutorAI Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants & Master Sources of Truth

1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`allow read, write: if false;`).
2. **Verified Identity Gate**: Every read and write requires an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
3. **Path ID Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) validates the document ID against `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Master Gate & Relational Integrity**:
   - `users/{userId}`: `userId` path parameter must equal `request.auth.uid` and `incoming().userId == request.auth.uid`. No PII (`email`, `phone`, `address`) is stored in the document.
   - `courses/{courseId}`: Owned by `userId == request.auth.uid`.
   - `modules/{moduleId}`: Cannot be created unless `/courses/$(incoming().courseId)` exists and its `userId == request.auth.uid`.
   - `lessons/{lessonId}`: Cannot be created unless `/courses/$(incoming().courseId)` and `/modules/$(incoming().moduleId)` exist and belong to `request.auth.uid`.
   - `flashcards/{flashcardId}`: Cannot be created unless `/courses/$(incoming().courseId)` exists and belongs to `request.auth.uid`.
   - `homeworkSolutions/{solutionId}`: Owned by `userId == request.auth.uid`.
5. **Temporal Integrity & Immutability**:
   - On `create`: `incoming().createdAt == request.time && incoming().updatedAt == request.time`.
   - On `update`: `incoming().updatedAt == request.time && incoming().createdAt == existing().createdAt`, and ownership/relational keys (`userId`, `courseId`, `moduleId`, `lessonId`) are strictly immutable.
6. **Query Enforcer (Secure List Queries)**:
   - Every `allow list` rule enforces `isSignedIn() && isEmailVerified() && existing().userId == request.auth.uid` with zero `get()` or `exists()` calls inside `list`.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 — Unverified Email Spoof**: Authenticated user with `email_verified: false` attempting to create `/users/user_1`.
2. **Payload 2 — Cross-User Profile Read (PII / Profile Leak)**: Authenticated `user_2` attempting `get` on `/users/user_1`.
3. **Payload 3 — Shadow Field Injection on Create**: Creating `/courses/course_1` with required fields plus `{ "isAdmin": true }`.
4. **Payload 4 — Identity Spoofing on Course Create**: Authenticated `user_1` creating `/courses/course_1` with `userId: "user_2"`.
5. **Payload 5 — Orphaned Module Write**: Creating `/modules/mod_1` referencing a non-existent `courseId: "course_ghost"`.
6. **Payload 6 — Cross-Tenant Child Injection**: `user_2` creating `/modules/mod_1` pointing to `user_1`'s existing `course_1`.
7. **Payload 7 — Client Timestamp Forgery**: Creating `/courses/course_1` with a forged past/future `createdAt` timestamp instead of `request.time`.
8. **Payload 8 — Immutable Field Mutation on Update**: Updating `/courses/course_1` to change `userId` or `createdAt`.
9. **Payload 9 — Action-Gap Shadow Update**: Updating `/lessons/les_1` by modifying `title` during a progress completion update that only permits `['isCompleted', 'contentMarkdown', 'simplifiedMarkdown', 'examplesMarkdown', 'updatedAt']`.
10. **Payload 10 — Value Poisoning on Update**: Updating `/courses/course_1` `progressPercentage` with a string `"100%"` or `150` (> 100) to bypass `isValidCourse(incoming())`.
11. **Payload 11 — Denial-of-Wallet Oversized String**: Creating `/flashcards/fc_1` with a 10,000-character `frontPrompt` (exceeding max 1000).
12. **Payload 12 — Unfiltered Collection List Scraping**: Executing an unfiltered `list` query on `/courses` without `where('userId', '==', auth.uid)`.
