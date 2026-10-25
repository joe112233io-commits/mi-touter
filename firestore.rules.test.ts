import { assertFails, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import * as fs from 'fs';

describe('TutorAI Firestore Security Rules — Dirty Dozen Verification', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'gen-lang-client-0383550818',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  const validNow = new Date();

  test('1. Unverified Email Spoof -> PERMISSION_DENIED', async () => {
    const unverifiedCtx = testEnv.authenticatedContext('user_1', { email_verified: false });
    await assertFails(
      unverifiedCtx.firestore().collection('users').doc('user_1').set({
        userId: 'user_1',
        fullName: 'Alex Morgan',
        planTier: 'genius',
        coursesGeneratedCount: 1,
        knowledgeLevelPref: 'beginner',
        learningStylePref: 'visual_and_practical',
        createdAt: validNow,
        updatedAt: validNow,
      })
    );
  });

  test('2. Cross-User Profile Read -> PERMISSION_DENIED', async () => {
    const user2Ctx = testEnv.authenticatedContext('user_2', { email_verified: true });
    await assertFails(user2Ctx.firestore().collection('users').doc('user_1').get());
  });

  test('3. Shadow Field Injection on Create -> PERMISSION_DENIED', async () => {
    const user1Ctx = testEnv.authenticatedContext('user_1', { email_verified: true });
    await assertFails(
      user1Ctx.firestore().collection('courses').doc('course_1').set({
        userId: 'user_1',
        title: 'AI Basics',
        topicPrompt: 'AI',
        learnerLevel: 'beginner',
        description: 'Intro to AI',
        progressPercentage: 0,
        createdAt: validNow,
        updatedAt: validNow,
        isAdmin: true,
      })
    );
  });

  test('4. Identity Spoofing on Course Create -> PERMISSION_DENIED', async () => {
    const user1Ctx = testEnv.authenticatedContext('user_1', { email_verified: true });
    await assertFails(
      user1Ctx.firestore().collection('courses').doc('course_1').set({
        userId: 'user_2',
        title: 'AI Basics',
        topicPrompt: 'AI',
        learnerLevel: 'beginner',
        description: 'Intro to AI',
        progressPercentage: 0,
        createdAt: validNow,
        updatedAt: validNow,
      })
    );
  });

  test('5. Orphaned Module Write -> PERMISSION_DENIED', async () => {
    const user1Ctx = testEnv.authenticatedContext('user_1', { email_verified: true });
    await assertFails(
      user1Ctx.firestore().collection('modules').doc('mod_1').set({
        userId: 'user_1',
        courseId: 'non_existent_course',
        orderIndex: 1,
        title: 'Module 1',
        summary: 'Summary',
        createdAt: validNow,
        updatedAt: validNow,
      })
    );
  });

  test('6. Cross-Tenant Child Injection -> PERMISSION_DENIED', async () => {
    const user2Ctx = testEnv.authenticatedContext('user_2', { email_verified: true });
    await assertFails(
      user2Ctx.firestore().collection('modules').doc('mod_1').set({
        userId: 'user_2',
        courseId: 'course_owned_by_user_1',
        orderIndex: 1,
        title: 'Module 1',
        summary: 'Summary',
        createdAt: validNow,
        updatedAt: validNow,
      })
    );
  });

  test('7. Client Timestamp Forgery -> PERMISSION_DENIED', async () => {
    const user1Ctx = testEnv.authenticatedContext('user_1', { email_verified: true });
    await assertFails(
      user1Ctx.firestore().collection('courses').doc('course_1').set({
        userId: 'user_1',
        title: 'AI Basics',
        topicPrompt: 'AI',
        learnerLevel: 'beginner',
        description: 'Intro to AI',
        progressPercentage: 0,
        createdAt: new Date(2000, 1, 1),
        updatedAt: new Date(2000, 1, 1),
      })
    );
  });

  test('8. Immutable Field Mutation on Update -> PERMISSION_DENIED', async () => {
    const user1Ctx = testEnv.authenticatedContext('user_1', { email_verified: true });
    await assertFails(
      user1Ctx.firestore().collection('courses').doc('course_1').update({
        userId: 'user_2',
        updatedAt: validNow,
      })
    );
  });

  test('9. Action-Gap Shadow Update -> PERMISSION_DENIED', async () => {
    const user1Ctx = testEnv.authenticatedContext('user_1', { email_verified: true });
    await assertFails(
      user1Ctx.firestore().collection('lessons').doc('les_1').update({
        title: 'Hijacked Title',
        isCompleted: true,
        updatedAt: validNow,
      })
    );
  });

  test('10. Value Poisoning on Update -> PERMISSION_DENIED', async () => {
    const user1Ctx = testEnv.authenticatedContext('user_1', { email_verified: true });
    await assertFails(
      user1Ctx.firestore().collection('courses').doc('course_1').update({
        progressPercentage: 999,
        updatedAt: validNow,
      })
    );
  });

  test('11. Denial-of-Wallet Oversized String -> PERMISSION_DENIED', async () => {
    const user1Ctx = testEnv.authenticatedContext('user_1', { email_verified: true });
    await assertFails(
      user1Ctx.firestore().collection('flashcards').doc('fc_1').set({
        userId: 'user_1',
        courseId: 'course_1',
        lessonId: 'les_1',
        frontPrompt: 'x'.repeat(2000),
        backAnswer: 'Answer',
        easinessFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        nextReviewAtIso: new Date().toISOString(),
        createdAt: validNow,
        updatedAt: validNow,
      })
    );
  });

  test('12. Unfiltered Collection List Scraping -> PERMISSION_DENIED', async () => {
    const user2Ctx = testEnv.authenticatedContext('user_2', { email_verified: true });
    await assertFails(user2Ctx.firestore().collection('courses').get());
  });
});
