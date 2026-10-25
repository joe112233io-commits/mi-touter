/**
 * TutorAI Core Intelligence Engine (Real Multi-Provider Backend Client)
 * Connects to /api/providers and /api/ai/* endpoints on the server.
 * Supports OpenRouter, Google Gemini API, OpenAI API, Anthropic Claude, Groq, DeepSeek, and Custom API Providers.
 */

const AI_PROVIDER_PRESETS = {
  gemini: {
    name: 'Google Gemini API',
    providerType: 'gemini',
    protocol: 'gemini-native',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-3.1-flash-lite',
    suggestedModels: ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'],
    keyPlaceholder: 'AIzaSy...'
  },
  openrouter: {
    name: 'OpenRouter',
    providerType: 'openrouter',
    protocol: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    suggestedModels: [
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-flash',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-chat'
    ],
    keyPlaceholder: 'sk-or-v1-...'
  },
  openai: {
    name: 'OpenAI API',
    providerType: 'openai',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    keyPlaceholder: 'sk-proj-...'
  },
  anthropic: {
    name: 'Anthropic Claude API',
    providerType: 'anthropic',
    protocol: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    suggestedModels: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
    keyPlaceholder: 'sk-ant-...'
  },
  groq: {
    name: 'Groq Cloud API',
    providerType: 'groq',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    suggestedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    keyPlaceholder: 'gsk_...'
  },
  deepseek: {
    name: 'DeepSeek API',
    providerType: 'deepseek',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    keyPlaceholder: 'sk-...'
  },
  custom: {
    name: 'Custom API Provider',
    providerType: 'custom',
    protocol: 'openai-compatible',
    baseUrl: 'https://your-endpoint.example.com/v1',
    defaultModel: 'custom-model-id',
    suggestedModels: [],
    keyPlaceholder: 'Your API Key or Bearer Token'
  }
};

class TutorAIEngine {
  constructor() {
    this.presets = AI_PROVIDER_PRESETS;
    this.activeUserId = 'usr_default_learner';
    this.selectedProviderId = null; // null means use user's default provider or built-in server Gemini
    this.serverCapabilities = {
      builtInGeminiAvailable: false,
      defaultGeminiModel: 'gemini-3.1-flash-lite'
    };
    this.providers = [];
  }

  setUserId(userId) {
    this.activeUserId = userId || 'usr_default_learner';
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-user-id': this.activeUserId || 'usr_default_learner'
    };
  }

  // ==========================================================================
  // 1. Provider Management & Live Connection Verification
  // ==========================================================================
  async fetchProviders() {
    const resp = await fetch('/api/providers', {
      method: 'GET',
      headers: this.getHeaders()
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Failed to load AI providers.');
    }
    this.serverCapabilities = data.serverCapabilities || this.serverCapabilities;
    this.providers = data.providers || [];
    return data;
  }

  async saveProvider(providerPayload) {
    const resp = await fetch('/api/providers', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(providerPayload)
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Failed to save AI provider.');
    }
    this.providers = data.providers || [];
    return data;
  }

  async setDefaultProvider(providerId) {
    const resp = await fetch(`/api/providers/${encodeURIComponent(providerId)}/default`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Failed to set default provider.');
    }
    this.providers = data.providers || [];
    return data;
  }

  async deleteProvider(providerId) {
    const resp = await fetch(`/api/providers/${encodeURIComponent(providerId)}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Failed to delete provider.');
    }
    this.providers = data.providers || [];
    return data;
  }

  async testProviderConnection(testPayload) {
    const resp = await fetch('/api/providers/test', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(testPayload)
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Connection test failed.');
    }
    return data;
  }

  getActiveProviderSummary() {
    if (this.selectedProviderId && this.selectedProviderId !== 'system_default') {
      const found = this.providers.find(p => p.id === this.selectedProviderId);
      if (found) return found;
    }
    const def = this.providers.find(p => p.isDefault) || this.providers[0];
    if (def) return def;
    if (this.serverCapabilities.builtInGeminiAvailable) {
      return {
        id: 'system_gemini',
        name: 'Built-in Google Gemini Server',
        providerType: 'gemini',
        protocol: 'gemini-server',
        modelId: this.serverCapabilities.defaultGeminiModel || 'gemini-3.1-flash-lite',
        isDefault: true,
        lastTestedStatus: 'verified'
      };
    }
    return null;
  }

  // ==========================================================================
  // 2. Real Course Outline & Detailed Lesson Generation
  // ==========================================================================
  async generateCourseOutline(params) {
    const payload = {
      ...params,
      providerId: params.providerId || this.selectedProviderId
    };
    const resp = await fetch('/api/ai/generate-outline', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Failed to generate course outline.');
    }
    return data;
  }

  async generateLessonPackage(params) {
    const payload = {
      ...params,
      providerId: params.providerId || this.selectedProviderId
    };
    const resp = await fetch('/api/ai/generate-lesson', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Failed to generate lesson content.');
    }
    return data;
  }

  async reviewCourseConsistency(params) {
    const payload = {
      ...params,
      providerId: params.providerId || this.selectedProviderId
    };
    const resp = await fetch('/api/ai/review-consistency', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Failed to review course consistency.');
    }
    return data.audit;
  }

  async generateCourseStructure(topic, level = 'intermediate', goal = 'mastery', ragContext = null, extraOptions = {}) {
    const res = await this.generateCourseOutline({
      topic,
      learningGoal: goal,
      learnerLevel: extraOptions.learnerLevel || level,
      modulesCount: Number(extraOptions.modulesCount) || 4,
      lessonsPerModule: Number(extraOptions.lessonsPerModule) || 4,
      ragText: ragContext?.extractedText || extraOptions.ragText || '',
      customTitle: extraOptions.customTitle || '',
      learningOutcomes: extraOptions.learningOutcomes || '',
      customOutlineModules: extraOptions.customOutlineModules || null,
      allowAdditionalModules: extraOptions.allowAdditionalModules !== undefined ? extraOptions.allowAdditionalModules : true,
      instructionalMethods: extraOptions.instructionalMethods || '',
      additionalDetails: extraOptions.additionalDetails || '',
      personalized: Boolean(extraOptions.personalized),
      learningStyle: extraOptions.learningStyle || 'Practical & Examples'
    });
    return res.outline;
  }

  async generateLessonContent(lessonTitle, moduleTitle, courseTitle, level = 'intermediate', language = '', extraOptions = {}) {
    const res = await this.generateLessonPackage({
      courseTitle,
      moduleTitle,
      lessonTitle,
      learnerLevel: level,
      language,
      moduleIndex: extraOptions.moduleIndex || 1,
      lessonIndex: extraOptions.lessonIndex || 1,
      learningGoal: extraOptions.learningGoal || '',
      personalized: Boolean(extraOptions.personalized),
      learningStyle: extraOptions.learningStyle || 'Practical & Examples',
      instructionalMethods: extraOptions.instructionalMethods || '',
      additionalDetails: extraOptions.additionalDetails || ''
    });
    if (extraOptions.returnFullPackage) {
      return res.lesson || { contentMarkdown: '', simplifiedMarkdown: '', examplesMarkdown: '', quizQuestions: [] };
    }
    return res.lesson?.contentMarkdown || '';
  }

  async analyzeCoursePlan({
    topic = '',
    sourceText = '',
    targetModulesCount = 4,
    targetLessonsPerModule = 4,
    language = 'English',
    providerId = null
  }) {
    const resp = await fetch('/api/ai/analyze-course-plan', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        topic,
        sourceText,
        targetModulesCount,
        targetLessonsPerModule,
        language,
        providerId: providerId || this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Failed to analyze course plan.');
    }
    return data.plan;
  }

  async generateDiagnosticQuestions({ topic = '', language = 'English', providerId = null }) {
    const resp = await fetch('/api/ai/diagnostic-questions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        topic,
        language,
        providerId: providerId || this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || 'Failed to generate diagnostic questions.');
    }
    return data.questions || [];
  }

  // ==========================================================================
  // 3. Go Deeper Toolbar & Contextual Chat
  // ==========================================================================
  async generateSimplify(lessonContent, lessonTitle, language = 'English') {
    const resp = await fetch('/api/ai/go-deeper', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        action: 'simplify',
        lessonTitle,
        lessonContent,
        language,
        providerId: this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to simplify lesson.');
    return data.result;
  }

  async generateExamples(lessonContent, lessonTitle, language = 'English') {
    const resp = await fetch('/api/ai/go-deeper', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        action: 'examples',
        lessonTitle,
        lessonContent,
        language,
        providerId: this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to generate examples.');
    return data.result;
  }

  async generateQuiz(lessonContent, lessonTitle, language = 'English') {
    const resp = await fetch('/api/ai/go-deeper', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        action: 'quiz',
        lessonTitle,
        lessonContent,
        language,
        providerId: this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to generate quiz.');
    return data.result;
  }

  async generateFlashcardsForLesson(lessonTitle, lessonContent, language = 'English') {
    const resp = await fetch('/api/ai/go-deeper', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        action: 'flashcards',
        lessonTitle,
        lessonContent,
        language,
        providerId: this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to generate flashcards.');
    return data.result;
  }

  async answerLessonQuestion(question, lessonTitle, lessonContent) {
    const resp = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        question,
        lessonTitle,
        lessonContent,
        providerId: this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to answer question.');
    return data.reply;
  }

  // ==========================================================================
  // 4. AI Math Solver & Homeworkify
  // ==========================================================================
  async solveMathProblem(equation, imageBase64 = null, imageMimeType = null) {
    const resp = await fetch('/api/ai/solve-math', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        equation,
        imageBase64,
        imageMimeType,
        providerId: this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to solve math problem.');
    return data.solution;
  }

  async solveHomework(questionText) {
    const resp = await fetch('/api/ai/homework', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        questionText,
        providerId: this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to generate homework breakdown.');
    return data.solution;
  }

  async reviewWriting(essayText) {
    const resp = await fetch('/api/ai/review-writing', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        essayText,
        providerId: this.selectedProviderId
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Failed to review writing.');
    return data.review;
  }

  // ==========================================================================
  // 5. SuperMemo SM-2 Spaced Repetition Algorithm
  // ==========================================================================
  calculateSM2(q, currentEF = 2.50, currentInterval = 0, repetitions = 0) {
    let newEF = currentEF + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02));
    if (newEF < 1.3) newEF = 1.3;
    newEF = Math.round(newEF * 100) / 100;

    let newInterval = 0;
    let newRepetitions = repetitions;

    if (q < 2) {
      newRepetitions = 0;
      newInterval = 1;
    } else {
      if (repetitions === 0) {
        newInterval = 1;
      } else if (repetitions === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(currentInterval * newEF);
      }
      newRepetitions = repetitions + 1;
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + newInterval);

    return {
      easinessFactor: newEF,
      intervalDays: newInterval,
      repetitions: newRepetitions,
      nextReviewAt: nextDate.toISOString()
    };
  }
}

window.tutorAIEngine = new TutorAIEngine();
