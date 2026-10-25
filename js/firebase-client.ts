import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocFromServer,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// ============================================================================
// 1. Initialize Firebase App, Auth, and Firestore
// ============================================================================
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// ============================================================================
// 2. Mandatory Error Handler (FirestoreErrorInfo specification)
// ============================================================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ============================================================================
// 3. Validate Connection to Firestore on Boot
// ============================================================================
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// ============================================================================
// 4. Defensive Payload Sanitization (Synced verbatim with firebase-blueprint.json)
// ============================================================================
const ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

function sanitizeId(rawId: unknown, fallbackPrefix = 'id'): string {
  const cleaned = String(rawId || `${fallbackPrefix}_${Date.now()}`)
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 128);
  return ID_PATTERN.test(cleaned) && cleaned.length >= 1 ? cleaned : `${fallbackPrefix}_${Date.now()}`;
}

function clampString(val: unknown, minLen: number, maxLen: number, fallback = ''): string {
  const str = String(val ?? fallback).trim();
  if (str.length < minLen) {
    return fallback.slice(0, maxLen);
  }
  return str.slice(0, maxLen);
}

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ============================================================================
// 5. Real-Time Cloud Sync Bridge for TutorAI
// ============================================================================
class TutorAIFirebaseBridge {
  public currentUser: FirebaseUser | null = null;
  public isAuthReady = false;
  private unsubscribers: Unsubscribe[] = [];
  private knownCloudDocs = {
    users: new Set<string>(),
    courses: new Set<string>(),
    modules: new Set<string>(),
    lessons: new Set<string>(),
    flashcards: new Set<string>(),
    homeworkSolutions: new Set<string>(),
  };

  constructor() {
    this.initAuthListener();
  }

  private initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
      this.currentUser = user;
      this.isAuthReady = true;
      this.clearListeners();

      this.updateAuthUI(user);

      if (user && user.emailVerified) {
        await this.ensureUserProfile(user);
        this.attachRealtimeListeners(user.uid);
      }
    });
  }

  private clearListeners() {
    for (const unsub of this.unsubscribers) {
      try { unsub(); } catch (e) { console.error(e); }
    }
    this.unsubscribers = [];
    Object.values(this.knownCloudDocs).forEach(set => set.clear());
  }

  public async signInWithGoogle(): Promise<FirebaseUser | null> {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const w = window as any;
      if (w.tutorApp) {
        w.tutorApp.showToast(`Signed in as ${result.user.displayName || result.user.email}`);
      }
      document.getElementById('authModal')?.classList.remove('open');
      return result.user;
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      const w = window as any;
      if (w.tutorApp) {
        w.tutorApp.showToast(`Sign-in error: ${err?.message || 'Cancelled'}`);
      }
      return null;
    }
  }

  public async signOut(): Promise<void> {
    this.clearListeners();
    await firebaseSignOut(auth);
    const w = window as any;
    if (w.tutorApp) {
      w.tutorApp.showToast('Signed out of Firebase.');
    }
  }

  private updateAuthUI(user: FirebaseUser | null) {
    const navSignInBtn = document.getElementById('navSignInBtn');
    const storageLabel = document.getElementById('profileStorageEngine');
    const w = window as any;

    if (user) {
      if (navSignInBtn) {
        navSignInBtn.textContent = `${user.displayName || user.email?.split('@')[0] || 'Account'} (Sign Out)`;
      }
      if (storageLabel) {
        storageLabel.textContent = 'Firebase Firestore + Realm';
      }
      if (w.realmDB) {
        const localUser = w.realmDB.objects('User').items[0];
        if (localUser) {
          localUser.fullName = user.displayName || localUser.fullName || 'Learner';
          localUser.email = user.email || localUser.email;
          w.realmDB.persist();
        }
      }
      if (w.tutorApp && w.tutorApp.currentView === 'profile') {
        w.tutorApp.renderProfileView();
      }
    } else {
      if (navSignInBtn) {
        navSignInBtn.textContent = 'SIGN IN';
      }
      if (storageLabel) {
        storageLabel.textContent = 'Realm DB Local';
      }
    }
  }

  private async ensureUserProfile(user: FirebaseUser) {
    const uid = sanitizeId(user.uid, 'usr');
    const path = `users/${uid}`;
    const userRef = doc(db, 'users', uid);

    let snap;
    try {
      snap = await getDoc(userRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }

    const w = window as any;
    const localUser = w.realmDB?.objects('User')?.items?.[0];

    const allowedPlans = ['free', 'mentor', 'genius', 'enterprise'];
    const planTier = allowedPlans.includes(localUser?.planTier) ? localUser.planTier : 'genius';
    const allowedLevels = ['beginner', 'intermediate', 'advanced', 'all'];
    const knowledgeLevelPref = allowedLevels.includes(localUser?.knowledgeLevelPref)
      ? localUser.knowledgeLevelPref
      : 'intermediate';

    if (!snap.exists()) {
      const payload = {
        userId: uid,
        fullName: clampString(user.displayName || localUser?.fullName || 'Alex Morgan', 1, 120, 'Alex Morgan'),
        planTier,
        coursesGeneratedCount: clampInt(localUser?.coursesGeneratedCount ?? 3, 0, 100000, 3),
        knowledgeLevelPref,
        learningStylePref: clampString(localUser?.learningStylePref || 'visual_and_practical', 1, 64, 'visual_and_practical'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      try {
        await setDoc(userRef, payload);
        this.knownCloudDocs.users.add(uid);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    } else {
      this.knownCloudDocs.users.add(uid);
      const data = snap.data();
      if (w.realmDB && localUser && data) {
        localUser.fullName = data.fullName || user.displayName || localUser.fullName;
        localUser.planTier = data.planTier || localUser.planTier;
        localUser.coursesGeneratedCount = data.coursesGeneratedCount ?? localUser.coursesGeneratedCount;
        w.realmDB.persist();
        w.realmDB.notify();
      }
    }
  }

  private attachRealtimeListeners(uid: string) {
    const w = window as any;
    const validUid = sanitizeId(uid, 'usr');

    // 1. User Profile Listener
    const userPath = `users/${validUid}`;
    const unsubUser = onSnapshot(
      doc(db, 'users', validUid),
      (snap) => {
        if (snap.exists() && w.realmDB) {
          this.knownCloudDocs.users.add(validUid);
          const data = snap.data();
          const localUser = w.realmDB.objects('User').items[0];
          if (localUser) {
            localUser.fullName = data.fullName || localUser.fullName;
            localUser.planTier = data.planTier || localUser.planTier;
            localUser.coursesGeneratedCount = data.coursesGeneratedCount ?? localUser.coursesGeneratedCount;
            w.realmDB.persist();
            if (w.tutorApp && w.tutorApp.currentView === 'profile') {
              w.tutorApp.renderProfileView();
            }
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    );
    this.unsubscribers.push(unsubUser);

    // 2. Courses Listener
    const coursesQuery = query(collection(db, 'courses'), where('userId', '==', validUid));
    const unsubCourses = onSnapshot(
      coursesQuery,
      (snapshot) => {
        if (!w.realmDB) return;
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data();
          const docId = change.doc.id;
          this.knownCloudDocs.courses.add(docId);
          if (change.type === 'added' || change.type === 'modified') {
            w.realmDB.create('Course', {
              id: docId,
              userId: data.userId,
              title: data.title,
              topicPrompt: data.topicPrompt,
              learnerLevel: data.learnerLevel,
              description: data.description,
              isPublicFeatured: false,
              status: 'published',
              progressPercentage: data.progressPercentage ?? 0,
              createdAt: new Date().toISOString()
            }, 'modified');
          }
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'courses');
      }
    );
    this.unsubscribers.push(unsubCourses);

    // 3. Modules Listener
    const modulesQuery = query(collection(db, 'modules'), where('userId', '==', validUid));
    const unsubModules = onSnapshot(
      modulesQuery,
      (snapshot) => {
        if (!w.realmDB) return;
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data();
          const docId = change.doc.id;
          this.knownCloudDocs.modules.add(docId);
          if (change.type === 'added' || change.type === 'modified') {
            w.realmDB.create('Module', {
              id: docId,
              courseId: data.courseId,
              orderIndex: data.orderIndex,
              title: data.title,
              summary: data.summary || ''
            }, 'modified');
          }
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'modules');
      }
    );
    this.unsubscribers.push(unsubModules);

    // 4. Lessons Listener
    const lessonsQuery = query(collection(db, 'lessons'), where('userId', '==', validUid));
    const unsubLessons = onSnapshot(
      lessonsQuery,
      (snapshot) => {
        if (!w.realmDB) return;
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data();
          const docId = change.doc.id;
          this.knownCloudDocs.lessons.add(docId);
          if (change.type === 'added' || change.type === 'modified') {
            w.realmDB.create('Lesson', {
              id: docId,
              moduleId: data.moduleId,
              orderIndex: data.orderIndex,
              title: data.title,
              contentMarkdown: data.contentMarkdown || '',
              simplifiedMarkdown: data.simplifiedMarkdown || null,
              examplesMarkdown: data.examplesMarkdown || null,
              audioUrl: null,
              isCompleted: Boolean(data.isCompleted),
              completedAt: data.isCompleted ? new Date().toISOString() : null
            }, 'modified');
          }
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'lessons');
      }
    );
    this.unsubscribers.push(unsubLessons);

    // 5. Flashcards Listener
    const flashcardsQuery = query(collection(db, 'flashcards'), where('userId', '==', validUid));
    const unsubFlashcards = onSnapshot(
      flashcardsQuery,
      (snapshot) => {
        if (!w.realmDB) return;
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data();
          const docId = change.doc.id;
          this.knownCloudDocs.flashcards.add(docId);
          if (change.type === 'added' || change.type === 'modified') {
            w.realmDB.create('Flashcard', {
              id: docId,
              userId: data.userId,
              courseId: data.courseId,
              lessonId: data.lessonId,
              frontPrompt: data.frontPrompt,
              backAnswer: data.backAnswer,
              easinessFactor: data.easinessFactor ?? 2.5,
              intervalDays: data.intervalDays ?? 0,
              repetitions: data.repetitions ?? 0,
              nextReviewAt: data.nextReviewAtIso || new Date().toISOString()
            }, 'modified');
          }
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'flashcards');
      }
    );
    this.unsubscribers.push(unsubFlashcards);
  }

  // ==========================================================================
  // Outbound Cloud Sync Methods (Strictly enforcing firebase-blueprint.json)
  // ==========================================================================

  public async syncUserProfile(profile: {
    fullName?: string;
    planTier?: string;
    coursesGeneratedCount?: number;
    knowledgeLevelPref?: string;
    learningStylePref?: string;
  }) {
    if (!this.currentUser || !this.currentUser.emailVerified) return;
    const uid = sanitizeId(this.currentUser.uid, 'usr');
    const path = `users/${uid}`;
    const ref = doc(db, 'users', uid);

    const allowedPlans = ['free', 'mentor', 'genius', 'enterprise'];
    const planTier = allowedPlans.includes(profile.planTier || '') ? profile.planTier! : 'genius';
    const allowedLevels = ['beginner', 'intermediate', 'advanced', 'all'];
    const knowledgeLevelPref = allowedLevels.includes(profile.knowledgeLevelPref || '')
      ? profile.knowledgeLevelPref!
      : 'intermediate';

    if (this.knownCloudDocs.users.has(uid)) {
      try {
        await updateDoc(ref, {
          fullName: clampString(profile.fullName || this.currentUser.displayName || 'Alex Morgan', 1, 120, 'Alex Morgan'),
          planTier,
          coursesGeneratedCount: clampInt(profile.coursesGeneratedCount ?? 3, 0, 100000, 3),
          knowledgeLevelPref,
          learningStylePref: clampString(profile.learningStylePref || 'visual_and_practical', 1, 64, 'visual_and_practical'),
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    } else {
      await this.ensureUserProfile(this.currentUser);
    }
  }

  public async syncCourseBundle(
    course: any,
    modules: { modId: string; orderIndex: number; title: string; summary: string; lessons: { lesId: string; orderIndex: number; title: string; contentMarkdown?: string }[] }[]
  ) {
    if (!this.currentUser || !this.currentUser.emailVerified) return;
    const uid = sanitizeId(this.currentUser.uid, 'usr');
    const courseId = sanitizeId(course.id, 'course');
    const coursePath = `courses/${courseId}`;
    const allowedLevels = ['beginner', 'intermediate', 'advanced', 'all'];
    const learnerLevel = allowedLevels.includes(course.learnerLevel) ? course.learnerLevel : 'beginner';

    try {
      await setDoc(doc(db, 'courses', courseId), {
        userId: uid,
        title: clampString(course.title, 1, 200, 'Untitled Course'),
        topicPrompt: clampString(course.topicPrompt || course.title, 1, 500, 'General Topic'),
        learnerLevel,
        description: clampString(course.description || course.topicPrompt, 1, 2000, 'Interactive AI course.'),
        progressPercentage: clampNumber(course.progressPercentage ?? 0, 0, 100, 0),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      this.knownCloudDocs.courses.add(courseId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, coursePath);
    }

    for (const mod of modules) {
      const modId = sanitizeId(mod.modId, 'mod');
      const modPath = `modules/${modId}`;
      try {
        await setDoc(doc(db, 'modules', modId), {
          userId: uid,
          courseId,
          orderIndex: clampInt(mod.orderIndex, 1, 100, 1),
          title: clampString(mod.title, 1, 200, 'Module'),
          summary: clampString(mod.summary ?? '', 0, 1000, ''),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        this.knownCloudDocs.modules.add(modId);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, modPath);
      }

      for (const les of mod.lessons) {
        const lesId = sanitizeId(les.lesId, 'les');
        const lesPath = `lessons/${lesId}`;
        try {
          await setDoc(doc(db, 'lessons', lesId), {
            userId: uid,
            courseId,
            moduleId: modId,
            orderIndex: clampInt(les.orderIndex, 1, 100, 1),
            title: clampString(les.title, 1, 200, 'Lesson'),
            contentMarkdown: clampString(les.contentMarkdown ?? '', 0, 50000, ''),
            simplifiedMarkdown: '',
            examplesMarkdown: '',
            isCompleted: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          this.knownCloudDocs.lessons.add(lesId);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, lesPath);
        }
      }
    }
  }

  public async ensureSeedCourseInCloud(courseIdRaw: string): Promise<boolean> {
    if (!this.currentUser || !this.currentUser.emailVerified) return false;
    const courseId = sanitizeId(courseIdRaw, 'course');
    if (this.knownCloudDocs.courses.has(courseId)) return true;

    const w = window as any;
    const course = w.realmDB?.objects('Course')?.find((c: any) => c.id === courseId);
    if (!course) return false;

    const rawModules = w.realmDB?.objects('Module')?.filtered((m: any) => m.courseId === courseId) || [];
    const bundleModules = rawModules.map((m: any) => {
      const rawLessons = w.realmDB?.objects('Lesson')?.filtered((l: any) => l.moduleId === m.id) || [];
      return {
        modId: m.id,
        orderIndex: m.orderIndex || 1,
        title: m.title,
        summary: m.summary || '',
        lessons: rawLessons.map((l: any) => ({
          lesId: l.id,
          orderIndex: l.orderIndex || 1,
          title: l.title,
          contentMarkdown: l.contentMarkdown || ''
        }))
      };
    });

    await this.syncCourseBundle(course, bundleModules);
    return true;
  }

  public async syncLessonUpdate(lesson: any, courseIdRaw: string) {
    if (!this.currentUser || !this.currentUser.emailVerified) return;
    const lesId = sanitizeId(lesson.id, 'les');
    const courseId = sanitizeId(courseIdRaw, 'course');
    await this.ensureSeedCourseInCloud(courseId);

    const path = `lessons/${lesId}`;
    const ref = doc(db, 'lessons', lesId);

    if (this.knownCloudDocs.lessons.has(lesId)) {
      try {
        await updateDoc(ref, {
          contentMarkdown: clampString(lesson.contentMarkdown ?? '', 0, 50000, ''),
          simplifiedMarkdown: clampString(lesson.simplifiedMarkdown ?? '', 0, 25000, ''),
          examplesMarkdown: clampString(lesson.examplesMarkdown ?? '', 0, 25000, ''),
          isCompleted: Boolean(lesson.isCompleted),
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    }
  }

  public async syncCourseProgress(courseIdRaw: string, progressPercentage: number) {
    if (!this.currentUser || !this.currentUser.emailVerified) return;
    const courseId = sanitizeId(courseIdRaw, 'course');
    await this.ensureSeedCourseInCloud(courseId);

    const path = `courses/${courseId}`;
    try {
      await updateDoc(doc(db, 'courses', courseId), {
        progressPercentage: clampNumber(progressPercentage, 0, 100, 0),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  public async syncFlashcard(card: any) {
    if (!this.currentUser || !this.currentUser.emailVerified) return;
    const uid = sanitizeId(this.currentUser.uid, 'usr');
    const fcId = sanitizeId(card.id, 'fc');
    const courseId = sanitizeId(card.courseId || 'course_ai_foundations', 'course');
    const lessonId = sanitizeId(card.lessonId || 'les_ai_1_1', 'les');

    await this.ensureSeedCourseInCloud(courseId);

    const path = `flashcards/${fcId}`;
    const ref = doc(db, 'flashcards', fcId);

    if (this.knownCloudDocs.flashcards.has(fcId)) {
      try {
        await updateDoc(ref, {
          easinessFactor: clampNumber(card.easinessFactor ?? 2.5, 1.3, 5.0, 2.5),
          intervalDays: clampInt(card.intervalDays ?? 0, 0, 36500, 0),
          repetitions: clampInt(card.repetitions ?? 0, 0, 10000, 0),
          nextReviewAtIso: clampString(card.nextReviewAt || new Date().toISOString(), 10, 40, new Date().toISOString()),
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    } else {
      try {
        await setDoc(ref, {
          userId: uid,
          courseId,
          lessonId,
          frontPrompt: clampString(card.frontPrompt, 1, 1000, 'Question'),
          backAnswer: clampString(card.backAnswer, 1, 2000, 'Answer'),
          easinessFactor: clampNumber(card.easinessFactor ?? 2.5, 1.3, 5.0, 2.5),
          intervalDays: clampInt(card.intervalDays ?? 0, 0, 36500, 0),
          repetitions: clampInt(card.repetitions ?? 0, 0, 10000, 0),
          nextReviewAtIso: clampString(card.nextReviewAt || new Date().toISOString(), 10, 40, new Date().toISOString()),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        this.knownCloudDocs.flashcards.add(fcId);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }
  }

  public async syncHomeworkSolution(solution: {
    id: string;
    toolType: 'math_solver' | 'homeworkify';
    inputText: string;
    extractedLatex?: string;
    subjectCategory: string;
    finalAnswer: string;
  }) {
    if (!this.currentUser || !this.currentUser.emailVerified) return;
    const uid = sanitizeId(this.currentUser.uid, 'usr');
    const solId = sanitizeId(solution.id, 'sol');
    const path = `homeworkSolutions/${solId}`;

    try {
      await setDoc(doc(db, 'homeworkSolutions', solId), {
        userId: uid,
        toolType: solution.toolType === 'homeworkify' ? 'homeworkify' : 'math_solver',
        inputText: clampString(solution.inputText, 1, 2000, 'Problem'),
        extractedLatex: clampString(solution.extractedLatex ?? '', 0, 2000, ''),
        subjectCategory: clampString(solution.subjectCategory || 'Mathematics', 1, 100, 'Mathematics'),
        finalAnswer: clampString(solution.finalAnswer, 1, 2000, 'Solved'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      this.knownCloudDocs.homeworkSolutions.add(solId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

const firebaseBridge = new TutorAIFirebaseBridge();
(window as any).firebaseBridge = firebaseBridge;
export default firebaseBridge;
