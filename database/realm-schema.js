/**
 * TutorAI Official Realm DB Schema Definitions
 * Designed for local offline persistence and real AI course generation state tracking.
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
    role: { type: 'string', default: 'learner' },
    planTier: { type: 'string', default: 'free' },
    coursesGeneratedCount: { type: 'int', default: 0 },
    knowledgeLevelPref: { type: 'string', default: 'beginner' },
    learningStylePref: { type: 'string', default: 'visual_and_practical' },
    defaultProviderId: 'string?',
    createdAt: { type: 'date', default: () => new Date() }
  }
};

const AIProviderSchema = {
  name: 'AIProvider',
  primaryKey: 'id',
  properties: {
    id: 'string',
    userId: 'string',
    name: 'string',
    providerType: 'string', // openrouter, gemini, openai, anthropic, groq, deepseek, custom
    protocol: 'string',     // openai-compatible, gemini-native, gemini-server, anthropic-messages, custom-rest
    baseUrl: 'string?',
    modelId: 'string',
    maskedKey: 'string',    // e.g. sk-o••••••••9a2f (never raw secret!)
    temperature: { type: 'double', default: 0.7 },
    maxTokens: { type: 'int', default: 4096 },
    isDefault: { type: 'bool', default: false },
    lastTestedStatus: { type: 'string', default: 'untested' },
    lastLatencyMs: 'int?',
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
    embedding: 'string'
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
    learningGoal: { type: 'string', default: 'Mastery' },
    learnerLevel: { type: 'string', default: 'beginner' },
    targetAudience: { type: 'string', default: 'General Learners' },
    language: { type: 'string', default: 'English' },
    estimatedDuration: { type: 'string', default: '4 hours' },
    description: 'string',
    learningObjectivesJson: 'string?',
    expectedOutcomesJson: 'string?',
    consistencyAuditJson: 'string?',
    providerUsed: 'string?',
    isPublicFeatured: { type: 'bool', default: false },
    status: { type: 'string', default: 'published' }, // draft, generating, published
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
    summary: 'string?',
    objective: 'string?'
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
    summary: 'string?',
    estimatedMinutes: { type: 'int', default: 20 },
    learningObjectivesJson: 'string?',
    contentMarkdown: 'string',
    activitiesMarkdown: 'string?',
    referencesMarkdown: 'string?',
    simplifiedMarkdown: 'string?',
    examplesMarkdown: 'string?',
    generationStatus: { type: 'string', default: 'completed' }, // pending, generating, completed, failed
    lastError: 'string?',
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
    questionsJson: 'string',
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
    easinessFactor: { type: 'double', default: 2.50 },
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
    toolType: 'string',
    inputText: 'string',
    inputImageUrl: 'string?',
    extractedLatex: 'string?',
    subjectCategory: 'string',
    stepsJson: 'string',
    finalAnswer: 'string',
    createdAt: { type: 'date', default: () => new Date() }
  }
};

const RealmSchemas = [
  OrganizationSchema,
  UserSchema,
  AIProviderSchema,
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
    AIProviderSchema,
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
