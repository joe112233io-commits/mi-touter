/**
 * TutorAI Official Realm DB Schema Definitions
 * Designed for local offline persistence in Electron / Node environments.
 * Follows the 10-table architecture specified in the technical report.
 */

const OrganizationSchema = {
  name: 'Organization',
  primaryKey: 'id',
  properties: {
    id: 'string',
    name: 'string',
    customDomain: 'string?',
    logoUrl: 'string?',
    primaryColor: { type: 'string', default: '#4F46E5' },
    hideTutoraiBranding: { type: 'bool', default: false },
    createdAt: { type: 'date', default: () => new Date() }
  }
};

const UserSchema = {
  name: 'User',
  primaryKey: 'id',
  properties: {
    id: 'string',
    orgId: 'string?',
    email: 'string',
    fullName: 'string',
    role: { type: 'string', default: 'learner' }, // learner, educator, org_admin
    planTier: { type: 'string', default: 'free' }, // free, mentor, genius, enterprise
    coursesGeneratedCount: { type: 'int', default: 0 },
    knowledgeLevelPref: { type: 'string', default: 'beginner' },
    learningStylePref: { type: 'string', default: 'visual_and_practical' },
    stripeCustomerId: 'string?',
    createdAt: { type: 'date', default: () => new Date() }
  }
};

const SourceDocumentSchema = {
  name: 'SourceDocument',
  primaryKey: 'id',
  properties: {
    id: 'string',
    userId: 'string',
    fileName: 'string',
    fileUrl: 'string?',
    extractedText: 'string',
    createdAt: { type: 'date', default: () => new Date() }
  }
};

const DocumentChunkSchema = {
  name: 'DocumentChunk',
  primaryKey: 'id',
  properties: {
    id: 'string',
    documentId: 'string',
    chunkIndex: 'int',
    content: 'string',
    embedding: 'string' // serialized vector / embeddings
  }
};

const CourseSchema = {
  name: 'Course',
  primaryKey: 'id',
  properties: {
    id: 'string',
    userId: 'string',
    sourceDocumentId: 'string?',
    title: 'string',
    topicPrompt: 'string',
    learnerLevel: { type: 'string', default: 'beginner' },
    description: 'string',
    isPublicFeatured: { type: 'bool', default: false },
    status: { type: 'string', default: 'published' }, // outline_draft, published
    progressPercentage: { type: 'double', default: 0.0 },
    createdAt: { type: 'date', default: () => new Date() }
  }
};

const ModuleSchema = {
  name: 'Module',
  primaryKey: 'id',
  properties: {
    id: 'string',
    courseId: 'string',
    orderIndex: 'int',
    title: 'string',
    summary: 'string?'
  }
};

const LessonSchema = {
  name: 'Lesson',
  primaryKey: 'id',
  properties: {
    id: 'string',
    moduleId: 'string',
    orderIndex: 'int',
    title: 'string',
    contentMarkdown: 'string', // generated on demand (lazy loading)
    simplifiedMarkdown: 'string?',
    examplesMarkdown: 'string?',
    audioUrl: 'string?',
    isCompleted: { type: 'bool', default: false },
    completedAt: 'date?'
  }
};

const LessonQuizSchema = {
  name: 'LessonQuiz',
  primaryKey: 'id',
  properties: {
    id: 'string',
    lessonId: 'string',
    questionsJson: 'string', // serialized array of questions, options, correctIndex, explanation
    userScore: 'int?',
    completedAt: 'date?'
  }
};

const FlashcardSchema = {
  name: 'Flashcard',
  primaryKey: 'id',
  properties: {
    id: 'string',
    userId: 'string',
    courseId: 'string',
    lessonId: 'string?',
    frontPrompt: 'string',
    backAnswer: 'string',
    easinessFactor: { type: 'double', default: 2.50 }, // SM-2 EF
    intervalDays: { type: 'int', default: 0 },
    repetitions: { type: 'int', default: 0 },
    nextReviewAt: { type: 'date', default: () => new Date() }
  }
};

const HomeworkSolutionSchema = {
  name: 'HomeworkSolution',
  primaryKey: 'id',
  properties: {
    id: 'string',
    userId: 'string',
    toolType: 'string', // math_solver or homeworkify
    inputText: 'string',
    inputImageUrl: 'string?',
    extractedLatex: 'string?',
    subjectCategory: 'string',
    stepsJson: 'string', // serialized solution steps
    finalAnswer: 'string',
    createdAt: { type: 'date', default: () => new Date() }
  }
};

const RealmSchemas = [
  OrganizationSchema,
  UserSchema,
  SourceDocumentSchema,
  DocumentChunkSchema,
  CourseSchema,
  ModuleSchema,
  LessonSchema,
  LessonQuizSchema,
  FlashcardSchema,
  HomeworkSolutionSchema
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OrganizationSchema,
    UserSchema,
    SourceDocumentSchema,
    DocumentChunkSchema,
    CourseSchema,
    ModuleSchema,
    LessonSchema,
    LessonQuizSchema,
    FlashcardSchema,
    HomeworkSolutionSchema,
    RealmSchemas
  };
}
