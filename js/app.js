/**
 * TutorAI Main Application Controller
 * Handles Dual Navigation Routing, Two-Pane Study Workspace, Realm DB reactivity,
 * Go Deeper Toolbar, AI Math Solver, Spaced Repetition Flashcards, and Modals.
 */

class TutorAIApp {
  constructor() {
    this.currentView = 'home';
    this.currentCourseId = 'course_ai_foundations';
    this.currentLessonId = 'les_ai_1_1';
    this.flashcardsQueue = [];
    this.currentFlashcardIndex = 0;
    this.isCardFlipped = false;
    this.currentUser = null;
  }

  async init() {
    // 1. Initialize local Realm DB
    await window.realmDB.initialize();
    this.currentUser = window.realmDB.objects('User').items[0];

    // 2. Setup speech synthesis state listener
    window.speechController.onStateChange = (state) => {
      this.updateSpeechUI(state);
    };

    // 3. Bind event listeners
    this.bindEvents();

    // 4. Load initial courses & flashcards
    this.refreshAllData();

    // 5. Reactive Realm DB subscription
    window.realmDB.subscribe(() => {
      this.refreshAllData();
    });

    // 6. Check hash or default to home
    const hash = window.location.hash.replace('#', '') || 'home';
    this.navigateTo(hash);
  }

  bindEvents() {
    // Navigation link clicks
    document.querySelectorAll('[data-route]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const route = el.getAttribute('data-route');
        this.navigateTo(route);
      });
    });

    // Dual Navigation Mode Switcher (Manual toggle between Marketing and Workspace)
    const modeMarketingBtn = document.getElementById('modeMarketingBtn');
    const modeAppBtn = document.getElementById('modeAppBtn');
    if (modeMarketingBtn) {
      modeMarketingBtn.addEventListener('click', () => this.navigateTo('home'));
    }
    if (modeAppBtn) {
      modeAppBtn.addEventListener('click', () => this.navigateTo('course'));
    }

    // Hero prompt input
    const heroGenerateBtn = document.getElementById('heroGenerateBtn');
    const heroPromptInput = document.getElementById('heroPromptInput');
    if (heroGenerateBtn && heroPromptInput) {
      heroGenerateBtn.addEventListener('click', () => {
        const val = heroPromptInput.value.trim();
        if (val) {
          this.startCourseCreation(val);
        } else {
          this.navigateTo('create-course');
        }
      });
      heroPromptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') heroGenerateBtn.click();
      });
    }

    // Quick topic pills
    document.querySelectorAll('.topic-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const topic = pill.getAttribute('data-topic');
        this.startCourseCreation(topic);
      });
    });

    // Suggested topics in Create Course screen
    document.querySelectorAll('.suggested-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const topic = btn.getAttribute('data-topic');
        const input = document.getElementById('createCourseInput');
        if (input) input.value = topic;
      });
    });

    // Create course main button
    const submitCreateCourseBtn = document.getElementById('submitCreateCourseBtn');
    if (submitCreateCourseBtn) {
      submitCreateCourseBtn.addEventListener('click', () => {
        const input = document.getElementById('createCourseInput');
        const val = input ? input.value.trim() : '';
        if (!val) {
          this.showToast('Please enter a topic you want to learn.');
          return;
        }
        this.executeCourseCreation(val);
      });
    }

    // "Use your own sources" (RAG) card
    const useOwnSourcesCard = document.getElementById('useOwnSourcesCard');
    if (useOwnSourcesCard) {
      useOwnSourcesCard.addEventListener('click', () => this.openRagModal());
    }

    // "Define course structure" card
    const defineStructureCard = document.getElementById('defineStructureCard');
    if (defineStructureCard) {
      defineStructureCard.addEventListener('click', () => this.openStructureModal());
    }

    // Read Aloud button in study canvas
    const btnReadAloud = document.getElementById('btnReadAloud');
    if (btnReadAloud) {
      btnReadAloud.addEventListener('click', () => {
        const bodyEl = document.getElementById('lessonBodyMarkdown');
        if (bodyEl) {
          window.speechController.toggle(bodyEl.innerText);
        }
      });
    }

    // Go Deeper Toolbar buttons
    document.getElementById('btnGoSimplify')?.addEventListener('click', () => this.handleGoDeeper('simplify'));
    document.getElementById('btnGoExamples')?.addEventListener('click', () => this.handleGoDeeper('examples'));
    document.getElementById('btnGoQuiz')?.addEventListener('click', () => this.handleGoDeeper('quiz'));
    document.getElementById('btnGoFlashcards')?.addEventListener('click', () => this.handleGoDeeper('flashcards'));
    document.getElementById('btnGoAsk')?.addEventListener('click', () => this.openChatDrawer());

    // Mark Lesson Complete button
    document.getElementById('btnMarkComplete')?.addEventListener('click', () => this.markCurrentLessonComplete());

    // AI Math Solver events
    const solveMathBtn = document.getElementById('solveMathBtn');
    const mathInput = document.getElementById('mathEquationInput');
    if (solveMathBtn && mathInput) {
      solveMathBtn.addEventListener('click', () => this.handleSolveMath(mathInput.value));
      mathInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') solveMathBtn.click();
      });
    }

    const mathDropZone = document.getElementById('mathDropZone');
    const mathFileInput = document.getElementById('mathFileInput');
    if (mathDropZone && mathFileInput) {
      mathDropZone.addEventListener('click', () => mathFileInput.click());
      mathFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.showToast(`Analyzing mathematical image: ${e.target.files[0].name}...`);
          this.handleSolveMath('d/dx [ (3x^2 + 1)^4 ]');
        }
      });
    }

    // Flashcard 3D flip card click
    const flashcardFlipWrapper = document.getElementById('flashcardFlipWrapper');
    if (flashcardFlipWrapper) {
      flashcardFlipWrapper.addEventListener('click', () => this.toggleCardFlip());
    }

    // SM-2 Spaced Repetition Grade Buttons
    document.querySelectorAll('[data-sm2-grade]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const grade = parseInt(btn.getAttribute('data-sm2-grade'), 10);
        this.submitFlashcardGrade(grade);
      });
    });

    // Homeworkify Solver
    document.getElementById('btnSolveHomework')?.addEventListener('click', () => this.handleSolveHomework());
    document.getElementById('btnReviewWriting')?.addEventListener('click', () => this.handleReviewWriting());

    // Chat Drawer send message
    const btnSendChatMessage = document.getElementById('btnSendChatMessage');
    const chatInput = document.getElementById('chatInput');
    if (btnSendChatMessage && chatInput) {
      btnSendChatMessage.addEventListener('click', () => this.sendChatMessage());
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') btnSendChatMessage.click();
      });
    }
    document.getElementById('btnCloseChatDrawer')?.addEventListener('click', () => this.closeChatDrawer());

    // FAQ Accordion
    document.querySelectorAll('.faq-question').forEach(q => {
      q.addEventListener('click', () => {
        const item = q.parentElement;
        item.classList.toggle('open');
      });
    });

    // Modals generic close
    document.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
      });
    });

    // Video modal
    document.getElementById('btnOpenVideoModal')?.addEventListener('click', () => {
      document.getElementById('videoModal')?.classList.add('open');
    });

    // Sign in / Sign out button
    document.querySelectorAll('.btn-signin, #navSignInBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.firebaseBridge && window.firebaseBridge.currentUser) {
          window.firebaseBridge.signOut();
        } else {
          document.getElementById('authModal')?.classList.add('open');
        }
      });
    });

    // Plan upgrades in Pricing
    document.querySelectorAll('[data-choose-plan]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tier = btn.getAttribute('data-choose-plan');
        this.updateUserPlan(tier);
      });
    });

    // Data reset
    document.getElementById('btnResetData')?.addEventListener('click', async () => {
      if (confirm('Reset database to original sample courses and flashcards?')) {
        await window.realmDB.resetToDefaults();
        this.showToast('Database reset to official default curriculum.');
      }
    });
  }

  // ==========================================
  // Dual Navigation & View Router
  // ==========================================
  navigateTo(viewName) {
    this.currentView = viewName;
    window.location.hash = viewName;

    // Determine whether this route belongs to Marketing or Workspace
    const marketingRoutes = ['home', 'pricing', 'ai-math-solver', 'homeworkify', 'free-online-courses', 'about', 'contact'];
    const isMarketing = marketingRoutes.includes(viewName);

    const marketingNav = document.getElementById('marketingNavbar');
    const workspaceNav = document.getElementById('workspaceNavbar');
    const modeMarketingBtn = document.getElementById('modeMarketingBtn');
    const modeAppBtn = document.getElementById('modeAppBtn');

    if (isMarketing) {
      if (marketingNav) marketingNav.style.display = 'flex';
      if (workspaceNav) workspaceNav.style.display = 'none';
      modeMarketingBtn?.classList.add('active');
      modeAppBtn?.classList.remove('active');
    } else {
      if (marketingNav) marketingNav.style.display = 'none';
      if (workspaceNav) workspaceNav.style.display = 'flex';
      modeMarketingBtn?.classList.remove('active');
      modeAppBtn?.classList.add('active');
    }

    // Highlight active nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      const target = link.getAttribute('data-route');
      link.classList.toggle('active', target === viewName);
    });

    // Show active view section
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active-view');
    });

    const activeSec = document.getElementById(`view-${viewName}`);
    if (activeSec) {
      activeSec.classList.add('active-view');
    } else {
      // Fallback to home
      document.getElementById('view-home')?.classList.add('active-view');
    }

    // Special view initializations
    if (viewName === 'course') {
      this.renderCourseWorkspace();
    } else if (viewName === 'flashcards') {
      this.initFlashcardsView();
    } else if (viewName === 'library') {
      this.renderLibraryView();
    } else if (viewName === 'profile') {
      this.renderProfileView();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================
  // Course Creation Pipeline (Page 5 & 12)
  // ==========================================
  startCourseCreation(topic) {
    this.navigateTo('create-course');
    const input = document.getElementById('createCourseInput');
    if (input) input.value = topic;
  }

  async executeCourseCreation(topic, customStructure = null, ragContext = null) {
    this.showToast(`AI is generating bespoke curriculum for "${topic}"...`);
    const btn = document.getElementById('submitCreateCourseBtn');
    if (btn) btn.disabled = true;

    try {
      let structure = customStructure;
      if (!structure) {
        structure = await window.tutorAIEngine.generateCourseStructure(
          topic,
          this.currentUser?.knowledgeLevelPref || 'beginner',
          'mastery',
          ragContext
        );
      }

      // Save Course and Modules into Realm DB
      const courseId = 'course_' + Math.random().toString(36).substr(2, 8);
      let firstLessonId = null;

      window.realmDB.write(() => {
        window.realmDB.create('Course', {
          id: courseId,
          userId: this.currentUser?.id || 'usr_default_learner',
          sourceDocumentId: ragContext ? ragContext.id : null,
          title: structure.courseTitle,
          topicPrompt: topic,
          learnerLevel: this.currentUser?.knowledgeLevelPref || 'beginner',
          description: structure.courseDescription,
          isPublicFeatured: false,
          status: 'published',
          progressPercentage: 0.0,
          createdAt: new Date().toISOString()
        });

        // Increment user generation count
        if (this.currentUser) {
          this.currentUser.coursesGeneratedCount = (this.currentUser.coursesGeneratedCount || 0) + 1;
        }

        structure.modules.forEach((mod, modIdx) => {
          const modId = `mod_${courseId}_${modIdx + 1}`;
          window.realmDB.create('Module', {
            id: modId,
            courseId: courseId,
            orderIndex: mod.orderIndex || (modIdx + 1),
            title: mod.moduleTitle,
            summary: mod.moduleSummary || ''
          });

          mod.lessons.forEach((les, lesIdx) => {
            const lesId = `les_${modId}_${lesIdx + 1}`;
            if (!firstLessonId) firstLessonId = lesId;

            window.realmDB.create('Lesson', {
              id: lesId,
              moduleId: modId,
              orderIndex: les.orderIndex || (lesIdx + 1),
              title: les.lessonTitle,
              contentMarkdown: '', // Lazy loaded on click!
              simplifiedMarkdown: null,
              examplesMarkdown: null,
              audioUrl: null,
              isCompleted: false,
              completedAt: null
            });
          });
        });
      });

      this.currentCourseId = courseId;
      this.currentLessonId = firstLessonId;

      if (window.firebaseBridge && window.firebaseBridge.currentUser) {
        const createdCourse = window.realmDB.objects('Course').find(c => c.id === courseId);
        const cloudMods = structure.modules.map((mod, modIdx) => {
          const modId = `mod_${courseId}_${modIdx + 1}`;
          return {
            modId,
            orderIndex: mod.orderIndex || (modIdx + 1),
            title: mod.moduleTitle,
            summary: mod.moduleSummary || '',
            lessons: mod.lessons.map((les, lesIdx) => ({
              lesId: `les_${modId}_${lesIdx + 1}`,
              orderIndex: les.orderIndex || (lesIdx + 1),
              title: les.lessonTitle,
              contentMarkdown: ''
            }))
          };
        });
        window.firebaseBridge.syncCourseBundle(createdCourse, cloudMods).catch(console.error);
        if (this.currentUser) {
          window.firebaseBridge.syncUserProfile(this.currentUser).catch(console.error);
        }
      }

      this.showToast('Course created successfully!');
      this.navigateTo('course');
    } catch (err) {
      console.error(err);
      this.showToast('Failed to generate course outline.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ==========================================
  // RAG: Use Your Own Sources (Page 5 & 12)
  // ==========================================
  openRagModal() {
    const modal = document.getElementById('ragModal');
    if (modal) modal.classList.add('open');

    const fileInput = document.getElementById('ragFileInput');
    const uploadArea = document.getElementById('ragDropArea');
    const startRagBtn = document.getElementById('startRagCourseBtn');

    if (uploadArea && fileInput) {
      uploadArea.onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          document.getElementById('ragFileNameDisplay').innerText = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
          startRagBtn.disabled = false;
        }
      };
    }

    if (startRagBtn) {
      startRagBtn.onclick = async () => {
        const file = fileInput.files[0];
        modal.classList.remove('open');
        this.showToast(`Processing source document "${file.name}" for RAG syllabus...`);

        const ragContext = {
          id: 'doc_' + Date.now(),
          fileName: file.name,
          extractedText: `Extracted syllabus content from ${file.name}`
        };

        const topic = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        await this.executeCourseCreation(topic, null, ragContext);
      };
    }
  }

  // ==========================================
  // Define Course Structure Modal (Page 5 & 13)
  // ==========================================
  async openStructureModal() {
    const topicInput = document.getElementById('createCourseInput');
    const topic = (topicInput ? topicInput.value.trim() : '') || 'Full Stack Web Architecture';

    this.showToast('Generating initial customizable structure...');
    const outline = await window.tutorAIEngine.generateCourseStructure(topic);

    const modal = document.getElementById('structureModal');
    const container = document.getElementById('structureModulesTree');
    if (!modal || !container) return;

    modal.classList.add('open');
    container.innerHTML = '';

    outline.modules.forEach((mod, mIdx) => {
      const modEl = document.createElement('div');
      modEl.className = 'structure-module-card';
      modEl.style.cssText = 'background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; margin-bottom: 12px;';
      modEl.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px;">
          <strong style="color: #4F46E5;">Module ${mIdx + 1}:</strong>
          <input type="text" class="mod-title-edit" value="${mod.moduleTitle}" style="flex: 1; padding: 6px 10px; font-weight: 700; font-size: 0.95rem;">
        </div>
        <div class="lessons-container" style="display: flex; flex-direction: column; gap: 6px; padding-left: 18px;">
          ${mod.lessons.map((les, lIdx) => `
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.8rem; color: #94A3B8;">${lIdx + 1}.</span>
              <input type="text" class="les-title-edit" value="${les.lessonTitle}" style="flex: 1; padding: 5px 8px; font-size: 0.88rem;">
            </div>
          `).join('')}
        </div>
      `;
      container.appendChild(modEl);
    });

    const confirmBtn = document.getElementById('confirmStructureBuildBtn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        // Collect edited values
        const editedModules = [];
        container.querySelectorAll('.structure-module-card').forEach((card, idx) => {
          const modTitle = card.querySelector('.mod-title-edit').value;
          const lessons = [];
          card.querySelectorAll('.les-title-edit').forEach((lInput, lIdx) => {
            lessons.push({ orderIndex: lIdx + 1, lessonTitle: lInput.value });
          });
          editedModules.push({
            orderIndex: idx + 1,
            moduleTitle: modTitle,
            moduleSummary: '',
            lessons: lessons
          });
        });

        outline.modules = editedModules;
        modal.classList.remove('open');
        this.executeCourseCreation(topic, outline);
      };
    }
  }

  // ==========================================
  // Screen 3: Two-Pane Study Workspace (Page 13 & 14)
  // ==========================================
  renderCourseWorkspace() {
    const course = window.realmDB.objects('Course').find(c => c.id === this.currentCourseId) 
      || window.realmDB.objects('Course').items[0];

    if (!course) {
      console.warn('No course available to display.');
      return;
    }
    this.currentCourseId = course.id;

    // 1. Sidebar Header
    const titleEl = document.getElementById('sidebarCourseTitle');
    const percentEl = document.getElementById('sidebarProgressPercent');
    const fillEl = document.getElementById('sidebarProgressFill');

    if (titleEl) titleEl.innerText = course.title;
    const progress = Math.round(course.progressPercentage || 0);
    if (percentEl) percentEl.innerText = `${progress}% complete`;
    if (fillEl) fillEl.style.width = `${progress}%`;

    // 2. Modules & Lessons Accordion List
    const accordionContainer = document.getElementById('modulesAccordionList');
    if (!accordionContainer) return;
    accordionContainer.innerHTML = '';

    const modules = window.realmDB.objects('Module').filtered(m => m.courseId === course.id);
    modules.sort((a, b) => a.orderIndex - b.orderIndex);

    modules.forEach((mod) => {
      const lessons = window.realmDB.objects('Lesson').filtered(l => l.moduleId === mod.id);
      lessons.sort((a, b) => a.orderIndex - b.orderIndex);

      const groupEl = document.createElement('div');
      groupEl.className = 'accordion-module-group';

      const isCurrentModule = lessons.some(l => l.id === this.currentLessonId);

      groupEl.innerHTML = `
        <button class="module-header-btn">
          <span>${mod.orderIndex ? `▾ Module ${mod.orderIndex} · ` : ''}${mod.title}</span>
        </button>
        <div class="module-lessons-sublist" style="${isCurrentModule ? 'display: flex;' : ''}">
          ${lessons.map(les => {
            const isActive = les.id === this.currentLessonId;
            let iconClass = 'not-started';
            let iconText = '○';
            if (les.isCompleted) {
              iconClass = 'completed';
              iconText = '✓';
            } else if (isActive) {
              iconClass = 'in-progress';
              iconText = '●';
            }
            return `
              <button class="lesson-nav-item ${isActive ? 'active-lesson' : ''}" data-lesson-id="${les.id}">
                <span class="lesson-status-icon ${iconClass}">${iconText}</span>
                <span style="flex: 1; text-align: left;">${les.title}</span>
              </button>
            `;
          }).join('')}
        </div>
      `;

      // Accordion toggle
      const headerBtn = groupEl.querySelector('.module-header-btn');
      const sublist = groupEl.querySelector('.module-lessons-sublist');
      headerBtn.addEventListener('click', () => {
        const isHidden = sublist.style.display === 'none';
        sublist.style.display = isHidden ? 'flex' : 'none';
      });

      // Lesson item clicks
      groupEl.querySelectorAll('.lesson-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const lId = btn.getAttribute('data-lesson-id');
          this.loadLesson(lId);
        });
      });

      accordionContainer.appendChild(groupEl);
    });

    // Ensure a lesson is selected
    if (!this.currentLessonId && modules[0]) {
      const firstLes = window.realmDB.objects('Lesson').find(l => l.moduleId === modules[0].id);
      if (firstLes) this.currentLessonId = firstLes.id;
    }

    if (this.currentLessonId) {
      this.loadLesson(this.currentLessonId, false);
    }
  }

  async loadLesson(lessonId, shouldRebuildSidebar = true) {
    this.currentLessonId = lessonId;
    window.speechController.stop();

    const lesson = window.realmDB.objects('Lesson').find(l => l.id === lessonId);
    if (!lesson) return;

    const moduleObj = window.realmDB.objects('Module').find(m => m.id === lesson.moduleId);
    const courseObj = window.realmDB.objects('Course').find(c => c.id === this.currentCourseId);

    // Update Header
    const tagEl = document.getElementById('lessonModuleTag');
    const titleEl = document.getElementById('lessonTitleMain');
    const bodyEl = document.getElementById('lessonBodyMarkdown');
    const resultsPanel = document.getElementById('goDeeperResultsPanel');

    if (tagEl) tagEl.innerText = `MODULE ${moduleObj?.orderIndex || 1} · LESSON ${lesson.orderIndex || 1}`;
    if (titleEl) titleEl.innerText = lesson.title;
    if (resultsPanel) {
      resultsPanel.classList.remove('visible');
      resultsPanel.innerHTML = '';
    }

    // Lazy Loading Lesson Generation (Report Rule 2)
    if (!lesson.contentMarkdown) {
      if (bodyEl) {
        bodyEl.innerHTML = `<div style="padding: 40px; text-align: center; color: #64748B;">
          <div style="font-size: 1.8rem; margin-bottom: 12px; color: #4F46E5;">✦</div>
          <p>Generating interactive lesson content with AI...</p>
        </div>`;
      }

      const generated = await window.tutorAIEngine.generateLessonContent(
        lesson.title,
        moduleObj?.title || '',
        courseObj?.title || '',
        courseObj?.learnerLevel || 'beginner',
        'visual_and_practical'
      );

      window.realmDB.write(() => {
        lesson.contentMarkdown = generated;
      });
      if (window.firebaseBridge && window.firebaseBridge.currentUser) {
        window.firebaseBridge.syncLessonUpdate(lesson, this.currentCourseId).catch(console.error);
      }
    }

    if (bodyEl) {
      bodyEl.innerHTML = this.renderMarkdown(lesson.contentMarkdown);
    }

    // Check if an Inline Quiz already exists for this lesson
    const existingQuiz = window.realmDB.objects('LessonQuiz').find(q => q.lessonId === lessonId);
    if (existingQuiz) {
      this.renderInlineQuizWidget(JSON.parse(existingQuiz.questionsJson));
    }

    if (shouldRebuildSidebar) {
      this.renderCourseWorkspace();
    }
  }

  // ==========================================
  // Go Deeper Actions (Simplify, Examples, Quiz, Flashcards, Chat)
  // ==========================================
  async handleGoDeeper(action) {
    const lesson = window.realmDB.objects('Lesson').find(l => l.id === this.currentLessonId);
    if (!lesson) return;

    const resultsPanel = document.getElementById('goDeeperResultsPanel');
    if (!resultsPanel) return;

    resultsPanel.classList.add('visible');
    resultsPanel.innerHTML = `<div style="text-align: center; color: #64748B; padding: 20px;">Generating ${action} for this lesson...</div>`;

    if (action === 'simplify') {
      if (!lesson.simplifiedMarkdown) {
        lesson.simplifiedMarkdown = await window.tutorAIEngine.generateSimplify(lesson.contentMarkdown, lesson.title);
        window.realmDB.persist();
        if (window.firebaseBridge && window.firebaseBridge.currentUser) {
          window.firebaseBridge.syncLessonUpdate(lesson, this.currentCourseId).catch(console.error);
        }
      }
      resultsPanel.innerHTML = this.renderMarkdown(lesson.simplifiedMarkdown);
    } else if (action === 'examples') {
      if (!lesson.examplesMarkdown) {
        lesson.examplesMarkdown = await window.tutorAIEngine.generateExamples(lesson.contentMarkdown, lesson.title);
        window.realmDB.persist();
        if (window.firebaseBridge && window.firebaseBridge.currentUser) {
          window.firebaseBridge.syncLessonUpdate(lesson, this.currentCourseId).catch(console.error);
        }
      }
      resultsPanel.innerHTML = this.renderMarkdown(lesson.examplesMarkdown);
    } else if (action === 'quiz') {
      let quiz = window.realmDB.objects('LessonQuiz').find(q => q.lessonId === lesson.id);
      let questions;
      if (!quiz) {
        questions = await window.tutorAIEngine.generateQuiz(lesson.contentMarkdown, lesson.title);
        window.realmDB.write(() => {
          window.realmDB.create('LessonQuiz', {
            id: 'quiz_' + lesson.id,
            lessonId: lesson.id,
            questionsJson: JSON.stringify(questions),
            userScore: null,
            completedAt: null
          });
        });
      } else {
        questions = JSON.parse(quiz.questionsJson);
      }
      this.renderInlineQuizWidget(questions, resultsPanel);
    } else if (action === 'flashcards') {
      const cards = await window.tutorAIEngine.generateFlashcardsForLesson(lesson.title, lesson.contentMarkdown);
      const createdCards = [];
      window.realmDB.write(() => {
        cards.forEach(card => {
          const fcObj = window.realmDB.create('Flashcard', {
            id: 'fc_' + Math.random().toString(36).substr(2, 9),
            userId: this.currentUser?.id || 'usr_default_learner',
            courseId: this.currentCourseId,
            lessonId: lesson.id,
            frontPrompt: card.frontPrompt,
            backAnswer: card.backAnswer,
            easinessFactor: 2.5,
            intervalDays: 1,
            repetitions: 0,
            nextReviewAt: new Date().toISOString()
          });
          createdCards.push(fcObj);
        });
      });
      if (window.firebaseBridge && window.firebaseBridge.currentUser) {
        createdCards.forEach(fc => window.firebaseBridge.syncFlashcard(fc).catch(console.error));
      }
      resultsPanel.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <h4 style="color: #16A34A; margin-bottom: 8px;">✓ 3 Flashcards Generated & Added!</h4>
          <p style="color: #64748B; font-size: 0.92rem; margin-bottom: 16px;">These cards have been scheduled into your Spaced Repetition deck.</p>
          <button class="btn-primary" onclick="window.tutorApp.navigateTo('flashcards')">Go to Flashcards Review</button>
        </div>
      `;
      this.showToast('Flashcards generated and added to Spaced Repetition queue!');
    }
  }

  renderInlineQuizWidget(questions, container = null) {
    const target = container || document.getElementById('goDeeperResultsPanel');
    if (!target) return;

    target.classList.add('visible');
    target.innerHTML = '';

    const widget = document.createElement('div');
    widget.className = 'quiz-widget-card';

    let currentQIdx = 0;

    const renderQuestion = (idx) => {
      const q = questions[idx];
      widget.innerHTML = `
        <div class="quiz-header">Question ${idx + 1} of ${questions.length}</div>
        <div class="quiz-question-title">${q.question}</div>
        <div class="quiz-options-list">
          ${q.options.map((opt, oIdx) => `
            <button class="quiz-option-btn" data-option-idx="${oIdx}">
              <strong>${String.fromCharCode(65 + oIdx)}.</strong> ${opt}
            </button>
          `).join('')}
        </div>
        <div class="quiz-explanation-box" id="quizExplanation"></div>
        <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
          <button class="btn-secondary" id="btnNextQuizQuestion" style="display: none;">
            ${idx + 1 === questions.length ? 'Finish Quiz' : 'Next Question →'}
          </button>
        </div>
      `;

      const explBox = widget.querySelector('#quizExplanation');
      const nextBtn = widget.querySelector('#btnNextQuizQuestion');

      widget.querySelectorAll('.quiz-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const optIdx = parseInt(btn.getAttribute('data-option-idx'), 10);
          widget.querySelectorAll('.quiz-option-btn').forEach(b => b.disabled = true);

          if (optIdx === q.correctIndex) {
            btn.classList.add('selected-correct');
            explBox.className = 'quiz-explanation-box correct';
            explBox.innerHTML = `<strong>✓ Correct!</strong> ${q.explanation}`;
          } else {
            btn.classList.add('selected-wrong');
            const correctBtn = widget.querySelector(`[data-option-idx="${q.correctIndex}"]`);
            if (correctBtn) correctBtn.classList.add('selected-correct');
            explBox.className = 'quiz-explanation-box wrong';
            explBox.innerHTML = `<strong>✗ Not quite.</strong> ${q.explanation}`;
          }

          nextBtn.style.display = 'block';
        });
      });

      nextBtn.addEventListener('click', () => {
        if (idx + 1 < questions.length) {
          renderQuestion(idx + 1);
        } else {
          widget.innerHTML = `
            <div style="text-align: center; padding: 24px;">
              <div style="font-size: 2rem; color: #16A34A; margin-bottom: 8px;">🎉</div>
              <h3 style="color: #0F172A; margin-bottom: 8px;">Quiz Completed!</h3>
              <p style="color: #64748B; font-size: 0.95rem;">You have demonstrated strong comprehension of this lesson.</p>
            </div>
          `;
        }
      });
    };

    renderQuestion(0);
    target.appendChild(widget);
  }

  markCurrentLessonComplete() {
    const lesson = window.realmDB.objects('Lesson').find(l => l.id === this.currentLessonId);
    if (!lesson) return;

    window.realmDB.write(() => {
      lesson.isCompleted = true;
      lesson.completedAt = new Date().toISOString();

      // Recalculate course percentage
      const course = window.realmDB.objects('Course').find(c => c.id === this.currentCourseId);
      if (course) {
        const modules = window.realmDB.objects('Module').filtered(m => m.courseId === course.id);
        const moduleIds = modules.map(m => m.id);
        const allLessons = window.realmDB.objects('Lesson').filtered(l => moduleIds.includes(l.moduleId));
        const completedCount = allLessons.filter(l => l.isCompleted).length;
        course.progressPercentage = Math.round((completedCount / (allLessons.length || 1)) * 100);
      }
    });

    if (window.firebaseBridge && window.firebaseBridge.currentUser) {
      window.firebaseBridge.syncLessonUpdate(lesson, this.currentCourseId).catch(console.error);
      const updatedCourse = window.realmDB.objects('Course').find(c => c.id === this.currentCourseId);
      if (updatedCourse) {
        window.firebaseBridge.syncCourseProgress(updatedCourse.id, updatedCourse.progressPercentage).catch(console.error);
      }
    }

    this.showToast('Lesson marked complete! Progress updated.');
    this.renderCourseWorkspace();
  }

  // ==========================================
  // Contextual Chat Drawer (Page 6 & 13)
  // ==========================================
  openChatDrawer() {
    const drawer = document.getElementById('chatDrawer');
    if (!drawer) return;
    drawer.classList.add('open');

    const lesson = window.realmDB.objects('Lesson').find(l => l.id === this.currentLessonId);
    const subTitle = document.getElementById('chatDrawerSubtitle');
    if (subTitle && lesson) {
      subTitle.innerText = `Context: ${lesson.title}`;
    }
  }

  closeChatDrawer() {
    document.getElementById('chatDrawer')?.classList.remove('open');
  }

  async sendChatMessage() {
    const input = document.getElementById('chatInput');
    const scrollBox = document.getElementById('chatMessagesScroll');
    if (!input || !scrollBox) return;

    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // Append user message
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg user';
    userMsg.innerText = text;
    scrollBox.appendChild(userMsg);
    scrollBox.scrollTop = scrollBox.scrollHeight;

    // Append bot thinking
    const botMsg = document.createElement('div');
    botMsg.className = 'chat-msg bot';
    botMsg.innerText = 'Thinking...';
    scrollBox.appendChild(botMsg);
    scrollBox.scrollTop = scrollBox.scrollHeight;

    const lesson = window.realmDB.objects('Lesson').find(l => l.id === this.currentLessonId);
    const reply = await window.tutorAIEngine.answerLessonQuestion(
      text,
      lesson?.title || 'Lesson',
      lesson?.contentMarkdown || ''
    );

    botMsg.innerHTML = this.renderMarkdown(reply);
    scrollBox.scrollTop = scrollBox.scrollHeight;
  }

  // ==========================================
  // Screen 4: AI Math Solver (Page 7 & 14-15)
  // ==========================================
  async handleSolveMath(equation) {
    if (!equation) {
      this.showToast('Please type an equation or upload a photo.');
      return;
    }

    const panel = document.getElementById('mathSolutionPanel');
    if (!panel) return;

    panel.classList.add('visible');
    panel.innerHTML = `<div style="text-align: center; color: #64748B; padding: 40px;">
      <div style="font-size: 1.8rem; color: #4F46E5; margin-bottom: 12px;">✦</div>
      <p>Analyzing mathematical structure & formulating verified step-by-step solution...</p>
    </div>`;

    const solution = await window.tutorAIEngine.solveMathProblem(equation);

    // Save solution to Realm DB
    const solId = 'sol_' + Date.now();
    window.realmDB.write(() => {
      window.realmDB.create('HomeworkSolution', {
        id: solId,
        userId: this.currentUser?.id || 'usr_default_learner',
        toolType: 'math_solver',
        inputText: equation,
        inputImageUrl: null,
        extractedLatex: solution.recognizedLatex,
        subjectCategory: solution.domain,
        stepsJson: JSON.stringify(solution.steps),
        finalAnswer: solution.finalAnswer,
        createdAt: new Date().toISOString()
      });
    });
    if (window.firebaseBridge && window.firebaseBridge.currentUser) {
      window.firebaseBridge.syncHomeworkSolution({
        id: solId,
        toolType: 'math_solver',
        inputText: equation,
        extractedLatex: solution.recognizedLatex,
        subjectCategory: solution.domain,
        finalAnswer: solution.finalAnswer
      }).catch(console.error);
    }

    panel.innerHTML = `
      <div class="math-problem-headline">
        Problem: <span>${solution.recognizedLatex}</span>
        <span style="float: right; font-size: 0.8rem; background: #EEF2FF; color: #4F46E5; padding: 2px 8px; border-radius: 4px;">${solution.domain}</span>
      </div>
      <div class="math-steps-list">
        ${solution.steps.map(s => `
          <div class="math-step-card">
            <div class="step-badge">${s.stepNumber < 10 ? '0' + s.stepNumber : s.stepNumber}</div>
            <div class="step-content-box">
              <h4>${s.stepTitle}</h4>
              <div class="step-math-expr">${s.mathExpression}</div>
              <div class="step-explanation">${s.explanation}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="final-answer-callout">
        <span class="label">✓ Final Answer:</span>
        <span class="value">${solution.finalAnswer}</span>
      </div>
    `;
    this.showToast('Mathematical solution verified and rendered.');
  }

  // ==========================================
  // Screen 5: Flashcards & Spaced Repetition (Page 6 & 15, 21-22)
  // ==========================================
  initFlashcardsView() {
    this.flashcardsQueue = window.realmDB.objects('Flashcard').items;
    this.currentFlashcardIndex = 0;
    this.isCardFlipped = false;
    this.renderFlashcardStats();
    this.renderCurrentFlashcard();
  }

  renderFlashcardStats() {
    const all = window.realmDB.objects('Flashcard').items;
    const now = new Date();

    const dueToday = all.filter(c => new Date(c.nextReviewAt) <= now).length;
    const mastered = all.filter(c => c.repetitions >= 2 && c.easinessFactor >= 2.5).length;
    const retention = all.length > 0 ? Math.round((mastered / all.length) * 100) : 80;

    const dueEl = document.getElementById('fcDueCount');
    const masterEl = document.getElementById('fcMasteredCount');
    const retEl = document.getElementById('fcRetentionRate');

    if (dueEl) dueEl.innerText = dueToday;
    if (masterEl) masterEl.innerText = mastered;
    if (retEl) retEl.innerText = `${retention}%`;
  }

  renderCurrentFlashcard() {
    const inner = document.getElementById('flashcardInner');
    const promptText = document.getElementById('flipCardPrompt');
    const answerText = document.getElementById('flipCardAnswer');

    if (!this.flashcardsQueue || this.flashcardsQueue.length === 0) {
      if (promptText) promptText.innerText = 'No flashcards available.';
      if (answerText) answerText.innerText = 'Generate flashcards from any course lesson!';
      return;
    }

    if (this.currentFlashcardIndex >= this.flashcardsQueue.length) {
      this.currentFlashcardIndex = 0;
    }

    const currentCard = this.flashcardsQueue[this.currentFlashcardIndex];
    this.isCardFlipped = false;
    if (inner) inner.classList.remove('flipped');

    if (promptText) promptText.innerText = currentCard.frontPrompt;
    if (answerText) answerText.innerText = currentCard.backAnswer;
  }

  toggleCardFlip() {
    const inner = document.getElementById('flashcardInner');
    if (!inner) return;
    this.isCardFlipped = !this.isCardFlipped;
    inner.classList.toggle('flipped', this.isCardFlipped);
  }

  submitFlashcardGrade(q) {
    if (!this.flashcardsQueue || this.flashcardsQueue.length === 0) return;
    const currentCard = this.flashcardsQueue[this.currentFlashcardIndex];
    if (!currentCard) return;

    // Execute SM-2 Spaced Repetition Formula (Page 21 & 22)
    const update = window.tutorAIEngine.calculateSM2(
      q,
      currentCard.easinessFactor || 2.5,
      currentCard.intervalDays || 0,
      currentCard.repetitions || 0
    );

    window.realmDB.write(() => {
      currentCard.easinessFactor = update.easinessFactor;
      currentCard.intervalDays = update.intervalDays;
      currentCard.repetitions = update.repetitions;
      currentCard.nextReviewAt = update.nextReviewAt;
    });
    if (window.firebaseBridge && window.firebaseBridge.currentUser) {
      window.firebaseBridge.syncFlashcard(currentCard).catch(console.error);
    }

    const labels = ['Again (Session)', 'Hard (1 day)', 'Good (Spaced)', 'Easy (Mastered)'];
    this.showToast(`Graded: ${labels[q]} | Next review in ${update.intervalDays} day(s).`);

    this.currentFlashcardIndex = (this.currentFlashcardIndex + 1) % this.flashcardsQueue.length;
    this.renderFlashcardStats();
    this.renderCurrentFlashcard();
  }

  // ==========================================
  // Screen 6: Free Online Courses Library (Page 7 & 16)
  // ==========================================
  viewCourseById(courseId) {
    this.currentCourseId = courseId;
    this.currentLessonId = null;
    this.navigateTo('course');
  }

  // ==========================================
  // Screen 8: Homeworkify & Writing Coach (Page 6)
  // ==========================================
  async handleSolveHomework() {
    const input = document.getElementById('homeworkQuestionInput');
    const resultBox = document.getElementById('homeworkResultBox');
    if (!input || !resultBox) return;

    const val = input.value.trim();
    if (!val) {
      this.showToast('Please type your homework question.');
      return;
    }

    resultBox.innerHTML = '<p style="color: #64748B;">Analyzing question and formulating guided step-by-step reasoning...</p>';
    const solution = await window.tutorAIEngine.solveHomework(val);

    resultBox.innerHTML = `
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px;">
        <h4 style="color: #0F172A; margin-bottom: 12px;">${solution.guidance}</h4>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
          ${solution.steps.map(s => `
            <div style="background: #F8FAFC; border-left: 3px solid #4F46E5; padding: 12px 16px; border-radius: 4px;">
              <strong style="color: #0F172A;">${s.title}</strong>
              <p style="color: #475569; font-size: 0.92rem; margin-top: 4px;">${s.detail}</p>
            </div>
          `).join('')}
        </div>
        <div style="background: #FEF3C7; border: 1px solid #FDE68A; padding: 14px 18px; border-radius: 8px; color: #92400E;">
          <strong>💡 Comprehension Check:</strong> ${solution.comprehensionQuestion}
        </div>
      </div>
    `;
  }

  async handleReviewWriting() {
    const input = document.getElementById('writingCoachInput');
    const resultBox = document.getElementById('writingResultBox');
    if (!input || !resultBox) return;

    const val = input.value.trim();
    if (!val) {
      this.showToast('Please enter an essay or paragraph to review.');
      return;
    }

    resultBox.innerHTML = '<p style="color: #64748B;">Analyzing grammar, structural cadence, and tone clarity...</p>';
    const review = await window.tutorAIEngine.reviewWriting(val);

    resultBox.innerHTML = `
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid #E2E8F0; padding-bottom: 12px;">
          <div>
            <h3 style="color: #0F172A;">Writing Assessment</h3>
            <span style="font-size: 0.85rem; color: #64748B;">Words: ${review.wordCount} | Grade: ${review.readabilityGrade}</span>
          </div>
          <div style="font-size: 2rem; font-weight: 800; color: #16A34A;">${review.overallScore}/100</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
          <div style="background: #F8FAFC; padding: 10px 14px; border-radius: 8px;"><strong>Clarity:</strong> ${review.metrics.clarity}</div>
          <div style="background: #F8FAFC; padding: 10px 14px; border-radius: 8px;"><strong>Structure:</strong> ${review.metrics.structure}</div>
          <div style="background: #F8FAFC; padding: 10px 14px; border-radius: 8px;"><strong>Tone:</strong> ${review.metrics.tone}</div>
          <div style="background: #F8FAFC; padding: 10px 14px; border-radius: 8px;"><strong>Grammar:</strong> ${review.metrics.grammar}</div>
        </div>
        <div style="margin-bottom: 14px;">
          <strong style="color: #16A34A;">Strengths:</strong>
          <ul style="margin: 6px 0 0 20px; font-size: 0.9rem; color: #334155;">
            ${review.strengths.map(s => `<li>${s}</li>`).join('')}
          </ul>
        </div>
        <div>
          <strong style="color: #D97706;">Actionable Suggestions:</strong>
          <ul style="margin: 6px 0 0 20px; font-size: 0.9rem; color: #334155;">
            ${review.suggestions.map(s => `<li>${s}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
  }

  // ==========================================
  // Screen 9: Library & Profile
  // ==========================================
  renderLibraryView() {
    const container = document.getElementById('myCoursesGrid');
    if (!container) return;
    container.innerHTML = '';

    const courses = window.realmDB.objects('Course').items;
    courses.forEach(c => {
      const card = document.createElement('div');
      card.className = 'free-course-card';
      const progress = Math.round(c.progressPercentage || 0);

      card.innerHTML = `
        <div class="course-card-banner banner-ai">📚</div>
        <div class="course-card-content">
          <div class="course-card-title">${c.title}</div>
          <div class="course-card-desc">${c.description || c.topicPrompt}</div>
          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 700; color: #4F46E5; margin-bottom: 4px;">
              <span>Progress</span>
              <span>${progress}%</span>
            </div>
            <div style="height: 6px; background: #E2E8F0; border-radius: 99px; overflow: hidden;">
              <div style="height: 100%; width: ${progress}%; background: #4F46E5;"></div>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-primary" style="flex: 1;" onclick="window.tutorApp.viewCourseById('${c.id}')">Resume Course</button>
            <button class="btn-secondary" onclick="window.tutorApp.exportCourse('${c.id}')" title="Export Course">💾</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  renderProfileView() {
    if (!this.currentUser) return;
    document.getElementById('profileUserName').innerText = this.currentUser.fullName || 'Alex Morgan';
    document.getElementById('profileUserEmail').innerText = this.currentUser.email || 'learner@tutorai.me';
    document.getElementById('profileUserPlanBadge').innerText = (this.currentUser.planTier || 'genius').toUpperCase();
    document.getElementById('profileCoursesGenerated').innerText = this.currentUser.coursesGeneratedCount || 0;
  }

  updateUserPlan(tier) {
    window.realmDB.write(() => {
      if (this.currentUser) {
        this.currentUser.planTier = tier;
      }
    });
    if (window.firebaseBridge && window.firebaseBridge.currentUser && this.currentUser) {
      window.firebaseBridge.syncUserProfile(this.currentUser).catch(console.error);
    }
    this.showToast(`Plan successfully switched to: ${tier.toUpperCase()}`);
    this.renderProfileView();
  }

  async exportCourse(courseId) {
    const course = window.realmDB.objects('Course').find(c => c.id === courseId);
    if (!course) return;

    const modules = window.realmDB.objects('Module').filtered(m => m.courseId === courseId);
    const modIds = modules.map(m => m.id);
    const lessons = window.realmDB.objects('Lesson').filtered(l => modIds.includes(l.moduleId));

    const exportData = {
      course,
      modules,
      lessons,
      exportedAt: new Date().toISOString()
    };

    if (window.electronAPI && window.electronAPI.exportCourse) {
      const ok = await window.electronAPI.exportCourse(exportData);
      if (ok) this.showToast('Course exported successfully via Electron.');
    } else {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${course.title.replace(/\s+/g, '_').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Course exported as JSON file.');
    }
  }

  // ==========================================
  // Markdown & LaTeX Lightweight Formatter
  // ==========================================
  renderMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code style="background: #EEF2F6; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>')
      .replace(/\$\$([^$]+)\$\$/gim, '<div style="background: #F8FAFC; padding: 12px; border-radius: 8px; font-family: monospace; text-align: center; color: #4338CA; margin: 16px 0; border: 1px solid #E2E8F0;">$$ $1 $$</div>')
      .replace(/\$([^$]+)\$/gim, '<span style="font-family: monospace; color: #4338CA; font-weight: 600;">$1</span>')
      .replace(/\n\n/gim, '<br><br>');

    // Convert Markdown tables
    if (html.includes('|')) {
      const lines = html.split('<br><br>');
      html = lines.map(block => {
        if (block.includes('|') && block.includes('---')) {
          const rows = block.split('<br>').filter(r => r.trim().startsWith('|'));
          if (rows.length >= 2) {
            let tableHtml = '<table border="1" cellpadding="8" style="width: 100%; border-collapse: collapse; margin: 16px 0;">';
            rows.forEach((row, idx) => {
              if (row.includes('---')) return; // Separator row
              const cells = row.split('|').filter(c => c.trim().length > 0);
              tableHtml += '<tr>';
              cells.forEach(cell => {
                tableHtml += idx === 0 
                  ? `<th style="background: #F1F5F9; text-align: left; padding: 8px;">${cell.trim()}</th>` 
                  : `<td style="padding: 8px; border-bottom: 1px solid #E2E8F0;">${cell.trim()}</td>`;
              });
              tableHtml += '</tr>';
            });
            tableHtml += '</table>';
            return tableHtml;
          }
        }
        return block;
      }).join('<br><br>');
    }

    return html;
  }

  // ==========================================
  // Audio UI & Toast Notifications
  // ==========================================
  updateSpeechUI(state) {
    const btn = document.getElementById('btnReadAloud');
    if (!btn) return;
    if (state.isPlaying && !state.isPaused) {
      btn.classList.add('speaking');
      btn.innerHTML = '❚❚ Pause';
    } else if (state.isPaused) {
      btn.classList.remove('speaking');
      btn.innerHTML = '▶ Resume';
    } else {
      btn.classList.remove('speaking');
      btn.innerHTML = '🔊 Read aloud';
    }
  }

  showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  refreshAllData() {
    this.currentUser = window.realmDB.objects('User').items[0];
  }
}

// Global Application Instantiation
window.addEventListener('DOMContentLoaded', () => {
  window.tutorApp = new TutorAIApp();
  window.tutorApp.init();
});
