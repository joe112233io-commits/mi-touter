/**
 * TutorAI Main Application Controller (Full-Stack Multi-Provider Edition)
 * Handles:
 *  - Multi-User Session & Workspace Isolation (Local Vault Accounts + Firebase Auth)
 *  - AI Providers & Encrypted API Key Management (OpenRouter, Gemini, OpenAI, Anthropic, Groq, DeepSeek, Custom REST)
 *  - Multi-Stage Real Course Creation Studio (Specification -> Blueprint Preview & Editor -> Fault-Tolerant Lesson Generation & Consistency Audit)
 *  - Two-Pane Study Workspace with Inline Lesson Editing, Single-Lesson Regeneration, Read Aloud, and Go Deeper Toolbar
 *  - Multimodal AI Math Solver (OCR), Homeworkify, Writing Coach, and SM-2 Spaced Repetition Flashcards
 */

class TutorAIApp {
  constructor() {
    this.currentView = 'home';
    this.currentCourseId = 'course_ai_foundations';
    this.currentLessonId = 'les_ai_1_1';
    this.courseViewMode = 'lesson'; // 'overview' | 'lesson'
    this.activeLessonTab = 'content'; // 'content' | 'simplify' | 'quiz' | 'examples'
    this.allSubsectionsExpanded = true;
    this.flashcardsQueue = [];
    this.currentFlashcardIndex = 0;
    this.isCardFlipped = false;
    this.currentUser = null;
    this.authMode = 'login'; // 'login' | 'register'

    // Course Creation Studio State
    this.activeRagContext = null; // { id, fileName, extractedText }
    this.currentBlueprint = null;
    this.activeGenerationCourseId = null;
    this.pendingCreateTopic = '';
    this.inlineOutlineModules = [
      {
        title: 'Module 1: Core Foundations & Principles',
        lessons: ['Understanding the Fundamentals', 'Key Concepts & Terminology', 'Historical Context & Evolution']
      },
      {
        title: 'Module 2: Practical Frameworks & Applications',
        lessons: ['Step-by-Step Methodology', 'Real-World Case Studies', 'Common Pitfalls & Best Practices']
      }
    ];
  }

  async init() {
    // 1. Initialize local Realm DB
    await window.realmDB.initialize();

    // 2. Restore active user session (Local account or default learner)
    this.restoreUserSession();

    // 3. Setup speech synthesis state listener
    if (window.speechController) {
      window.speechController.onStateChange = (state) => {
        this.updateSpeechUI(state);
      };
    }

    // 4. Bind UI event listeners
    this.bindEvents();

    // 4b. Render initial inline outline builder for Create Course
    this.renderInlineOutlineBuilder();

    // 5. Fetch user's AI providers from the backend vault
    await this.loadUserProviders();

    // 6. Initialize provider preset UI
    this.applyProviderPreset('openrouter');

    // 7. Reactive Realm DB subscription
    window.realmDB.subscribe(() => {
      this.refreshAllData();
    });

    // 8. Check URL hash or default to home
    const hash = window.location.hash.replace('#', '') || 'home';
    this.navigateTo(hash);
  }

  // ==========================================================================
  // 1. Multi-User Session Management & Isolation
  // ==========================================================================
  restoreUserSession() {
    try {
      const savedSession = localStorage.getItem('tutorai_active_user_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.id) {
          let dbUser = window.realmDB.objects('User').find(u => u.id === parsed.id);
          if (!dbUser) {
            window.realmDB.write(() => {
              dbUser = window.realmDB.create('User', {
                id: parsed.id,
                orgId: 'org_lumination_main',
                email: parsed.email || 'user@tutorai.me',
                fullName: parsed.fullName || 'Learner',
                role: 'learner',
                planTier: 'free',
                coursesGeneratedCount: 0,
                knowledgeLevelPref: 'intermediate',
                learningStylePref: 'visual_and_practical',
                createdAt: parsed.createdAt || new Date().toISOString()
              });
            });
          }
          this.currentUser = dbUser;
        }
      }
    } catch (e) {
      console.warn('Session restore notice:', e);
    }

    if (!this.currentUser) {
      this.currentUser = window.realmDB.objects('User').items[0];
    }

    window.tutorAIEngine.setUserId(this.currentUser?.id || 'usr_default_learner');
    this.updateAuthUI();
  }

  setActiveUser(userObj, isCloudUser = false) {
    if (!userObj || !userObj.id) return;
    let dbUser = window.realmDB.objects('User').find(u => u.id === userObj.id);
    window.realmDB.write(() => {
      dbUser = window.realmDB.create('User', {
        id: userObj.id,
        orgId: 'org_lumination_main',
        email: userObj.email || 'learner@tutorai.me',
        fullName: userObj.fullName || userObj.displayName || 'Learner',
        role: 'learner',
        planTier: 'free',
        coursesGeneratedCount: dbUser?.coursesGeneratedCount || 0,
        knowledgeLevelPref: dbUser?.knowledgeLevelPref || 'intermediate',
        learningStylePref: 'visual_and_practical',
        createdAt: dbUser?.createdAt || new Date().toISOString()
      });
    });

    this.currentUser = dbUser;
    if (!isCloudUser) {
      localStorage.setItem('tutorai_active_user_session', JSON.stringify({
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        createdAt: dbUser.createdAt
      }));
    }

    window.tutorAIEngine.setUserId(dbUser.id);
    this.updateAuthUI();
    this.loadUserProviders();

    if (this.currentView === 'library') this.renderLibraryView();
    if (this.currentView === 'profile') this.renderProfileView();
    if (this.currentView === 'flashcards') this.initFlashcardsView();
  }

  onFirebaseUserChanged(fbUser) {
    if (fbUser) {
      this.setActiveUser({
        id: fbUser.uid,
        email: fbUser.email || 'cloud@tutorai.me',
        fullName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Cloud Learner')
      }, true);
    }
  }

  updateAuthUI() {
    const isCustomAccount = this.currentUser && this.currentUser.id !== 'usr_default_learner';
    const displayLabel = isCustomAccount
      ? `👤 ${(this.currentUser.fullName || 'Account').split(' ')[0]}`
      : 'SIGN IN';

    document.querySelectorAll('.btn-signin, #navSignInBtn, #workspaceSignInBtn, #mobileSignInBtn').forEach(btn => {
      btn.textContent = displayLabel;
    });

    const signedInFooter = document.getElementById('authSignedInFooter');
    if (signedInFooter) {
      signedInFooter.style.display = isCustomAccount ? 'block' : 'none';
    }
  }

  switchAuthTab(mode) {
    this.authMode = mode === 'register' ? 'register' : 'login';
    const tabLogin = document.getElementById('tabBtnLogin');
    const tabRegister = document.getElementById('tabBtnRegister');
    const nameGroup = document.getElementById('authFullNameGroup');
    const submitBtn = document.getElementById('btnSubmitLocalAuth');
    const errBox = document.getElementById('authErrorMsg');

    if (errBox) errBox.style.display = 'none';
    if (this.authMode === 'register') {
      tabLogin?.classList.remove('active');
      tabRegister?.classList.add('active');
      if (nameGroup) nameGroup.style.display = 'block';
      if (submitBtn) submitBtn.textContent = 'Create Private Workspace Account';
    } else {
      tabLogin?.classList.add('active');
      tabRegister?.classList.remove('active');
      if (nameGroup) nameGroup.style.display = 'none';
      if (submitBtn) submitBtn.textContent = 'Sign In to Workspace';
    }
  }

  async handleLocalAuthSubmit() {
    const fullName = document.getElementById('authFullNameInput')?.value.trim() || '';
    const email = document.getElementById('authEmailInput')?.value.trim() || '';
    const password = document.getElementById('authPasswordInput')?.value || '';
    const errBox = document.getElementById('authErrorMsg');
    const submitBtn = document.getElementById('btnSubmitLocalAuth');

    if (errBox) errBox.style.display = 'none';

    if (!email || !password || (this.authMode === 'register' && !fullName)) {
      if (errBox) {
        errBox.textContent = 'Please fill in all required fields.';
        errBox.style.display = 'block';
      }
      return;
    }

    const endpoint = this.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
    try {
      if (submitBtn) submitBtn.disabled = true;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      this.setActiveUser(data.user, false);
      document.getElementById('authModal')?.classList.remove('open');
      this.showToast(`Welcome, ${data.user.fullName}! Switched to your isolated workspace.`);
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async signOutCurrentAccount() {
    localStorage.removeItem('tutorai_active_user_session');
    if (window.firebaseBridge && window.firebaseBridge.currentUser) {
      await window.firebaseBridge.signOut();
    }
    const defaultUser = window.realmDB.objects('User').find(u => u.id === 'usr_default_learner')
      || window.realmDB.objects('User').items[0];
    this.currentUser = defaultUser;
    window.tutorAIEngine.setUserId(defaultUser?.id || 'usr_default_learner');
    this.updateAuthUI();
    await this.loadUserProviders();
    document.getElementById('authModal')?.classList.remove('open');
    this.showToast('Signed out. Returned to default public workspace.');
    if (this.currentView === 'library') this.renderLibraryView();
    if (this.currentView === 'profile') this.renderProfileView();
  }

  // ==========================================================================
  // 2. Event Bindings
  // ==========================================================================
  bindEvents() {
    // Navigation link clicks
    document.querySelectorAll('[data-route]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const route = el.getAttribute('data-route');
        this.navigateTo(route);
      });
    });

    // Dual Navigation Mode Switcher
    document.getElementById('modeMarketingBtn')?.addEventListener('click', () => this.navigateTo('home'));
    document.getElementById('modeAppBtn')?.addEventListener('click', () => this.navigateTo('course'));

    // Mobile Drawer Open / Close
    const openMobileMenu = () => {
      document.getElementById('mobileNavDrawer')?.classList.add('open');
      document.getElementById('mobileNavBackdrop')?.classList.add('open');
      document.body.style.overflow = 'hidden';
    };
    const closeMobileMenu = () => {
      document.getElementById('mobileNavDrawer')?.classList.remove('open');
      document.getElementById('mobileNavBackdrop')?.classList.remove('open');
      document.body.style.overflow = '';
    };

    document.getElementById('marketingMobileMenuBtn')?.addEventListener('click', openMobileMenu);
    document.getElementById('workspaceMobileMenuBtn')?.addEventListener('click', openMobileMenu);
    document.getElementById('mobileNavCloseBtn')?.addEventListener('click', closeMobileMenu);
    document.getElementById('mobileNavBackdrop')?.addEventListener('click', closeMobileMenu);

    document.getElementById('mobileModePublicBtn')?.addEventListener('click', () => {
      this.navigateTo('home');
      closeMobileMenu();
    });
    document.getElementById('mobileModeAppBtn')?.addEventListener('click', () => {
      this.navigateTo('course');
      closeMobileMenu();
    });

    // Mobile Study Workspace Outline Toggle
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        const sidebar = document.getElementById('courseOutlineSidebar');
        if (sidebar) {
          const isOpen = sidebar.classList.toggle('mobile-open');
          btnToggleSidebar.classList.toggle('open', isOpen);
          btnToggleSidebar.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        }
      });
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

    // Quick topic pills on Homepage
    document.querySelectorAll('.hero-section .topic-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const topic = pill.getAttribute('data-topic');
        if (topic) this.startCourseCreation(topic);
      });
    });

    // Create Course screen input & button (Opens Personalization Preference Modal like tutorai.me)
    const createCourseInput = document.getElementById('createCourseInput');
    const submitCreateCourseBtn = document.getElementById('submitCreateCourseBtn');
    if (submitCreateCourseBtn && createCourseInput) {
      submitCreateCourseBtn.addEventListener('click', () => {
        const val = createCourseInput.value.trim() || document.getElementById('customCourseTitleInput')?.value.trim() || '';
        if (val) {
          this.openPersonalizationModal(val);
        } else {
          this.showToast('Please enter a topic you want to learn.');
          createCourseInput.focus();
        }
      });
      createCourseInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitCreateCourseBtn.click();
      });
    }

    // Suggested topics in Create Course screen
    document.querySelectorAll('.suggested-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const topic = btn.getAttribute('data-topic');
        if (createCourseInput) createCourseInput.value = topic;
        this.openPersonalizationModal(topic);
      });
    });

    // Toggle 1: Use your own sources (Inline Switch + Panel)
    const ownSourcesSwitch = document.getElementById('toggleOwnSourcesSwitch');
    const ownSourcesPanel = document.getElementById('inlineOwnSourcesPanel');
    const syncOwnSourcesToggle = (checked) => {
      if (ownSourcesSwitch) ownSourcesSwitch.checked = checked;
      if (ownSourcesPanel) ownSourcesPanel.style.display = checked ? 'block' : 'none';
    };
    ownSourcesSwitch?.addEventListener('change', (e) => {
      syncOwnSourcesToggle(e.target.checked);
    });
    document.getElementById('useOwnSourcesTriggerText')?.addEventListener('click', () => {
      syncOwnSourcesToggle(!ownSourcesSwitch?.checked);
    });

    // Inline source file upload
    const btnTriggerInlineSourceFile = document.getElementById('btnTriggerInlineSourceFile');
    const inlineRagFileInput = document.getElementById('inlineRagFileInput');
    if (btnTriggerInlineSourceFile && inlineRagFileInput) {
      btnTriggerInlineSourceFile.addEventListener('click', () => inlineRagFileInput.click());
      inlineRagFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const badge = document.getElementById('inlineRagFileBadge');
          if (badge) {
            badge.style.display = 'inline-block';
            badge.textContent = `✓ ${file.name} (${Math.round(file.size / 1024)} KB)`;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const text = String(reader.result || '').slice(0, 15000);
            const txtArea = document.getElementById('inlineSourceTextarea');
            if (txtArea && !txtArea.value.trim()) txtArea.value = text;
            this.activeRagContext = {
              id: 'doc_' + Date.now(),
              fileName: file.name,
              extractedText: text
            };
            const createInput = document.getElementById('createCourseInput');
            if (createInput && !createInput.value.trim()) {
              createInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            }
            this.showToast(`Loaded source document "${file.name}".`);
          };
          reader.readAsText(file);
        }
      });
    }

    // Toggle 2: Define course structure (Inline Switch + 6 Accordion Rows)
    const defineStructureSwitch = document.getElementById('toggleDefineStructureSwitch');
    const defineStructurePanel = document.getElementById('inlineDefineStructurePanel');
    const syncDefineStructureToggle = (checked) => {
      if (defineStructureSwitch) defineStructureSwitch.checked = checked;
      if (defineStructurePanel) defineStructurePanel.style.display = checked ? 'flex' : 'none';
      if (checked) this.renderInlineOutlineBuilder();
    };
    defineStructureSwitch?.addEventListener('change', (e) => {
      syncDefineStructureToggle(e.target.checked);
    });
    document.getElementById('defineStructureTriggerText')?.addEventListener('click', () => {
      syncDefineStructureToggle(!defineStructureSwitch?.checked);
    });

    // 6 Structure Sub-Accordions (Course Title, Learning Outcomes, Course Size, Course Outline, Instructional Methods, Additional Details)
    document.querySelectorAll('.structure-acc-item').forEach(item => {
      const header = item.querySelector('.structure-acc-header');
      const subSwitch = item.querySelector('.structure-sub-switch');
      const body = item.querySelector('.structure-acc-body');

      const toggleAccItem = (openState) => {
        const isOpen = openState !== undefined ? openState : (body?.style.display === 'none');
        if (body) body.style.display = isOpen ? 'block' : 'none';
        item.classList.toggle('open', isOpen);
        if (subSwitch) subSwitch.checked = isOpen;
      };

      header?.addEventListener('click', () => toggleAccItem());
      subSwitch?.addEventListener('change', (e) => toggleAccItem(e.target.checked));
    });

    // Course Outline Builder buttons (+ Add Module & Auto-Fill with AI)
    document.getElementById('btnAddInlineModule')?.addEventListener('click', () => {
      const nextNum = this.inlineOutlineModules.length + 1;
      this.inlineOutlineModules.push({
        title: `Module ${nextNum}: Advanced Topic & Practice`,
        lessons: [`Lesson ${nextNum}.1 Core Concepts`, `Lesson ${nextNum}.2 Practical Application`]
      });
      this.renderInlineOutlineBuilder();
    });

    document.getElementById('btnAutoGenerateInlineOutline')?.addEventListener('click', async () => {
      const topic = document.getElementById('createCourseInput')?.value.trim()
        || document.getElementById('customCourseTitleInput')?.value.trim()
        || 'Comprehensive Mastery Course';
      const btn = document.getElementById('btnAutoGenerateInlineOutline');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Drafting Outline...';
      }
      try {
        const modCount = parseInt(document.getElementById('customNumModulesInput')?.value || '4', 10);
        const lesCount = parseInt(document.getElementById('customLessonsPerModuleInput')?.value || '4', 10);
        const outline = await window.tutorAIEngine.generateCourseStructure(topic, 'intermediate', 'mastery', this.activeRagContext, {
          modulesCount: modCount,
          lessonsPerModule: lesCount
        });
        if (Array.isArray(outline.modules) && outline.modules.length > 0) {
          this.inlineOutlineModules = outline.modules.map(m => ({
            title: m.title || m.moduleTitle || 'Module',
            lessons: (m.lessons || []).map(l => typeof l === 'string' ? l : (l.title || l.lessonTitle || 'Lesson'))
          }));
          this.renderInlineOutlineBuilder();
          this.showToast('Outline auto-populated with AI!');
        }
      } catch (e) {
        this.showToast(`Outline generation notice: ${e.message}`);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '✨ Auto-Fill with AI';
        }
      }
    });

    // Bottom Upload Course Plan File button inside Define Course Structure
    const btnUploadCoursePlanFile = document.getElementById('btnUploadCoursePlanFile');
    const coursePlanFileInput = document.getElementById('coursePlanFileInput');
    if (btnUploadCoursePlanFile && coursePlanFileInput) {
      btnUploadCoursePlanFile.addEventListener('click', () => coursePlanFileInput.click());
      coursePlanFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = () => {
            const text = String(reader.result || '').slice(0, 12000);
            const detailsArea = document.getElementById('customAdditionalDetailsInput');
            const swDetails = document.getElementById('swAdditionalDetails');
            const bodyDetails = document.getElementById('accBodyAdditionalDetails');
            if (detailsArea) detailsArea.value = text;
            if (swDetails) swDetails.checked = true;
            if (bodyDetails) {
              bodyDetails.style.display = 'block';
              bodyDetails.closest('.structure-acc-item')?.classList.add('open');
            }
            const createInput = document.getElementById('createCourseInput');
            if (createInput && !createInput.value.trim()) {
              createInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            }
            btnUploadCoursePlanFile.textContent = `✓ ${file.name}`;
            this.showToast(`Course plan "${file.name}" imported into structure settings!`);
          };
          reader.readAsText(file);
        }
      });
    }

    // Personalization Preference Modal Events
    const persRadioYes = document.getElementById('persRadioYes');
    const persRadioNo = document.getElementById('persRadioNo');
    const persLabelYes = document.getElementById('persLabelYes');
    const persLabelNo = document.getElementById('persLabelNo');
    const persDrawer = document.getElementById('persCustomOptionsDrawer');
    const updatePersRadioUI = () => {
      const isYes = Boolean(persRadioYes?.checked);
      persLabelYes?.classList.toggle('selected', isYes);
      persLabelNo?.classList.toggle('selected', !isYes);
      if (persDrawer) persDrawer.style.display = isYes ? 'flex' : 'none';
    };
    persRadioYes?.addEventListener('change', updatePersRadioUI);
    persRadioNo?.addEventListener('change', updatePersRadioUI);

    document.getElementById('btnConfirmPersonalizationCreate')?.addEventListener('click', () => {
      const topic = this.pendingCreateTopic
        || document.getElementById('createCourseInput')?.value.trim()
        || document.getElementById('customCourseTitleInput')?.value.trim()
        || 'Custom AI Course';
      this.executeCourseCreation(topic);
    });

    // Course Overview <-> Lesson Study View switchers
    document.getElementById('btnBackToCourseOverview')?.addEventListener('click', () => {
      this.setCourseViewMode('overview');
    });
    document.getElementById('btnSidebarCourseOverview')?.addEventListener('click', () => {
      this.setCourseViewMode('overview');
    });
    document.getElementById('btnResumeLessonFromOverview')?.addEventListener('click', () => {
      this.setCourseViewMode('lesson');
    });

    // 4 Horizontal Lesson Tabs (Content | Simplify | Quiz | Examples)
    document.querySelectorAll('#lessonTabsBar .tutorai-tab-btn').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const tabName = tabBtn.getAttribute('data-lesson-tab') || 'content';
        this.switchLessonTab(tabName);
      });
    });

    // Expand / Collapse All 1.1.1 Sub-Section Cards
    document.getElementById('btnToggleAllSubsections')?.addEventListener('click', () => {
      this.allSubsectionsExpanded = !this.allSubsectionsExpanded;
      document.querySelectorAll('#lessonBodyMarkdown .subsection-accordion-card').forEach(card => {
        card.classList.toggle('open', this.allSubsectionsExpanded);
        const body = card.querySelector('.subsection-acc-body');
        if (body) body.style.display = this.allSubsectionsExpanded ? 'block' : 'none';
      });
      const toggleBtn = document.getElementById('btnToggleAllSubsections');
      if (toggleBtn) {
        toggleBtn.textContent = this.allSubsectionsExpanded ? '↕ Collapse All' : '↕ Expand All';
      }
    });

    // Key Takeaways circular button (☍)
    document.getElementById('btnKeyTakeaways')?.addEventListener('click', () => {
      this.renderKeyTakeawaysCard();
    });

    // Bottom Lesson Navigation (< Previous | Mark as Complete | Next >)
    document.getElementById('btnPrevLesson')?.addEventListener('click', () => this.navigateAdjacentLesson(-1));
    document.getElementById('btnNextLesson')?.addEventListener('click', () => this.navigateAdjacentLesson(1));

    // Right-Edge Floating Course Outline Drawer & Backdrop
    const openSlideOverOutline = () => {
      document.getElementById('slideOverOutlineDrawer')?.classList.add('open');
      document.getElementById('slideOverOutlineBackdrop')?.classList.add('open');
    };
    const closeSlideOverOutline = () => {
      document.getElementById('slideOverOutlineDrawer')?.classList.remove('open');
      document.getElementById('slideOverOutlineBackdrop')?.classList.remove('open');
    };
    document.getElementById('btnFloatingOutlineDrawer')?.addEventListener('click', openSlideOverOutline);
    document.getElementById('btnCloseSlideOverOutline')?.addEventListener('click', closeSlideOverOutline);
    document.getElementById('slideOverOutlineBackdrop')?.addEventListener('click', closeSlideOverOutline);

    // Floating Bottom-Right AI Tutor Shield Button
    document.getElementById('btnFloatingAiTutor')?.addEventListener('click', () => this.openChatDrawer());

    // AI Providers View Events
    document.querySelectorAll('#providerPresetButtons [data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#providerPresetButtons [data-preset]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyProviderPreset(btn.getAttribute('data-preset'));
      });
    });

    document.getElementById('btnToggleKeyVisibility')?.addEventListener('click', () => {
      const keyInput = document.getElementById('provApiKeyInput');
      if (keyInput) {
        keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      }
    });

    document.getElementById('btnResetProviderForm')?.addEventListener('click', () => {
      this.resetProviderForm();
    });

    document.getElementById('btnTestProviderConnection')?.addEventListener('click', () => this.handleTestProviderConnection());
    document.getElementById('btnSaveProviderConfig')?.addEventListener('click', () => this.handleSaveProviderConfig());

    // Study Workspace Events
    document.getElementById('btnReadAloud')?.addEventListener('click', () => {
      const bodyEl = document.getElementById('lessonBodyMarkdown');
      if (bodyEl && window.speechController) {
        window.speechController.toggle(bodyEl.innerText);
      }
    });

    document.getElementById('btnMarkComplete')?.addEventListener('click', () => this.markCurrentLessonComplete());

    // Go Deeper Toolbar buttons (Sync with 4 Lesson Tabs + Flashcards + Chat)
    document.getElementById('btnGoSimplify')?.addEventListener('click', () => this.switchLessonTab('simplify'));
    document.getElementById('btnGoExamples')?.addEventListener('click', () => this.switchLessonTab('examples'));
    document.getElementById('btnGoQuiz')?.addEventListener('click', () => this.switchLessonTab('quiz'));
    document.getElementById('btnGoFlashcards')?.addEventListener('click', () => this.handleGoDeeper('flashcards'));
    document.getElementById('btnGoAsk')?.addEventListener('click', () => this.openChatDrawer());

    // AI Math Solver events (including Multimodal Image OCR)
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
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
            const statusText = document.getElementById('mathUploadStatusText');
            if (statusText) statusText.textContent = `Uploaded image: ${file.name} (${Math.round(file.size / 1024)} KB)`;
            this.handleSolveMath(mathInput?.value || `Uploaded image: ${file.name}`, base64, file.type || 'image/png');
          };
          reader.readAsDataURL(file);
        }
      });
    }

    // Flashcard 3D flip card click & SM-2 grading
    document.getElementById('flashcardFlipWrapper')?.addEventListener('click', () => this.toggleCardFlip());
    document.querySelectorAll('[data-sm2-grade]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const grade = parseInt(btn.getAttribute('data-sm2-grade'), 10);
        this.submitFlashcardGrade(grade);
      });
    });

    // Homeworkify & Writing Coach
    document.getElementById('btnSolveHomework')?.addEventListener('click', () => this.handleSolveHomework());
    document.getElementById('btnReviewWriting')?.addEventListener('click', () => this.handleReviewWriting());

    // Chat Drawer
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
        q.parentElement?.classList.toggle('open');
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

    // Auth Modal & Sign In buttons
    document.querySelectorAll('.btn-signin, #navSignInBtn, #workspaceSignInBtn, #mobileSignInBtn, #btnProfileOpenAuthModal').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('authModal')?.classList.add('open');
      });
    });
    document.getElementById('btnSubmitLocalAuth')?.addEventListener('click', () => this.handleLocalAuthSubmit());
    document.getElementById('btnSignOutModal')?.addEventListener('click', () => this.signOutCurrentAccount());

    // Contact Form Submit
    document.getElementById('btnSubmitContactForm')?.addEventListener('click', () => {
      const name = document.getElementById('contactNameInput')?.value.trim();
      const email = document.getElementById('contactEmailInput')?.value.trim();
      const msg = document.getElementById('contactMsgInput')?.value.trim();
      if (!name || !email || !msg) {
        this.showToast('Please complete your name, email, and message.');
        return;
      }
      document.getElementById('contactModal')?.classList.remove('open');
      this.showToast('Thank you! Your message has been received by the TutorAI engineering team.');
    });

    // Reset starter database
    document.getElementById('btnResetData')?.addEventListener('click', async () => {
      await window.realmDB.resetToDefaults();
      this.restoreUserSession();
      this.showToast('Starter courses and flashcards restored.');
      this.renderLibraryView();
    });
  }

  // ==========================================================================
  // 3. Dual Navigation & View Router
  // ==========================================================================
  navigateTo(viewName) {
    this.currentView = viewName;
    window.location.hash = viewName;

    // Close mobile drawer on navigation
    document.getElementById('mobileNavDrawer')?.classList.remove('open');
    document.getElementById('mobileNavBackdrop')?.classList.remove('open');
    document.body.style.overflow = '';

    const marketingRoutes = ['home', 'pricing', 'ai-math-solver', 'homeworkify', 'free-online-courses'];
    const isMarketing = marketingRoutes.includes(viewName);

    const marketingNav = document.getElementById('marketingNavbar');
    const workspaceNav = document.getElementById('workspaceNavbar');
    const modeMarketingBtn = document.getElementById('modeMarketingBtn');
    const modeAppBtn = document.getElementById('modeAppBtn');
    const mobileModePublicBtn = document.getElementById('mobileModePublicBtn');
    const mobileModeAppBtn = document.getElementById('mobileModeAppBtn');

    if (isMarketing) {
      if (marketingNav) marketingNav.style.display = 'flex';
      if (workspaceNav) workspaceNav.style.display = 'none';
      modeMarketingBtn?.classList.add('active');
      modeAppBtn?.classList.remove('active');
      mobileModePublicBtn?.classList.add('active');
      mobileModeAppBtn?.classList.remove('active');
    } else {
      if (marketingNav) marketingNav.style.display = 'none';
      if (workspaceNav) workspaceNav.style.display = 'flex';
      modeMarketingBtn?.classList.remove('active');
      modeAppBtn?.classList.add('active');
      mobileModePublicBtn?.classList.remove('active');
      mobileModeAppBtn?.classList.add('active');
    }

    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
      const target = link.getAttribute('data-route');
      link.classList.toggle('active', target === viewName);
    });

    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active-view');
    });

    const activeSec = document.getElementById(`view-${viewName}`);
    if (activeSec) {
      activeSec.classList.add('active-view');
    } else {
      document.getElementById('view-home')?.classList.add('active-view');
    }

    if (viewName === 'course') {
      this.renderCourseWorkspace();
    } else if (viewName === 'flashcards') {
      this.initFlashcardsView();
    } else if (viewName === 'library') {
      this.renderLibraryView();
    } else if (viewName === 'profile') {
      this.renderProfileView();
    } else if (viewName === 'ai-providers') {
      this.renderProvidersView();
    } else if (viewName === 'create-course') {
      this.populateCreatorProviderDropdown();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================================================
  // 4. AI Providers & Encrypted API Key Management (#view-ai-providers)
  // ==========================================================================
  async loadUserProviders() {
    try {
      await window.tutorAIEngine.fetchProviders();
      this.renderProvidersView();
      this.populateCreatorProviderDropdown();
    } catch (err) {
      console.warn('Could not load providers:', err.message);
    }
  }

  applyProviderPreset(presetKey) {
    const preset = window.tutorAIEngine.presets[presetKey] || window.tutorAIEngine.presets.custom;
    document.getElementById('provEditIdInput').value = '';
    document.getElementById('provTypeInput').value = preset.providerType;
    document.getElementById('provNameInput').value = preset.name;
    document.getElementById('provProtocolSelect').value = preset.protocol;
    document.getElementById('provBaseUrlInput').value = preset.baseUrl;
    document.getElementById('provModelIdInput').value = preset.defaultModel;

    const keyInput = document.getElementById('provApiKeyInput');
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = preset.keyPlaceholder || 'Enter your API key';
    }

    const heading = document.getElementById('providerFormHeading');
    if (heading) heading.textContent = `Configure ${preset.name}`;

    const suggestedRow = document.getElementById('provSuggestedModelsRow');
    if (suggestedRow) {
      if (preset.suggestedModels && preset.suggestedModels.length > 0) {
        suggestedRow.innerHTML = `<span style="font-size: 0.78rem; color: var(--muted); font-weight: 600;">Quick select model:</span>` +
          preset.suggestedModels.map(m => `
            <button type="button" class="topic-pill" style="padding: 3px 10px; font-size: 0.78rem;" data-Select-model="${m}">${m}</button>
          `).join('');
        suggestedRow.querySelectorAll('[data-select-model]').forEach(btn => {
          btn.addEventListener('click', () => {
            document.getElementById('provModelIdInput').value = btn.getAttribute('data-select-model');
          });
        });
      } else {
        suggestedRow.innerHTML = `<span style="font-size: 0.78rem; color: var(--muted);">Enter the exact Model ID supported by your custom endpoint.</span>`;
      }
    }

    const testBox = document.getElementById('provTestResultBox');
    if (testBox) testBox.style.display = 'none';
  }

  resetProviderForm() {
    document.querySelectorAll('#providerPresetButtons [data-preset]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-preset') === 'openrouter');
    });
    this.applyProviderPreset('openrouter');
    this.showToast('Ready to add a new AI provider.');
  }

  renderProvidersView() {
    const badge = document.getElementById('builtInGeminiStatusBadge');
    const caps = window.tutorAIEngine.serverCapabilities;
    if (badge) {
      if (caps && caps.builtInGeminiAvailable) {
        badge.style.background = '#F0FDF4';
        badge.style.borderColor = '#BBF7D0';
        badge.style.color = '#166534';
        badge.innerHTML = `✓ Built-in Gemini Server Ready (<code>${caps.defaultGeminiModel}</code>)`;
      } else {
        badge.style.background = '#FEF3C7';
        badge.style.borderColor = '#FDE68A';
        badge.style.color = '#92400E';
        badge.textContent = '⚠️ No Built-in Server Key — Add Your Provider Key Below';
      }
    }

    const container = document.getElementById('savedProvidersListContainer');
    if (!container) return;
    container.innerHTML = '';

    const providers = window.tutorAIEngine.providers || [];

    // Always show Built-in Server Gemini card first if available
    if (caps && caps.builtInGeminiAvailable) {
      const hasUserDefault = providers.some(p => p.isDefault);
      const sysCard = document.createElement('div');
      sysCard.style.cssText = `background: #FFFFFF; border: 2px solid ${!hasUserDefault ? 'var(--primary)' : 'var(--border)'}; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; box-shadow: var(--shadow-sm);`;
      sysCard.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-weight: 800; color: var(--navy); font-size: 1rem;">✨ Built-in Google Gemini</span>
            <span style="background: #F0FDF4; color: #166534; font-size: 0.74rem; font-weight: 700; padding: 2px 8px; border-radius: 999px;">SERVER ENGINE</span>
          </div>
          <div style="font-size: 0.84rem; color: var(--slate); margin-bottom: 4px;"><strong>Model:</strong> <code>${caps.defaultGeminiModel}</code></div>
          <div style="font-size: 0.84rem; color: var(--slate);"><strong>Protocol:</strong> <code>gemini-server</code></div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 10px;">
          <span style="font-size: 0.78rem; color: ${!hasUserDefault ? 'var(--primary)' : 'var(--muted)'}; font-weight: 700;">
            ${!hasUserDefault ? '★ Active Default Engine' : 'Available Fallback'}
          </span>
          <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" id="btnTestBuiltInGemini">🔌 Live Test</button>
        </div>
      `;
      sysCard.querySelector('#btnTestBuiltInGemini')?.addEventListener('click', async () => {
        this.showToast('Running live probe against Built-in Gemini Server...');
        try {
          const res = await window.tutorAIEngine.testProviderConnection({
            protocol: 'gemini-server',
            modelId: caps.defaultGeminiModel
          });
          this.showToast(`✓ Built-in Gemini verified (${res.latencyMs}ms): "${res.sampleReply}"`);
        } catch (e) {
          this.showToast(`✗ Built-in Gemini test failed: ${e.message}`);
        }
      });
      container.appendChild(sysCard);
    }

    providers.forEach(p => {
      const card = document.createElement('div');
      const isVerified = p.lastTestedStatus === 'verified';
      const statusBadgeBg = isVerified ? '#F0FDF4' : (p.lastTestedStatus === 'failed' ? '#FEF2F2' : '#F1F5F9');
      const statusBadgeColor = isVerified ? '#166534' : (p.lastTestedStatus === 'failed' ? '#DC2626' : '#475569');
      const statusLabel = isVerified
        ? `✓ Verified ${p.lastLatencyMs ? `(${p.lastLatencyMs}ms)` : ''}`
        : (p.lastTestedStatus === 'failed' ? '✗ Connection Failed' : '○ Untested');

      card.style.cssText = `background: #FFFFFF; border: 2px solid ${p.isDefault ? 'var(--primary)' : 'var(--border)'}; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; box-shadow: var(--shadow-sm);`;
      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 800; color: var(--navy); font-size: 1rem;">${this.escapeHtml(p.name)}</div>
              <span style="font-size: 0.75rem; color: var(--muted);">${this.escapeHtml(p.protocol)}</span>
            </div>
            <span style="background: ${statusBadgeBg}; color: ${statusBadgeColor}; font-size: 0.74rem; font-weight: 700; padding: 3px 8px; border-radius: 999px;">
              ${statusLabel}
            </span>
          </div>
          <div style="font-size: 0.84rem; color: var(--slate); margin-bottom: 4px;"><strong>Model:</strong> <code>${this.escapeHtml(p.modelId)}</code></div>
          <div style="font-size: 0.84rem; color: var(--slate); margin-bottom: 4px;"><strong>Key:</strong> <code>${this.escapeHtml(p.maskedKey)}</code></div>
          ${p.baseUrl ? `<div style="font-size: 0.78rem; color: var(--slate-light); word-break: break-all;"><strong>URL:</strong> ${this.escapeHtml(p.baseUrl)}</div>` : ''}
          ${p.lastErrorMessage ? `<div style="margin-top: 6px; font-size: 0.76rem; color: #DC2626; background: #FEF2F2; padding: 6px 8px; border-radius: 6px;">${this.escapeHtml(p.lastErrorMessage)}</div>` : ''}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; border-top: 1px solid var(--border); padding-top: 10px;">
          ${p.isDefault
            ? `<span style="font-size: 0.78rem; color: var(--primary); font-weight: 800;">★ Default Engine</span>`
            : `<button type="button" class="btn-secondary btn-set-def" style="padding: 4px 10px; font-size: 0.76rem;">Set Default</button>`
          }
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-secondary btn-test-prov" style="padding: 4px 10px; font-size: 0.76rem;">🔌 Test</button>
            <button type="button" class="btn-secondary btn-edit-prov" style="padding: 4px 10px; font-size: 0.76rem;">✏️ Edit</button>
            <button type="button" class="btn-secondary btn-del-prov" style="padding: 4px 10px; font-size: 0.76rem; color: #DC2626; border-color: #FECACA;">🗑️</button>
          </div>
        </div>
      `;

      card.querySelector('.btn-set-def')?.addEventListener('click', async () => {
        await window.tutorAIEngine.setDefaultProvider(p.id);
        this.renderProvidersView();
        this.populateCreatorProviderDropdown();
        this.showToast(`"${p.name}" is now your default AI provider.`);
      });

      card.querySelector('.btn-test-prov')?.addEventListener('click', async () => {
        this.showToast(`Testing live connection to ${p.name} (${p.modelId})...`);
        try {
          const res = await window.tutorAIEngine.testProviderConnection({ providerId: p.id });
          await window.tutorAIEngine.fetchProviders();
          this.renderProvidersView();
          this.populateCreatorProviderDropdown();
          this.showToast(`✓ Verified ${p.name} in ${res.latencyMs}ms!`);
        } catch (err) {
          await window.tutorAIEngine.fetchProviders();
          this.renderProvidersView();
          this.showToast(`✗ Connection failed: ${err.message}`);
        }
      });

      card.querySelector('.btn-edit-prov')?.addEventListener('click', () => {
        this.loadProviderIntoForm(p);
      });

      card.querySelector('.btn-del-prov')?.addEventListener('click', async () => {
        await window.tutorAIEngine.deleteProvider(p.id);
        window.realmDB.write(() => {
          window.realmDB.delete('AIProvider', p.id);
        });
        if (window.firebaseBridge && window.firebaseBridge.currentUser) {
          window.firebaseBridge.deleteAIProviderMetadata(p.id).catch(console.error);
        }
        this.renderProvidersView();
        this.populateCreatorProviderDropdown();
        this.showToast(`Deleted provider "${p.name}".`);
      });

      container.appendChild(card);
    });
  }

  loadProviderIntoForm(p) {
    document.getElementById('provEditIdInput').value = p.id;
    document.getElementById('provTypeInput').value = p.providerType || 'custom';
    document.getElementById('provNameInput').value = p.name || '';
    document.getElementById('provProtocolSelect').value = p.protocol || 'openai-compatible';
    document.getElementById('provBaseUrlInput').value = p.baseUrl || '';
    document.getElementById('provModelIdInput').value = p.modelId || '';
    document.getElementById('provTempInput').value = typeof p.temperature === 'number' ? p.temperature : 0.7;
    document.getElementById('provMaxTokensInput').value = typeof p.maxTokens === 'number' ? p.maxTokens : 4096;
    document.getElementById('provIsDefaultCheck').checked = Boolean(p.isDefault);

    const keyInput = document.getElementById('provApiKeyInput');
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = `Saved (${p.maskedKey}) — leave blank to keep existing key`;
    }

    const heading = document.getElementById('providerFormHeading');
    if (heading) heading.textContent = `Editing Provider: ${p.name}`;
    this.showToast(`Loaded "${p.name}" into editor.`);
  }

  getFormProviderPayload() {
    return {
      id: document.getElementById('provEditIdInput')?.value.trim() || undefined,
      providerType: document.getElementById('provTypeInput')?.value.trim() || 'custom',
      name: document.getElementById('provNameInput')?.value.trim() || '',
      protocol: document.getElementById('provProtocolSelect')?.value || 'openai-compatible',
      baseUrl: document.getElementById('provBaseUrlInput')?.value.trim() || '',
      apiKey: document.getElementById('provApiKeyInput')?.value.trim() || '',
      modelId: document.getElementById('provModelIdInput')?.value.trim() || '',
      temperature: parseFloat(document.getElementById('provTempInput')?.value || '0.7'),
      maxTokens: parseInt(document.getElementById('provMaxTokensInput')?.value || '4096', 10),
      isDefault: Boolean(document.getElementById('provIsDefaultCheck')?.checked)
    };
  }

  async handleTestProviderConnection() {
    const payload = this.getFormProviderPayload();
    const testBox = document.getElementById('provTestResultBox');
    const testBtn = document.getElementById('btnTestProviderConnection');

    if (!payload.modelId || !payload.protocol) {
      this.showToast('Please specify a Protocol and Model ID first.');
      return;
    }

    if (testBox) {
      testBox.style.display = 'block';
      testBox.style.background = '#F8FAFC';
      testBox.style.border = '1px solid #CBD5E1';
      testBox.style.color = '#334155';
      testBox.innerHTML = `⏳ Sending live verification handshake to <strong>${this.escapeHtml(payload.name || payload.protocol)}</strong> (Model: <code>${this.escapeHtml(payload.modelId)}</code>)...`;
    }

    try {
      if (testBtn) testBtn.disabled = true;
      const res = await window.tutorAIEngine.testProviderConnection({
        providerId: payload.id,
        name: payload.name,
        providerType: payload.providerType,
        protocol: payload.protocol,
        baseUrl: payload.baseUrl,
        apiKey: payload.apiKey,
        modelId: payload.modelId
      });

      if (testBox) {
        testBox.style.background = '#F0FDF4';
        testBox.style.border = '1px solid #BBF7D0';
        testBox.style.color = '#166534';
        testBox.innerHTML = `
          <div style="font-weight: 800; margin-bottom: 4px;">✓ Live Connection Verified (${res.latencyMs} ms)</div>
          <div><strong>Model:</strong> <code>${this.escapeHtml(res.modelId)}</code> · <strong>Protocol:</strong> <code>${this.escapeHtml(res.protocol)}</code></div>
          <div style="margin-top: 4px; font-size: 0.82rem;"><strong>Model Handshake Response:</strong> "${this.escapeHtml(res.sampleReply)}"</div>
        `;
      }
      await window.tutorAIEngine.fetchProviders();
      this.renderProvidersView();
      this.populateCreatorProviderDropdown();
      this.showToast('Live connection test succeeded!');
    } catch (err) {
      if (testBox) {
        testBox.style.background = '#FEF2F2';
        testBox.style.border = '1px solid #FECACA';
        testBox.style.color = '#DC2626';
        testBox.innerHTML = `
          <div style="font-weight: 800; margin-bottom: 4px;">✗ Live Connection Test Failed</div>
          <div>${this.escapeHtml(err.message)}</div>
          <div style="margin-top: 6px; font-size: 0.8rem; color: #991B1B;">Verify that your API Key is valid, has sufficient quota, and that the Base URL and Protocol match the provider's specification.</div>
        `;
      }
      this.showToast('Connection test failed. See diagnostic details.');
    } finally {
      if (testBtn) testBtn.disabled = false;
    }
  }

  async handleSaveProviderConfig() {
    const payload = this.getFormProviderPayload();
    const saveBtn = document.getElementById('btnSaveProviderConfig');

    if (!payload.name || !payload.modelId) {
      this.showToast('Provider Display Name and Model ID are required.');
      return;
    }

    try {
      if (saveBtn) saveBtn.disabled = true;
      const savedData = await window.tutorAIEngine.saveProvider(payload);
      const savedProv = savedData.provider;

      // Sync non-sensitive metadata to Realm DB & Firebase
      if (savedProv) {
        window.realmDB.write(() => {
          window.realmDB.create('AIProvider', {
            id: savedProv.id,
            userId: this.currentUser?.id || 'usr_default_learner',
            name: savedProv.name,
            providerType: savedProv.providerType,
            protocol: savedProv.protocol,
            baseUrl: savedProv.baseUrl,
            modelId: savedProv.modelId,
            maskedKey: savedProv.maskedKey,
            temperature: savedProv.temperature,
            maxTokens: savedProv.maxTokens,
            isDefault: savedProv.isDefault,
            lastTestedStatus: savedProv.lastTestedStatus,
            lastTestedAt: savedProv.lastTestedAt,
            createdAt: savedProv.createdAt
          });
        });

        if (window.firebaseBridge && window.firebaseBridge.currentUser) {
          window.firebaseBridge.syncAIProviderMetadata(savedProv).catch(console.error);
        }
      }

      this.renderProvidersView();
      this.populateCreatorProviderDropdown();
      this.showToast(`Saved AI Provider "${payload.name}" (Encrypted in server vault).`);

      // Automatically run a live connection probe after saving if key was supplied
      if (payload.apiKey && savedProv) {
        document.getElementById('provEditIdInput').value = savedProv.id;
        await this.handleTestProviderConnection();
      }
    } catch (err) {
      this.showToast(`Failed to save provider: ${err.message}`);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  populateCreatorProviderDropdown() {
    const select = document.getElementById('courseCreatorProviderSelect');
    if (!select) return;

    const providers = window.tutorAIEngine.providers || [];
    const caps = window.tutorAIEngine.serverCapabilities || {};
    select.innerHTML = '';

    providers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const statusSym = p.lastTestedStatus === 'verified' ? '✓' : (p.lastTestedStatus === 'failed' ? '⚠️' : '•');
      opt.textContent = `${statusSym} ${p.name} (${p.modelId})${p.isDefault ? ' [Default]' : ''}`;
      if (p.isDefault) opt.selected = true;
      select.appendChild(opt);
    });

    if (caps.builtInGeminiAvailable) {
      const sysOpt = document.createElement('option');
      sysOpt.value = 'system_gemini';
      sysOpt.textContent = `✨ Built-in Google Gemini Server (${caps.defaultGeminiModel})`;
      if (providers.length === 0) sysOpt.selected = true;
      select.appendChild(sysOpt);
    }

    if (select.options.length === 0) {
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '⚠️ No AI Provider Configured — Click Configure AI Providers';
      select.appendChild(noneOpt);
    }

    window.tutorAIEngine.selectedProviderId = select.value || null;
    this.updateCreatorProviderStatusText();
  }

  updateCreatorProviderStatusText() {
    const statusEl = document.getElementById('courseCreatorProviderStatus');
    if (!statusEl) return;
    const active = window.tutorAIEngine.getActiveProviderSummary();
    if (!active) {
      statusEl.style.color = '#DC2626';
      statusEl.textContent = '⚠️ Please configure an AI provider first';
      return;
    }
    if (active.lastTestedStatus === 'verified') {
      statusEl.style.color = '#16A34A';
      statusEl.textContent = `✓ Verified (${active.protocol})`;
    } else if (active.lastTestedStatus === 'failed') {
      statusEl.style.color = '#DC2626';
      statusEl.textContent = `⚠️ Last connection test failed`;
    } else {
      statusEl.style.color = '#64748B';
      statusEl.textContent = `Protocol: ${active.protocol}`;
    }
  }

  // ==========================================================================
  // 5. Course Creation Pipeline (Topic, RAG Sources, 6 Structure Accordions & Personalization Modal)
  // ==========================================================================
  renderInlineOutlineBuilder() {
    const container = document.getElementById('inlineOutlineModulesContainer');
    if (!container) return;

    container.innerHTML = this.inlineOutlineModules.map((mod, mIdx) => `
      <div class="inline-module-card" data-mod-index="${mIdx}">
        <div class="inline-module-header">
          <span class="inline-module-badge">Module ${mIdx + 1}</span>
          <input type="text" class="inline-mod-title-input" data-mod-index="${mIdx}" value="${this.escapeHtml(mod.title)}" placeholder="Enter module title">
          ${this.inlineOutlineModules.length > 1
            ? `<button type="button" class="btn-remove-inline-item btn-remove-inline-mod" data-mod-index="${mIdx}" title="Remove Module">−</button>`
            : ''
          }
        </div>
        <div class="inline-lessons-list">
          ${(mod.lessons || []).map((lesTitle, lIdx) => `
            <div class="inline-lesson-row">
              <input type="text" class="inline-les-title-input" data-mod-index="${mIdx}" data-les-index="${lIdx}" value="${this.escapeHtml(lesTitle)}" placeholder="Enter lesson title">
              ${mod.lessons.length > 1
                ? `<button type="button" class="btn-remove-inline-item btn-remove-inline-les" data-mod-index="${mIdx}" data-les-index="${lIdx}" title="Remove Lesson">×</button>`
                : ''
              }
            </div>
          `).join('')}
        </div>
        <button type="button" class="btn-add-inline-lesson" data-mod-index="${mIdx}">+ Add Lesson</button>
      </div>
    `).join('');

    container.querySelectorAll('.inline-mod-title-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const mIdx = parseInt(inp.getAttribute('data-mod-index'), 10);
        if (this.inlineOutlineModules[mIdx]) {
          this.inlineOutlineModules[mIdx].title = e.target.value;
        }
      });
    });

    container.querySelectorAll('.inline-les-title-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const mIdx = parseInt(inp.getAttribute('data-mod-index'), 10);
        const lIdx = parseInt(inp.getAttribute('data-les-index'), 10);
        if (this.inlineOutlineModules[mIdx] && this.inlineOutlineModules[mIdx].lessons) {
          this.inlineOutlineModules[mIdx].lessons[lIdx] = e.target.value;
        }
      });
    });

    container.querySelectorAll('.btn-add-inline-lesson').forEach(btn => {
      btn.addEventListener('click', () => {
        const mIdx = parseInt(btn.getAttribute('data-mod-index'), 10);
        if (this.inlineOutlineModules[mIdx]) {
          const nextLesIdx = (this.inlineOutlineModules[mIdx].lessons?.length || 0) + 1;
          this.inlineOutlineModules[mIdx].lessons.push(`Lesson ${mIdx + 1}.${nextLesIdx}`);
          this.renderInlineOutlineBuilder();
        }
      });
    });

    container.querySelectorAll('.btn-remove-inline-mod').forEach(btn => {
      btn.addEventListener('click', () => {
        const mIdx = parseInt(btn.getAttribute('data-mod-index'), 10);
        if (this.inlineOutlineModules.length > 1) {
          this.inlineOutlineModules.splice(mIdx, 1);
          this.renderInlineOutlineBuilder();
        }
      });
    });

    container.querySelectorAll('.btn-remove-inline-les').forEach(btn => {
      btn.addEventListener('click', () => {
        const mIdx = parseInt(btn.getAttribute('data-mod-index'), 10);
        const lIdx = parseInt(btn.getAttribute('data-les-index'), 10);
        if (this.inlineOutlineModules[mIdx] && this.inlineOutlineModules[mIdx].lessons.length > 1) {
          this.inlineOutlineModules[mIdx].lessons.splice(lIdx, 1);
          this.renderInlineOutlineBuilder();
        }
      });
    });
  }

  openPersonalizationModal(topic) {
    this.pendingCreateTopic = String(topic || '').trim();
    const modal = document.getElementById('personalizationModal');
    const genStatus = document.getElementById('persGeneratingStatus');
    const createNowBtn = document.getElementById('btnConfirmPersonalizationCreate');
    if (genStatus) genStatus.style.display = 'none';
    if (createNowBtn) {
      createNowBtn.disabled = false;
      createNowBtn.textContent = 'Create Now';
    }
    if (modal) {
      modal.classList.add('open');
    } else {
      this.executeCourseCreation(this.pendingCreateTopic);
    }
  }

  collectCreateCourseOptions() {
    const useOwnSources = Boolean(document.getElementById('toggleOwnSourcesSwitch')?.checked);
    const defineStructure = Boolean(document.getElementById('toggleDefineStructureSwitch')?.checked);

    const inlineSourceText = document.getElementById('inlineSourceTextarea')?.value.trim() || '';
    const ragText = useOwnSources
      ? (inlineSourceText || this.activeRagContext?.extractedText || '')
      : (this.activeRagContext?.extractedText || '');

    const swTitle = Boolean(document.getElementById('swCourseTitle')?.checked);
    const swOutcomes = Boolean(document.getElementById('swLearningOutcomes')?.checked);
    const swSize = Boolean(document.getElementById('swCourseSize')?.checked);
    const swOutline = Boolean(document.getElementById('swCourseOutline')?.checked);
    const swMethods = Boolean(document.getElementById('swInstructionalMethods')?.checked);
    const swDetails = Boolean(document.getElementById('swAdditionalDetails')?.checked);

    const customTitle = (defineStructure && swTitle)
      ? (document.getElementById('customCourseTitleInput')?.value.trim() || '')
      : '';
    const learningOutcomes = (defineStructure && swOutcomes)
      ? (document.getElementById('customLearningOutcomesInput')?.value.trim() || '')
      : '';
    const modulesCount = (defineStructure && swSize)
      ? Math.max(1, Math.min(12, parseInt(document.getElementById('customNumModulesInput')?.value || '4', 10)))
      : 4;
    const lessonsPerModule = (defineStructure && swSize)
      ? Math.max(1, Math.min(10, parseInt(document.getElementById('customLessonsPerModuleInput')?.value || '4', 10)))
      : 4;
    const customOutlineModules = (defineStructure && swOutline && this.inlineOutlineModules.length > 0)
      ? this.inlineOutlineModules
      : null;
    const allowAdditionalModules = Boolean(document.getElementById('toggleAllowAdditionalModules')?.checked);
    const instructionalMethods = (defineStructure && swMethods)
      ? (document.getElementById('customInstructionalMethodsInput')?.value.trim() || '')
      : '';
    const additionalDetails = (defineStructure && swDetails)
      ? (document.getElementById('customAdditionalDetailsInput')?.value.trim() || '')
      : '';

    const personalized = Boolean(document.getElementById('persRadioYes')?.checked);
    const learnerLevel = personalized
      ? (document.getElementById('persLearnerLevelSelect')?.value || 'intermediate')
      : (this.currentUser?.knowledgeLevelPref || 'intermediate');
    const learningStyle = personalized
      ? (document.getElementById('persLearningStyleSelect')?.value || 'Practical & Examples')
      : 'Practical & Examples';
    const persGoal = personalized
      ? (document.getElementById('persGoalInput')?.value.trim() || '')
      : '';

    return {
      ragText,
      customTitle,
      learningOutcomes: [learningOutcomes, persGoal].filter(Boolean).join(' — '),
      modulesCount,
      lessonsPerModule,
      customOutlineModules,
      allowAdditionalModules,
      instructionalMethods,
      additionalDetails,
      personalized,
      learnerLevel,
      learningStyle
    };
  }

  startCourseCreation(topic) {
    this.navigateTo('create-course');
    const input = document.getElementById('createCourseInput');
    if (input) input.value = topic;
    this.openPersonalizationModal(topic);
  }

  async executeCourseCreation(topic, customStructure = null, ragContext = null) {
    const cleanTopic = String(topic || '').trim();
    if (!cleanTopic) {
      this.showToast('Please enter a topic you want to learn.');
      return;
    }

    const submitBtn = document.getElementById('submitCreateCourseBtn');
    const createNowBtn = document.getElementById('btnConfirmPersonalizationCreate');
    const genStatus = document.getElementById('persGeneratingStatus');
    const origText = submitBtn ? submitBtn.innerHTML : '<span class="create-btn-icon">📖</span><span>Create Course</span>';

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳ Generating...</span>';
    }
    if (createNowBtn) {
      createNowBtn.disabled = true;
      createNowBtn.textContent = 'Generating...';
    }
    if (genStatus) {
      genStatus.style.display = 'flex';
    }

    const extraOpts = this.collectCreateCourseOptions();
    this.showToast(`AI Engine: Designing curriculum for "${extraOpts.customTitle || cleanTopic}"...`);

    try {
      const structure = customStructure || await window.tutorAIEngine.generateCourseStructure(
        cleanTopic,
        extraOpts.learnerLevel,
        extraOpts.learningOutcomes || 'mastery',
        ragContext || this.activeRagContext,
        extraOpts
      );

      // Persist new Course, Modules, and Lessons into Realm DB
      const courseId = 'course_' + Math.random().toString(36).substr(2, 8);
      let firstLessonId = null;
      const activeProv = window.tutorAIEngine.getActiveProviderSummary();
      let newCourseObj = null;
      const cloudModulesPayload = [];

      window.realmDB.write(() => {
        newCourseObj = window.realmDB.create('Course', {
          id: courseId,
          userId: this.currentUser?.id || 'usr_default_learner',
          sourceDocumentId: ragContext ? ragContext.id : (this.activeRagContext ? this.activeRagContext.id : null),
          title: extraOpts.customTitle || structure.courseTitle || cleanTopic,
          topicPrompt: cleanTopic,
          learningGoal: extraOpts.personalized ? `Personalized (${extraOpts.learningStyle})` : 'Generic',
          learnerLevel: extraOpts.learnerLevel || 'intermediate',
          language: structure.language || (/[\u0600-\u06FF]/.test(cleanTopic) ? 'Arabic (العربية)' : 'English'),
          description: structure.courseDescription || `Comprehensive curriculum on ${cleanTopic}.`,
          providerId: activeProv?.id || 'system_gemini',
          providerName: activeProv?.name || 'AI Engine',
          modelId: activeProv?.modelId || '',
          isPublicFeatured: false,
          status: 'active',
          progressPercentage: 0.0,
          createdAt: new Date().toISOString()
        });

        if (this.currentUser) {
          this.currentUser.coursesGeneratedCount = (this.currentUser.coursesGeneratedCount || 0) + 1;
        }

        (structure.modules || []).forEach((mod, modIdx) => {
          const modId = `mod_${courseId}_${modIdx + 1}`;
          const mTitle = mod.title || mod.moduleTitle || `Module ${modIdx + 1}`;
          const mSummary = mod.summary || mod.moduleSummary || '';

          window.realmDB.create('Module', {
            id: modId,
            courseId: courseId,
            orderIndex: mod.orderIndex || (modIdx + 1),
            title: mTitle,
            summary: mSummary
          });

          const cloudLessons = [];

          (mod.lessons || []).forEach((les, lesIdx) => {
            const lesId = `les_${modId}_${lesIdx + 1}`;
            const rawTitle = typeof les === 'string' ? les : (les.title || les.lessonTitle || `Lesson ${lesIdx + 1}`);
            const hasNumPrefix = /^\d+\.\d+/.test(rawTitle.trim());
            const lTitle = hasNumPrefix ? rawTitle.trim() : `${modIdx + 1}.${lesIdx + 1} ${rawTitle.trim()}`;
            if (!firstLessonId) firstLessonId = lesId;

            const isFirst = (modIdx === 0 && lesIdx === 0);
            const initialMarkdown = isFirst ? (structure.firstLessonContent || '') : '';
            const initialSimplified = isFirst ? (structure.firstLessonSimplified || null) : null;
            const initialExamples = isFirst ? (structure.firstLessonExamples || null) : null;

            window.realmDB.create('Lesson', {
              id: lesId,
              moduleId: modId,
              orderIndex: les.orderIndex || (lesIdx + 1),
              title: lTitle,
              contentMarkdown: initialMarkdown,
              simplifiedMarkdown: initialSimplified,
              examplesMarkdown: initialExamples,
              audioUrl: null,
              generationStatus: initialMarkdown ? 'completed' : 'pending',
              isCompleted: false,
              completedAt: null
            });

            if (isFirst && Array.isArray(structure.firstLessonQuiz) && structure.firstLessonQuiz.length > 0) {
              window.realmDB.create('LessonQuiz', {
                id: 'quiz_' + lesId,
                lessonId: lesId,
                questionsJson: JSON.stringify(structure.firstLessonQuiz),
                userScore: null,
                completedAt: null
              });
            }

            cloudLessons.push({
              lesId,
              orderIndex: les.orderIndex || (lesIdx + 1),
              title: lTitle,
              contentMarkdown: initialMarkdown
            });
          });

          cloudModulesPayload.push({
            modId,
            orderIndex: mod.orderIndex || (modIdx + 1),
            title: mTitle,
            summary: mSummary,
            lessons: cloudLessons
          });
        });
      });

      // Sync to Firebase Firestore if user is signed in
      if (window.firebaseBridge && window.firebaseBridge.currentUser && newCourseObj) {
        window.firebaseBridge.syncCourseBundle(newCourseObj, cloudModulesPayload).catch(console.error);
      }

      document.getElementById('personalizationModal')?.classList.remove('open');
      this.currentCourseId = courseId;
      this.currentLessonId = firstLessonId;
      // Show Course Overview / Modules Landing Screen first (matching 0916d856.jpg)
      this.courseViewMode = 'overview';
      this.showToast(`Course "${newCourseObj?.title || cleanTopic}" created!`);
      this.navigateTo('course');
    } catch (err) {
      this.showToast(`Course generation error: ${err.message}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }
      if (createNowBtn) {
        createNowBtn.disabled = false;
        createNowBtn.textContent = 'Create Now';
      }
      if (genStatus) {
        genStatus.style.display = 'none';
      }
    }
  }

  openRagModal() {
    const modal = document.getElementById('ragModal');
    if (modal) modal.classList.add('open');

    const fileInput = document.getElementById('ragFileInput');
    const uploadArea = document.getElementById('ragUploadArea');
    const startRagBtn = document.getElementById('startRagCourseBtn');
    const fileNameDisplay = document.getElementById('ragFileNameDisplay');

    let selectedFile = null;
    let extractedFileText = '';

    if (uploadArea && fileInput) {
      uploadArea.onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          selectedFile = e.target.files[0];
          if (fileNameDisplay) {
            fileNameDisplay.innerText = `Selected: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`;
          }
          const reader = new FileReader();
          reader.onload = () => {
            extractedFileText = String(reader.result || '').slice(0, 12000);
          };
          reader.readAsText(selectedFile);
        }
      };
    }

    if (startRagBtn) {
      startRagBtn.onclick = () => {
        const docName = selectedFile ? selectedFile.name : 'Uploaded_Lecture_Notes.txt';
        const topicName = docName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const docId = 'doc_' + Date.now();

        window.realmDB.write(() => {
          window.realmDB.create('SourceDocument', {
            id: docId,
            userId: this.currentUser?.id || 'usr_default_learner',
            fileName: docName,
            fileType: 'txt',
            fileSizeBytes: selectedFile ? selectedFile.size : 24500,
            extractedText: extractedFileText || `Grounded syllabus and lecture notes for ${topicName}.`,
            processingStatus: 'ready',
            uploadedAt: new Date().toISOString()
          });
        });

        modal?.classList.remove('open');
        this.executeCourseCreation(topicName, null, {
          id: docId,
          fileName: docName,
          extractedText: extractedFileText || `Grounded syllabus and lecture notes for ${topicName}.`
        });
      };
    }
  }

  async openStructureModal(topic) {
    const modal = document.getElementById('structureModal');
    const treeContainer = document.getElementById('structureModulesTree');
    const confirmBtn = document.getElementById('confirmStructureBuildBtn');
    if (!modal || !treeContainer) return;

    modal.classList.add('open');
    treeContainer.innerHTML = '<p style="color: #64748B;">⏳ AI Architect is drafting editable module outline...</p>';

    try {
      const structure = await window.tutorAIEngine.generateCourseStructure(topic);

      treeContainer.innerHTML = (structure.modules || []).map((m, idx) => `
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <label style="font-size: 0.78rem; font-weight: 700; color: var(--primary);">MODULE ${idx + 1}</label>
          <input type="text" class="struct-mod-input" data-mod-idx="${idx}" value="${this.escapeHtml(m.title || m.moduleTitle)}" style="width: 100%; padding: 8px; margin-top: 4px; font-weight: 600;">
          <div style="font-size: 0.82rem; color: #64748B; margin-top: 6px;">
            Lessons: ${(m.lessons || []).map(l => this.escapeHtml(typeof l === 'string' ? l : (l.title || l.lessonTitle))).join(' • ')}
          </div>
        </div>
      `).join('');

      if (confirmBtn) {
        confirmBtn.onclick = () => {
          document.querySelectorAll('.struct-mod-input').forEach(inp => {
            const idx = parseInt(inp.getAttribute('data-mod-idx'), 10);
            if (structure.modules[idx]) {
              structure.modules[idx].title = inp.value;
              structure.modules[idx].moduleTitle = inp.value;
            }
          });
          modal.classList.remove('open');
          this.executeCourseCreation(topic, structure);
        };
      }
    } catch (err) {
      treeContainer.innerHTML = `<p style="color: #DC2626;">⚠️ Failed to draft structure: ${this.escapeHtml(err.message)}</p>`;
    }
  }

  // ==========================================================================
  // 6. Course Overview & Interactive Lesson Workspace (Screen 3: #view-course)
  // ==========================================================================
  setCourseViewMode(mode) {
    this.courseViewMode = mode === 'overview' ? 'overview' : 'lesson';
    const overviewEl = document.getElementById('courseOverviewContainer');
    const lessonEl = document.getElementById('lessonStudyContainer');
    if (this.courseViewMode === 'overview') {
      if (overviewEl) overviewEl.style.display = 'block';
      if (lessonEl) lessonEl.style.display = 'none';
      this.renderCourseOverviewScreen();
    } else {
      if (overviewEl) overviewEl.style.display = 'none';
      if (lessonEl) lessonEl.style.display = 'flex';
      this.renderCourseWorkspace();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderCourseOverviewScreen() {
    const course = window.realmDB.objects('Course').find(c => c.id === this.currentCourseId)
      || window.realmDB.objects('Course').items[0];
    if (!course) return;

    const badgeEl = document.getElementById('courseOverviewTypeBadge');
    const titleEl = document.getElementById('courseOverviewTitle');
    const descEl = document.getElementById('courseOverviewDesc');
    const pctEl = document.getElementById('overviewProgressPercent');
    const fillEl = document.getElementById('overviewProgressFill');
    const modListEl = document.getElementById('courseOverviewModulesList');

    const isPersonalized = String(course.learningGoal || '').toLowerCase().includes('personalized');
    if (badgeEl) {
      badgeEl.textContent = isPersonalized ? 'Personalized' : 'Generic';
      badgeEl.classList.toggle('personalized', isPersonalized);
    }
    if (titleEl) titleEl.textContent = course.title;
    if (descEl) descEl.textContent = course.description || `Comprehensive structured curriculum on ${course.title}.`;

    const progress = Math.round(course.progressPercentage || 0);
    if (pctEl) pctEl.textContent = `${progress}% complete`;
    if (fillEl) fillEl.style.width = `${progress}%`;

    if (!modListEl) return;
    const modules = window.realmDB.objects('Module').filtered(m => m.courseId === course.id);
    modules.sort((a, b) => a.orderIndex - b.orderIndex);

    modListEl.innerHTML = modules.map((mod, idx) => {
      const lessons = window.realmDB.objects('Lesson').filtered(l => l.moduleId === mod.id);
      lessons.sort((a, b) => a.orderIndex - b.orderIndex);
      const cleanModTitle = String(mod.title || '').replace(/^(Module\s+\d+[:.-]?\s*|\d+\.\s*)/i, '').trim() || mod.title;
      const firstLessonId = lessons[0]?.id || '';

      return `
        <div class="overview-module-card">
          <h3 class="overview-module-title">${idx + 1}. ${this.escapeHtml(cleanModTitle)}</h3>
          <p class="overview-module-desc">${this.escapeHtml(mod.summary || `Explore key principles, formal analysis, and applied exercises in ${cleanModTitle}.`)}</p>
          <div class="overview-module-lessons-pills">
            ${lessons.map(les => `
              <div class="overview-lesson-mini-item" data-open-lesson="${les.id}">
                <span>${this.escapeHtml(les.title)}</span>
                <span style="color: ${les.isCompleted ? '#16A34A' : '#94A3B8'}; font-weight: 800;">${les.isCompleted ? '✓' : '→'}</span>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn-start-module" data-start-lesson="${firstLessonId}">
            Start Module
          </button>
        </div>
      `;
    }).join('');

    modListEl.querySelectorAll('[data-start-lesson]').forEach(btn => {
      btn.addEventListener('click', () => {
        const lId = btn.getAttribute('data-start-lesson');
        if (lId) this.currentLessonId = lId;
        this.setCourseViewMode('lesson');
      });
    });

    modListEl.querySelectorAll('[data-open-lesson]').forEach(item => {
      item.addEventListener('click', () => {
        const lId = item.getAttribute('data-open-lesson');
        if (lId) this.currentLessonId = lId;
        this.setCourseViewMode('lesson');
      });
    });
  }

  renderCourseWorkspace() {
    const course = window.realmDB.objects('Course').find(c => c.id === this.currentCourseId)
      || window.realmDB.objects('Course').items[0];

    if (!course) return;
    this.currentCourseId = course.id;

    // Ensure correct container visibility based on courseViewMode
    const overviewEl = document.getElementById('courseOverviewContainer');
    const lessonEl = document.getElementById('lessonStudyContainer');
    if (this.courseViewMode === 'overview') {
      if (overviewEl) overviewEl.style.display = 'block';
      if (lessonEl) lessonEl.style.display = 'none';
      this.renderCourseOverviewScreen();
      return;
    } else {
      if (overviewEl) overviewEl.style.display = 'none';
      if (lessonEl) lessonEl.style.display = 'flex';
    }

    // 1. Update Sidebar Header & Progress Bar
    const titleEl = document.getElementById('sidebarCourseTitle');
    const percentEl = document.getElementById('sidebarProgressPercent');
    const fillEl = document.getElementById('sidebarProgressFill');
    const mobileTitleEl = document.getElementById('mobileSidebarTitle');
    const mobilePercentEl = document.getElementById('mobileSidebarPercent');

    if (titleEl) titleEl.innerText = course.title;
    if (mobileTitleEl) mobileTitleEl.innerText = course.title;

    const progress = Math.round(course.progressPercentage || 0);
    if (percentEl) percentEl.innerText = `${progress}% complete`;
    if (mobilePercentEl) mobilePercentEl.innerText = `${progress}%`;
    if (fillEl) fillEl.style.width = `${progress}%`;

    // 2. Render Modules & Lessons Accordion List (Left Sidebar + Right Slide-Over Outline Drawer)
    const accordionContainer = document.getElementById('modulesAccordionList');
    const slideOverList = document.getElementById('slideOverOutlineList');
    if (accordionContainer) accordionContainer.innerHTML = '';
    if (slideOverList) slideOverList.innerHTML = '';

    const modules = window.realmDB.objects('Module').filtered(m => m.courseId === course.id);
    modules.sort((a, b) => a.orderIndex - b.orderIndex);

    modules.forEach((mod, modIdx) => {
      const lessons = window.realmDB.objects('Lesson').filtered(l => l.moduleId === mod.id);
      lessons.sort((a, b) => a.orderIndex - b.orderIndex);

      if (accordionContainer) {
        const groupEl = document.createElement('div');
        groupEl.className = 'accordion-module-group';
        const isCurrentModule = lessons.some(l => l.id === this.currentLessonId);

        groupEl.innerHTML = `
          <button class="module-header-btn">
            <span>▾ ${this.escapeHtml(mod.title)}</span>
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
                  <span style="flex: 1; text-align: left;">${this.escapeHtml(les.title)}</span>
                </button>
              `;
            }).join('')}
          </div>
        `;

        const headerBtn = groupEl.querySelector('.module-header-btn');
        const sublist = groupEl.querySelector('.module-lessons-sublist');
        headerBtn.addEventListener('click', () => {
          const isHidden = sublist.style.display === 'none';
          sublist.style.display = isHidden ? 'flex' : 'none';
        });

        groupEl.querySelectorAll('.lesson-nav-item').forEach(btn => {
          btn.addEventListener('click', () => {
            const lId = btn.getAttribute('data-lesson-id');
            this.loadLesson(lId);
            if (window.innerWidth <= 900) {
              document.getElementById('courseOutlineSidebar')?.classList.remove('mobile-open');
              document.getElementById('btnToggleSidebar')?.classList.remove('open');
            }
          });
        });

        accordionContainer.appendChild(groupEl);
      }

      // Populate Right Slide-Over Course Outline Drawer (Screenshot b521c888.jpg)
      if (slideOverList) {
        const modBlock = document.createElement('div');
        modBlock.className = 'slideover-mod-block';
        const cleanModTitle = String(mod.title || '').replace(/^(Module\s+\d+[:.-]?\s*)/i, '');
        modBlock.innerHTML = `
          <div class="slideover-mod-title">Module ${modIdx + 1}: ${this.escapeHtml(cleanModTitle)}</div>
          ${lessons.map((les, lesIdx) => {
            const isActive = les.id === this.currentLessonId;
            const displayTitle = /^\d+\.\d+/.test(les.title.trim()) ? les.title : `${modIdx + 1}.${lesIdx + 1} ${les.title}`;
            return `
              <div class="slideover-lesson-item ${isActive ? 'active' : ''}" data-slide-lesson-id="${les.id}">
                <span>${this.escapeHtml(displayTitle)}</span>
                ${les.isCompleted ? '<span class="slideover-check">✓</span>' : ''}
              </div>
            `;
          }).join('')}
        `;

        modBlock.querySelectorAll('[data-slide-lesson-id]').forEach(item => {
          item.addEventListener('click', () => {
            const lId = item.getAttribute('data-slide-lesson-id');
            document.getElementById('slideOverOutlineDrawer')?.classList.remove('open');
            document.getElementById('slideOverOutlineBackdrop')?.classList.remove('open');
            this.loadLesson(lId);
          });
        });

        slideOverList.appendChild(modBlock);
      }
    });

    // 3. Load active lesson content into Right Canvas
    if (!this.currentLessonId && modules[0]) {
      const firstLes = window.realmDB.objects('Lesson').find(l => l.moduleId === modules[0].id);
      if (firstLes) this.currentLessonId = firstLes.id;
    }

    if (this.currentLessonId) {
      this.loadLesson(this.currentLessonId, false);
    }
  }

  getOrderedCourseLessons(courseId) {
    const modules = window.realmDB.objects('Module').filtered(m => m.courseId === courseId);
    modules.sort((a, b) => a.orderIndex - b.orderIndex);
    const list = [];
    modules.forEach((mod, mIdx) => {
      const lessons = window.realmDB.objects('Lesson').filtered(l => l.moduleId === mod.id);
      lessons.sort((a, b) => a.orderIndex - b.orderIndex);
      lessons.forEach((les, lIdx) => {
        list.push({ lesson: les, module: mod, modNumber: mIdx + 1, lesNumber: lIdx + 1 });
      });
    });
    return list;
  }

  navigateAdjacentLesson(direction) {
    const ordered = this.getOrderedCourseLessons(this.currentCourseId);
    const idx = ordered.findIndex(item => item.lesson.id === this.currentLessonId);
    if (idx === -1) return;
    const nextItem = ordered[idx + direction];
    if (nextItem) {
      this.loadLesson(nextItem.lesson.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  updateBottomNavState(lesson) {
    const ordered = this.getOrderedCourseLessons(this.currentCourseId);
    const idx = ordered.findIndex(item => item.lesson.id === lesson?.id);
    const prevBtn = document.getElementById('btnPrevLesson');
    const nextBtn = document.getElementById('btnNextLesson');
    const markBtn = document.getElementById('btnMarkComplete');

    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx === -1 || idx >= ordered.length - 1;
    if (markBtn && lesson) {
      markBtn.classList.toggle('completed', Boolean(lesson.isCompleted));
      markBtn.textContent = lesson.isCompleted ? '✓ Completed' : 'Mark as Complete';
    }
  }

  async loadLesson(lessonId, shouldRebuildSidebar = true) {
    this.currentLessonId = lessonId;
    if (window.speechController) window.speechController.stop();

    const lesson = window.realmDB.objects('Lesson').find(l => l.id === lessonId);
    if (!lesson) return;

    const moduleObj = window.realmDB.objects('Module').find(m => m.id === lesson.moduleId);
    const courseObj = window.realmDB.objects('Course').find(c => c.id === this.currentCourseId);
    const modIndex = moduleObj?.orderIndex || 1;
    const lesIndex = lesson.orderIndex || 1;

    // Update Lesson Header & Title (Matching Screenshot 81e66467.jpg)
    const tagEl = document.getElementById('lessonModuleTag');
    const titleEl = document.getElementById('lessonTitleMain');
    const bodyEl = document.getElementById('lessonBodyMarkdown');
    const resultsPanel = document.getElementById('goDeeperResultsPanel');

    const cleanModName = String(moduleObj?.title || `Module ${modIndex}`).replace(/^(Module\s+\d+[:.-]?\s*)/i, '');
    if (tagEl) tagEl.innerText = `Module ${modIndex}: ${cleanModName}`;
    const displayLessonTitle = /^\d+\.\d+/.test(lesson.title.trim()) ? lesson.title : `${modIndex}.${lesIndex} ${lesson.title}`;
    if (titleEl) titleEl.innerText = displayLessonTitle;

    if (resultsPanel) {
      resultsPanel.classList.remove('visible');
      resultsPanel.innerHTML = '';
    }

    this.updateBottomNavState(lesson);

    // Lazy Loading Lesson Generation if contentMarkdown is empty
    if (!lesson.contentMarkdown) {
      if (bodyEl) {
        bodyEl.innerHTML = `<div style="padding: 40px; text-align: center; color: #64748B;">
          <div class="pers-spinner" style="margin: 0 auto 12px; width: 28px; height: 28px;"></div>
          <p><strong>Generating... Please wait.</strong></p>
          <p style="font-size: 0.9rem; margin-top: 4px;">Synthesizing numbered sub-sections, simplified guide, quiz, and examples for <strong>${this.escapeHtml(lesson.title)}</strong>...</p>
        </div>`;
      }

      try {
        const res = await window.tutorAIEngine.generateLessonPackage({
          courseTitle: courseObj?.title || '',
          moduleTitle: moduleObj?.title || '',
          lessonTitle: lesson.title,
          learnerLevel: courseObj?.learnerLevel || 'intermediate',
          language: courseObj?.language || '',
          moduleIndex: modIndex,
          lessonIndex: lesIndex
        });
        const pkg = res.lesson || {};
        const generatedMd = pkg.contentMarkdown || '';

        window.realmDB.write(() => {
          lesson.contentMarkdown = generatedMd;
          if (pkg.simplifiedMarkdown) lesson.simplifiedMarkdown = pkg.simplifiedMarkdown;
          if (pkg.examplesMarkdown) lesson.examplesMarkdown = pkg.examplesMarkdown;
          lesson.generationStatus = 'completed';

          if (Array.isArray(pkg.quizQuestions) && pkg.quizQuestions.length > 0) {
            const existingQ = window.realmDB.objects('LessonQuiz').find(q => q.lessonId === lesson.id);
            if (!existingQ) {
              window.realmDB.create('LessonQuiz', {
                id: 'quiz_' + lesson.id,
                lessonId: lesson.id,
                questionsJson: JSON.stringify(pkg.quizQuestions),
                userScore: null,
                completedAt: null
              });
            }
          }
        });

        if (window.firebaseBridge && window.firebaseBridge.currentUser) {
          window.firebaseBridge.syncLessonUpdate(lesson, this.currentCourseId).catch(console.error);
        }
      } catch (err) {
        if (bodyEl) {
          bodyEl.innerHTML = `<div style="padding: 24px; color: #DC2626;">⚠️ Failed to load lesson: ${this.escapeHtml(err.message)}</div>`;
        }
        return;
      }
    }

    // Render Collapsible 1.1.1 Sub-Section Cards into Content Tab
    if (bodyEl) {
      bodyEl.innerHTML = this.renderLessonSubsections(lesson.contentMarkdown, modIndex, lesIndex);
      this.bindSubsectionAccordions(bodyEl);
    }

    // Reset to Content tab when switching lessons (or refresh current tab)
    await this.switchLessonTab('content');

    if (shouldRebuildSidebar) {
      this.renderCourseWorkspace();
    }
  }

  renderLessonSubsections(markdownText, modIdx = 1, lesIdx = 1) {
    if (!markdownText) return '';
    const src = String(markdownText).replace(/\r\n/g, '\n');

    // Split by ### headings (or ## headings if no ### headings exist)
    const hasH3 = /^###\s+/m.test(src);
    const splitRegex = hasH3 ? /(?=^###\s+)/m : /(?=^##\s+)/m;
    const rawParts = src.split(splitRegex).map(p => p.trim()).filter(Boolean);

    const sections = [];
    let introBuffer = '';

    rawParts.forEach(part => {
      const headingMatch = part.match(/^(?:###|##)\s+([^\n]+)\n?([\s\S]*)$/);
      if (headingMatch) {
        const rawHeading = headingMatch[1].trim();
        const bodyMd = (headingMatch[2] || '').trim();
        sections.push({ title: rawHeading, bodyMd: introBuffer ? `${introBuffer}\n\n${bodyMd}` : bodyMd });
        introBuffer = '';
      } else {
        // Introductory text before the first heading
        const cleanIntro = part.replace(/^#\s+[^\n]+\n?/, '').trim();
        if (cleanIntro) introBuffer = cleanIntro;
      }
    });

    if (sections.length === 0) {
      return `<div class="subsection-accordion-card open">
        <button type="button" class="subsection-acc-header">
          <span class="subsection-acc-title">${modIdx}.${lesIdx}.1 Lesson Overview & Core Concepts</span>
          <span class="subsection-acc-chevron">⌃</span>
        </button>
        <div class="subsection-acc-body">${this.renderMarkdown(src)}</div>
      </div>`;
    }

    return `<div class="subsection-cards-stack">` + sections.map((sec, idx) => {
      const subNum = `${modIdx}.${lesIdx}.${idx + 1}`;
      const hasNumPrefix = /^\d+\.\d+\.\d+/.test(sec.title);
      const cleanTitle = sec.title.replace(/^\d+\.\s*/, '');
      const finalTitle = hasNumPrefix ? sec.title : `${subNum} ${cleanTitle}`;

      return `
        <div class="subsection-accordion-card open">
          <button type="button" class="subsection-acc-header">
            <span class="subsection-acc-title">${this.escapeHtml(finalTitle)}</span>
            <span class="subsection-acc-chevron">⌄</span>
          </button>
          <div class="subsection-acc-body">
            ${this.renderMarkdown(sec.bodyMd)}
          </div>
        </div>
      `;
    }).join('') + `</div>`;
  }

  bindSubsectionAccordions(container) {
    if (!container) return;
    container.querySelectorAll('.subsection-accordion-card').forEach(card => {
      const header = card.querySelector('.subsection-acc-header');
      const body = card.querySelector('.subsection-acc-body');
      header?.addEventListener('click', () => {
        const isOpen = card.classList.toggle('open');
        if (body) body.style.display = isOpen ? 'block' : 'none';
      });
    });
  }

  async switchLessonTab(tabName) {
    this.activeLessonTab = tabName;
    document.querySelectorAll('#lessonTabsBar .tutorai-tab-btn').forEach(btn => {
      const isMatch = btn.getAttribute('data-lesson-tab') === tabName;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    const panes = {
      content: document.getElementById('lessonPaneContent'),
      simplify: document.getElementById('lessonPaneSimplify'),
      quiz: document.getElementById('lessonPaneQuiz'),
      examples: document.getElementById('lessonPaneExamples')
    };

    Object.entries(panes).forEach(([key, el]) => {
      if (el) el.style.display = key === tabName ? 'block' : 'none';
    });

    const lesson = window.realmDB.objects('Lesson').find(l => l.id === this.currentLessonId);
    if (!lesson) return;
    const course = window.realmDB.objects('Course').find(c => c.id === this.currentCourseId);
    const language = course?.language || 'English';

    if (tabName === 'simplify') {
      const simplifyBody = document.getElementById('lessonTabSimplifyBody');
      if (!simplifyBody) return;
      if (!lesson.simplifiedMarkdown) {
        simplifyBody.innerHTML = `<div style="text-align: center; padding: 28px; color: #64748B;"><div class="pers-spinner" style="margin: 0 auto 10px;"></div>Simplifying lesson into clear everyday analogies...</div>`;
        try {
          const simplified = await window.tutorAIEngine.generateSimplify(lesson.contentMarkdown, lesson.title, language);
          window.realmDB.write(() => {
            lesson.simplifiedMarkdown = simplified;
          });
        } catch (e) {
          simplifyBody.innerHTML = `<div style="color: #DC2626;">⚠️ ${this.escapeHtml(e.message)}</div>`;
          return;
        }
      }
      simplifyBody.innerHTML = this.renderMarkdown(lesson.simplifiedMarkdown);
    } else if (tabName === 'quiz') {
      const quizBody = document.getElementById('lessonTabQuizBody');
      if (!quizBody) return;
      let quiz = window.realmDB.objects('LessonQuiz').find(q => q.lessonId === lesson.id);
      let questions = [];
      if (quiz && quiz.questionsJson) {
        try { questions = JSON.parse(quiz.questionsJson); } catch (_) {}
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        quizBody.innerHTML = `<div style="text-align: center; padding: 28px; color: #64748B;"><div class="pers-spinner" style="margin: 0 auto 10px;"></div>Generating comprehension quiz questions...</div>`;
        try {
          questions = await window.tutorAIEngine.generateQuiz(lesson.contentMarkdown, lesson.title, language);
          window.realmDB.write(() => {
            window.realmDB.create('LessonQuiz', {
              id: 'quiz_' + lesson.id,
              lessonId: lesson.id,
              questionsJson: JSON.stringify(questions),
              userScore: null,
              completedAt: null
            });
          });
        } catch (e) {
          quizBody.innerHTML = `<div style="color: #DC2626;">⚠️ ${this.escapeHtml(e.message)}</div>`;
          return;
        }
      }
      this.renderTutorAIQuizTab(questions, quizBody);
    } else if (tabName === 'examples') {
      const examplesBody = document.getElementById('lessonTabExamplesBody');
      if (!examplesBody) return;
      if (!lesson.examplesMarkdown) {
        examplesBody.innerHTML = `<div style="text-align: center; padding: 28px; color: #64748B;"><div class="pers-spinner" style="margin: 0 auto 10px;"></div>Generating real-world concept examples...</div>`;
        try {
          const examples = await window.tutorAIEngine.generateExamples(lesson.contentMarkdown, lesson.title, language);
          window.realmDB.write(() => {
            lesson.examplesMarkdown = examples;
          });
        } catch (e) {
          examplesBody.innerHTML = `<div style="color: #DC2626;">⚠️ ${this.escapeHtml(e.message)}</div>`;
          return;
        }
      }
      this.renderTutorAIExamplesTab(lesson.examplesMarkdown, examplesBody);
    }
  }

  renderTutorAIQuizTab(questions, container) {
    if (!container || !Array.isArray(questions) || questions.length === 0) return;
    const letters = ['a', 'b', 'c', 'd'];

    container.innerHTML = questions.map((q, qIdx) => `
      <div class="tutorai-quiz-card" data-q-idx="${qIdx}">
        <div class="tutorai-quiz-q-title">${qIdx + 1}. ${this.escapeHtml(q.question)}</div>
        <div class="tutorai-quiz-options">
          ${(q.options || []).map((opt, oIdx) => {
            const cleanOpt = String(opt || '').replace(/^[a-dA-D][.)]\s*/, '');
            return `
              <label class="tutorai-quiz-radio-label" data-opt-idx="${oIdx}">
                <input type="radio" name="tutorai_quiz_q_${qIdx}" value="${oIdx}">
                <span><strong>${letters[oIdx] || String.fromCharCode(97 + oIdx)}.</strong> ${this.escapeHtml(cleanOpt)}</span>
              </label>
            `;
          }).join('')}
        </div>
        <div class="tutorai-quiz-feedback" id="tutoraiQuizFeedback_${qIdx}" style="display: none; margin-top: 12px; padding: 10px 14px; border-radius: 8px; font-size: 0.9rem;"></div>
      </div>
    `).join('') + `
      <div id="tutoraiQuizSummaryBanner" style="display: none; padding: 16px; border-radius: 12px; text-align: center; font-weight: 800;"></div>
      <button type="button" class="btn-submit-tutorai-quiz" id="btnSubmitTutorAIQuiz">Submit Quiz</button>
    `;

    const submitBtn = container.querySelector('#btnSubmitTutorAIQuiz');
    submitBtn?.addEventListener('click', () => {
      let correctCount = 0;
      questions.forEach((q, qIdx) => {
        const card = container.querySelector(`.tutorai-quiz-card[data-q-idx="${qIdx}"]`);
        const selectedInput = card?.querySelector(`input[name="tutorai_quiz_q_${qIdx}"]:checked`);
        const selectedIdx = selectedInput ? parseInt(selectedInput.value, 10) : -1;
        const feedbackEl = card?.querySelector(`#tutoraiQuizFeedback_${qIdx}`);

        card?.querySelectorAll('.tutorai-quiz-radio-label').forEach(lbl => {
          lbl.classList.remove('correct-choice', 'wrong-choice');
          const optIdx = parseInt(lbl.getAttribute('data-opt-idx'), 10);
          if (optIdx === q.correctIndex) {
            lbl.classList.add('correct-choice');
          } else if (optIdx === selectedIdx && selectedIdx !== q.correctIndex) {
            lbl.classList.add('wrong-choice');
          }
        });

        if (selectedIdx === q.correctIndex) {
          correctCount++;
          if (feedbackEl) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.background = '#F0FDF4';
            feedbackEl.style.color = '#166534';
            feedbackEl.innerHTML = `<strong>✓ Correct!</strong> ${this.escapeHtml(q.explanation || '')}`;
          }
        } else {
          if (feedbackEl) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.background = '#FEF2F2';
            feedbackEl.style.color = '#991B1B';
            feedbackEl.innerHTML = `<strong>✗ Correct Answer: ${(letters[q.correctIndex] || 'a').toUpperCase()}.</strong> ${this.escapeHtml(q.explanation || '')}`;
          }
        }
      });

      const summaryBanner = container.querySelector('#tutoraiQuizSummaryBanner');
      if (summaryBanner) {
        const pct = Math.round((correctCount / questions.length) * 100);
        summaryBanner.style.display = 'block';
        summaryBanner.style.background = pct >= 70 ? '#F0FDF4' : '#FEF3C7';
        summaryBanner.style.color = pct >= 70 ? '#166534' : '#92400E';
        summaryBanner.textContent = `Quiz Score: ${correctCount} / ${questions.length} (${pct}%)`;
      }
      this.showToast(`Quiz graded: ${correctCount}/${questions.length} correct!`);
    });
  }

  renderTutorAIExamplesTab(examplesMarkdown, container) {
    if (!container) return;
    const src = String(examplesMarkdown || '').replace(/\r\n/g, '\n');
    const blocks = src.split(/(?=^###\s+)/m).map(b => b.trim()).filter(Boolean);

    if (blocks.length === 0) {
      container.innerHTML = `<div class="example-concept-card"><div class="example-concept-body">${this.renderMarkdown(src)}</div></div>`;
      return;
    }

    container.innerHTML = blocks.map(block => {
      const m = block.match(/^###\s+([^\n]+)\n?([\s\S]*)$/);
      if (!m) {
        return `<div class="example-concept-card"><div class="example-concept-body">${this.renderMarkdown(block)}</div></div>`;
      }
      const rawHeading = m[1].replace(/^concept\s*:\s*/i, '').trim();
      const bodyMd = (m[2] || '').trim();
      return `
        <div class="example-concept-card">
          <div class="example-concept-label">concept</div>
          <div class="example-concept-title">${this.escapeHtml(rawHeading)}</div>
          <div class="example-concept-body">${this.renderMarkdown(bodyMd)}</div>
        </div>
      `;
    }).join('');
  }

  renderKeyTakeawaysCard() {
    const lesson = window.realmDB.objects('Lesson').find(l => l.id === this.currentLessonId);
    const resultsPanel = document.getElementById('goDeeperResultsPanel');
    if (!lesson || !resultsPanel) return;

    const headings = [];
    String(lesson.contentMarkdown || '').replace(/^###\s+([^\n]+)$/gm, (_, h) => {
      headings.push(h.trim());
      return '';
    });

    resultsPanel.classList.add('visible');
    resultsPanel.innerHTML = `
      <div style="background: #FFF9F7; border: 1px solid rgba(249, 87, 56, 0.3); border-radius: 14px; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h4 style="color: var(--navy); font-weight: 800;">☍ Lesson Concept Map & Key Architecture</h4>
          <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" onclick="document.getElementById('goDeeperResultsPanel').classList.remove('visible'); document.getElementById('goDeeperResultsPanel').innerHTML='';">Close</button>
        </div>
        <p style="font-size: 0.9rem; color: var(--slate); margin-bottom: 12px;">Core structural progression for <strong>${this.escapeHtml(lesson.title)}</strong>:</p>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(headings.length > 0 ? headings : ['1. Foundational Definition', '2. Core Mechanisms', '3. Applied Analysis', '4. Practical Implementation']).map((h, i) => `
            <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-weight: 700; color: var(--navy); font-size: 0.9rem;">
              <span style="color: var(--primary); margin-right: 8px;">●</span> ${this.escapeHtml(h)}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ==========================================================================
  // 8. Go Deeper Actions (Simplify, Examples, Quiz, Flashcards, Chat)
  // ==========================================================================
  async handleGoDeeper(action) {
    if (action === 'simplify' || action === 'examples' || action === 'quiz') {
      await this.switchLessonTab(action);
      return;
    }

    const lesson = window.realmDB.objects('Lesson').find(l => l.id === this.currentLessonId);
    if (!lesson) return;
    const course = window.realmDB.objects('Course').find(c => c.id === this.currentCourseId);
    const language = course?.language || 'English';

    const resultsPanel = document.getElementById('goDeeperResultsPanel');
    if (!resultsPanel) return;

    resultsPanel.classList.add('visible');
    resultsPanel.innerHTML = `<div style="text-align: center; color: #64748B; padding: 20px;">⏳ Generating ${action} for "${this.escapeHtml(lesson.title)}"...</div>`;

    try {
      if (action === 'flashcards') {
        const cards = await window.tutorAIEngine.generateFlashcardsForLesson(lesson.title, lesson.contentMarkdown, language);
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
            <h4 style="color: #16A34A; margin-bottom: 8px;">✓ ${createdCards.length} Flashcards Generated & Added!</h4>
            <p style="color: #64748B; font-size: 0.92rem; margin-bottom: 16px;">These cards have been scheduled into your personal Spaced Repetition deck.</p>
            <button class="btn-primary" onclick="window.tutorApp.navigateTo('flashcards')">Go to Flashcards Review</button>
          </div>
        `;
        this.showToast('Flashcards generated and added to Spaced Repetition queue!');
      }
    } catch (err) {
      resultsPanel.innerHTML = `<div style="color: #DC2626; padding: 16px;">⚠️ Action failed: ${this.escapeHtml(err.message)}</div>`;
    }
  }

  renderInlineQuizWidget(questions, container = null) {
    const target = container || document.getElementById('lessonTabQuizBody');
    if (target) {
      this.renderTutorAIQuizTab(questions, target);
    }
  }

  markCurrentLessonComplete() {
    const lesson = window.realmDB.objects('Lesson').find(l => l.id === this.currentLessonId);
    if (!lesson) return;

    window.realmDB.write(() => {
      lesson.isCompleted = true;
      lesson.completedAt = new Date().toISOString();

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

    this.updateBottomNavState(lesson);
    this.showToast('Lesson marked complete! Progress updated.');
    this.renderCourseWorkspace();
  }

  // ==========================================================================
  // 9. Contextual Chat Drawer
  // ==========================================================================
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

    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg user';
    userMsg.innerText = text;
    scrollBox.appendChild(userMsg);
    scrollBox.scrollTop = scrollBox.scrollHeight;

    const botMsg = document.createElement('div');
    botMsg.className = 'chat-msg bot';
    botMsg.innerText = 'Thinking...';
    scrollBox.appendChild(botMsg);
    scrollBox.scrollTop = scrollBox.scrollHeight;

    try {
      const lesson = window.realmDB.objects('Lesson').find(l => l.id === this.currentLessonId);
      const reply = await window.tutorAIEngine.answerLessonQuestion(
        text,
        lesson?.title || 'Lesson',
        lesson?.contentMarkdown || ''
      );
      botMsg.innerHTML = this.renderMarkdown(reply);
    } catch (err) {
      botMsg.innerHTML = `<span style="color: #DC2626;">Error: ${this.escapeHtml(err.message)}</span>`;
    }
    scrollBox.scrollTop = scrollBox.scrollHeight;
  }

  // ==========================================================================
  // 10. Multimodal AI Math Solver (#view-ai-math-solver)
  // ==========================================================================
  async handleSolveMath(equation, imageBase64 = null, imageMimeType = null) {
    if (!equation && !imageBase64) {
      this.showToast('Please type an equation or upload a photo.');
      return;
    }

    const panel = document.getElementById('mathSolutionPanel');
    if (!panel) return;

    panel.classList.add('visible');
    panel.innerHTML = `<div style="text-align: center; color: #64748B; padding: 40px;">
      <div style="font-size: 1.8rem; color: #4F46E5; margin-bottom: 12px;">✦</div>
      <p>Analyzing mathematical expression & formulating verified step-by-step solution...</p>
    </div>`;

    try {
      const solution = await window.tutorAIEngine.solveMathProblem(equation, imageBase64, imageMimeType);

      const solId = 'sol_' + Date.now();
      window.realmDB.write(() => {
        window.realmDB.create('HomeworkSolution', {
          id: solId,
          userId: this.currentUser?.id || 'usr_default_learner',
          toolType: 'math_solver',
          inputText: equation || 'Uploaded Math Image',
          inputImageUrl: null,
          extractedLatex: solution.recognizedLatex,
          subjectCategory: solution.domain,
          stepsJson: JSON.stringify(solution.steps),
          finalAnswer: solution.finalAnswer,
          createdAt: new Date().toISOString()
        });
      });

      panel.innerHTML = `
        <div class="math-problem-headline">
          Problem: <span>${this.escapeHtml(solution.recognizedLatex)}</span>
          <span style="float: right; font-size: 0.8rem; background: #EEF2FF; color: #4F46E5; padding: 2px 8px; border-radius: 4px;">${this.escapeHtml(solution.domain)}</span>
        </div>
        <div class="math-steps-list">
          ${(solution.steps || []).map(s => `
            <div class="math-step-card">
              <div class="step-badge">${s.stepNumber < 10 ? '0' + s.stepNumber : s.stepNumber}</div>
              <div class="step-content-box">
                <h4>${this.escapeHtml(s.stepTitle)}</h4>
                <div class="step-math-expr">${this.escapeHtml(s.mathExpression)}</div>
                <div class="step-explanation">${this.escapeHtml(s.explanation)}</div>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="final-answer-callout">
          <span class="label">✓ Final Answer:</span>
          <span class="value">${this.escapeHtml(solution.finalAnswer)}</span>
        </div>
      `;
      this.showToast('Mathematical solution verified and rendered.');
    } catch (err) {
      panel.innerHTML = `<div style="color: #DC2626; padding: 20px;">⚠️ Math Solver Error: ${this.escapeHtml(err.message)}</div>`;
    }
  }

  // ==========================================================================
  // 11. Flashcards & SM-2 Spaced Repetition (#view-flashcards)
  // ==========================================================================
  getUserFlashcards() {
    const uid = this.currentUser?.id || 'usr_default_learner';
    const all = window.realmDB.objects('Flashcard').items;
    const filtered = all.filter(fc => fc.userId === uid || (uid === 'usr_default_learner' && !fc.userId));
    return filtered.length > 0 ? filtered : all;
  }

  initFlashcardsView() {
    this.flashcardsQueue = this.getUserFlashcards();
    this.currentFlashcardIndex = 0;
    this.isCardFlipped = false;
    this.renderFlashcardStats();
    this.renderCurrentFlashcard();
  }

  renderFlashcardStats() {
    const all = this.getUserFlashcards();
    const now = new Date();

    const dueToday = all.filter(c => new Date(c.nextReviewAt) <= now).length;
    const mastered = all.filter(c => c.repetitions >= 2 && c.easinessFactor >= 2.5).length;
    const retention = all.length > 0 ? Math.round((mastered / all.length) * 100) : 100;

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
      if (promptText) promptText.innerText = 'No flashcards in your deck yet.';
      if (answerText) answerText.innerText = 'Generate flashcards from any course lesson using the Flashcards button!';
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

  // ==========================================================================
  // 12. Homeworkify & Writing Coach (#view-homeworkify)
  // ==========================================================================
  async handleSolveHomework() {
    const input = document.getElementById('homeworkQuestionInput');
    const resultBox = document.getElementById('homeworkResultBox');
    if (!input || !resultBox) return;

    const val = input.value.trim();
    if (!val) {
      this.showToast('Please type your homework question.');
      return;
    }

    resultBox.innerHTML = '<p style="color: #64748B;">⏳ Analyzing assignment question and formulating step-by-step pedagogical reasoning...</p>';
    try {
      const solution = await window.tutorAIEngine.solveHomework(val);
      resultBox.innerHTML = `
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px;">
          <h4 style="color: #0F172A; margin-bottom: 12px;">${this.escapeHtml(solution.guidance)}</h4>
          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
            ${(solution.steps || []).map(s => `
              <div style="background: #F8FAFC; border-left: 3px solid #4F46E5; padding: 12px 16px; border-radius: 4px;">
                <strong style="color: #0F172A;">${this.escapeHtml(s.title)}</strong>
                <p style="color: #475569; font-size: 0.92rem; margin-top: 4px;">${this.escapeHtml(s.detail)}</p>
              </div>
            `).join('')}
          </div>
          <div style="background: #FEF3C7; border: 1px solid #FDE68A; padding: 14px 18px; border-radius: 8px; color: #92400E;">
            <strong>💡 Comprehension Check:</strong> ${this.escapeHtml(solution.comprehensionQuestion)}
          </div>
        </div>
      `;
    } catch (err) {
      resultBox.innerHTML = `<div style="color: #DC2626;">⚠️ Error: ${this.escapeHtml(err.message)}</div>`;
    }
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

    resultBox.innerHTML = '<p style="color: #64748B;">⏳ Reviewing clarity, structure, academic tone, and grammar...</p>';
    try {
      const review = await window.tutorAIEngine.reviewWriting(val);
      resultBox.innerHTML = `
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid #E2E8F0; padding-bottom: 12px;">
            <div>
              <h3 style="color: #0F172A;">Writing Assessment</h3>
              <span style="font-size: 0.85rem; color: #64748B;">Words: ${review.wordCount} | Level: ${this.escapeHtml(review.readabilityGrade)}</span>
            </div>
            <div style="font-size: 2rem; font-weight: 800; color: #16A34A;">${review.overallScore}/100</div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px;">
            <div style="background: #F8FAFC; padding: 10px 14px; border-radius: 8px;"><strong>Clarity:</strong> ${this.escapeHtml(review.metrics?.clarity || '')}</div>
            <div style="background: #F8FAFC; padding: 10px 14px; border-radius: 8px;"><strong>Structure:</strong> ${this.escapeHtml(review.metrics?.structure || '')}</div>
            <div style="background: #F8FAFC; padding: 10px 14px; border-radius: 8px;"><strong>Tone:</strong> ${this.escapeHtml(review.metrics?.tone || '')}</div>
            <div style="background: #F8FAFC; padding: 10px 14px; border-radius: 8px;"><strong>Grammar:</strong> ${this.escapeHtml(review.metrics?.grammar || '')}</div>
          </div>
          <div style="margin-bottom: 14px;">
            <strong style="color: #16A34A;">Strengths:</strong>
            <ul style="margin: 6px 0 0 20px; font-size: 0.9rem; color: #334155;">
              ${(review.strengths || []).map(s => `<li>${this.escapeHtml(s)}</li>`).join('')}
            </ul>
          </div>
          <div>
            <strong style="color: #D97706;">Actionable Suggestions:</strong>
            <ul style="margin: 6px 0 0 20px; font-size: 0.9rem; color: #334155;">
              ${(review.suggestions || []).map(s => `<li>${this.escapeHtml(s)}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
    } catch (err) {
      resultBox.innerHTML = `<div style="color: #DC2626;">⚠️ Error: ${this.escapeHtml(err.message)}</div>`;
    }
  }

  // ==========================================================================
  // 13. Library, Profile, Info Modals & Course Export
  // ==========================================================================
  viewCourseById(courseId) {
    this.currentCourseId = courseId;
    this.currentLessonId = null;
    this.courseViewMode = 'overview';
    this.navigateTo('course');
  }

  getUserCourses() {
    const uid = this.currentUser?.id || 'usr_default_learner';
    const all = window.realmDB.objects('Course').items;
    return all.filter(c => c.userId === uid || (uid === 'usr_default_learner' && c.isPublicFeatured));
  }

  renderLibraryView() {
    const container = document.getElementById('myCoursesGrid');
    if (!container) return;
    container.innerHTML = '';

    const courses = this.getUserCourses();
    if (courses.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; background: #FFFFFF; border: 1px solid var(--border); border-radius: 16px; padding: 40px; text-align: center;">
          <h3 style="color: var(--navy); margin-bottom: 8px;">Your Personal Course Library is Empty</h3>
          <p style="color: var(--slate-light); margin-bottom: 20px;">Create your first custom AI course or explore the 9 Free Curated Starter Courses.</p>
          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <button class="btn-primary" onclick="window.tutorApp.navigateTo('create-course')">+ Create AI Course</button>
            <button class="btn-secondary" onclick="window.tutorApp.navigateTo('free-online-courses')">Explore Starter Courses</button>
          </div>
        </div>
      `;
      return;
    }

    courses.forEach(c => {
      const card = document.createElement('div');
      card.className = 'free-course-card';
      const progress = Math.round(c.progressPercentage || 0);
      const isDraft = c.status === 'draft';

      card.innerHTML = `
        <div class="course-card-banner banner-ai" style="position: relative;">
          <span>📚</span>
          <span style="position: absolute; top: 10px; right: 10px; font-size: 0.7rem; font-weight: 800; padding: 3px 8px; border-radius: 999px; background: ${isDraft ? '#FEF3C7' : 'rgba(255,255,255,0.9)'}; color: ${isDraft ? '#92400E' : '#4F46E5'};">
            ${isDraft ? 'DRAFT' : (c.learnerLevel || 'COURSE').toUpperCase()}
          </span>
        </div>
        <div class="course-card-content">
          <div class="course-card-title">${this.escapeHtml(c.title)}</div>
          <div class="course-card-desc">${this.escapeHtml(c.description || c.topicPrompt)}</div>
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
            <button class="btn-primary" style="flex: 1;" onclick="window.tutorApp.viewCourseById('${c.id}')">Open Course</button>
            <button class="btn-secondary" onclick="window.tutorApp.exportCourse('${c.id}')" title="Export Course JSON">💾</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  renderProfileView() {
    if (!this.currentUser) return;
    const myCourses = this.getUserCourses();
    const activeProv = window.tutorAIEngine.getActiveProviderSummary();

    const nameEl = document.getElementById('profileUserName');
    const emailEl = document.getElementById('profileUserEmail');
    const idBadge = document.getElementById('profileUserIdBadge');
    const countEl = document.getElementById('profileCoursesGenerated');
    const provEl = document.getElementById('profileActiveProviderName');

    if (nameEl) nameEl.innerText = this.currentUser.fullName || 'Learner';
    if (emailEl) emailEl.innerText = this.currentUser.email || 'learner@tutorai.me';
    if (idBadge) idBadge.innerText = `Workspace ID: ${this.currentUser.id}`;
    if (countEl) countEl.innerText = myCourses.length;
    if (provEl) provEl.innerText = activeProv ? `${activeProv.name} (${activeProv.modelId})` : 'Not Configured';
  }

  openInfoModal(topic) {
    const modal = document.getElementById('infoModal');
    const titleEl = document.getElementById('infoModalTitle');
    const bodyEl = document.getElementById('infoModalBody');
    if (!modal || !titleEl || !bodyEl) return;

    const infoMap = {
      about: {
        title: 'About TutorAI Generative Learning Platform',
        body: `<p>TutorAI is an open-access AI-powered course creation and interactive learning platform. It enables students, educators, and lifelong learners to connect their preferred Large Language Model provider and transform any subject or reference document into a structured, step-by-step curriculum complete with exercises, factual verification notes, quizzes, and SM-2 spaced repetition flashcards.</p>`
      },
      security: {
        title: 'API Key Security & Encryption Architecture',
        body: `<p><strong>1. Server-Side AES-256-GCM Encryption:</strong> All user-supplied API keys are encrypted at rest on the backend server using AES-256-GCM authenticated encryption derived via scrypt.</p>
               <p style="margin-top: 8px;"><strong>2. Zero Plaintext Exposure:</strong> After saving, plaintext API keys are never returned to the frontend browser—only a masked preview (e.g., <code>sk-o••••••••9a2f</code>) is displayed.</p>
               <p style="margin-top: 8px;"><strong>3. Automatic Log Redaction:</strong> Error handlers automatically scrub API keys and token patterns before returning diagnostic messages.</p>`
      },
      privacy: {
        title: 'Privacy & Multi-User Workspace Isolation',
        body: `<p>Every user account on TutorAI operates within an isolated workspace scoped by their unique user ID. Your custom courses, lesson edits, progress percentages, flashcards, and encrypted API provider configurations are strictly segregated from other users.</p>`
      },
      integrity: {
        title: 'Factual Accuracy & Pedagogical Integrity',
        body: `<p>TutorAI enforces strict pedagogical prompts that require clear definitions, verifiable examples, explicit reasoning steps, and cross-lesson consistency checks—preventing repetitive filler content and unverified claims.</p>`
      },
      terms: {
        title: 'Terms of Use & Open-Access Policy',
        body: `<p>TutorAI is provided 100% free of charge during the current release stage. Users connecting external third-party API keys (OpenRouter, OpenAI, Google Gemini, Anthropic, etc.) are responsible for any token usage charges billed directly by their chosen external provider.</p>`
      }
    };

    const content = infoMap[topic] || infoMap.about;
    titleEl.textContent = content.title;
    bodyEl.innerHTML = content.body;
    modal.classList.add('open');
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

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${course.title.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Course exported as JSON file.');
  }

  // ==========================================================================
  // 14. Markdown Formatter & Helpers
  // ==========================================================================
  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  renderMarkdown(text) {
    if (!text) return '';
    let src = String(text).replace(/\r\n/g, '\n');

    // 1. Extract fenced code blocks to protect them from inline regexes
    const codeBlocks = [];
    src = src.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      const escapedCode = this.escapeHtml(code.trim());
      const langBadge = lang ? `<div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #94A3B8; margin-bottom: 6px; font-family: monospace;">${this.escapeHtml(lang)}</div>` : '';
      codeBlocks.push(
        `<pre style="background: #0F172A; color: #F8FAFC; padding: 14px 16px; border-radius: 10px; overflow-x: auto; margin: 16px 0; font-family: var(--font-mono, monospace); font-size: 0.88rem; line-height: 1.6;">${langBadge}<code>${escapedCode}</code></pre>`
      );
      return `@@CODE_BLOCK_${idx}@@`;
    });

    // 2. Display math blocks $$...$$
    src = src.replace(/\$\$([^$]+)\$\$/gim, '<div style="background: #F8FAFC; padding: 12px; border-radius: 8px; font-family: monospace; text-align: center; color: #4338CA; margin: 16px 0; border: 1px solid #E2E8F0; overflow-x: auto; max-width: 100%;">$$ $1 $$</div>');

    // 3. Inline formatting
    let html = src
      .replace(/^#### (.*$)/gim, '<h4 style="margin-top: 16px; margin-bottom: 6px; color: var(--navy);">$1</h4>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`([^`\n]+)`/gim, '<code style="background: #EEF2F6; padding: 2px 6px; border-radius: 4px; font-family: monospace; word-break: break-word;">$1</code>')
      .replace(/\$([^$\n]+)\$/gim, '<span style="font-family: monospace; color: #4338CA; font-weight: 600; word-break: break-word;">$1</span>');

    // 4. Process blocks (tables, unordered lists, ordered lists, paragraphs)
    const blocks = html.split(/\n{2,}/);
    html = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';

      // Markdown table
      if (trimmed.includes('|') && trimmed.includes('---')) {
        const rows = trimmed.split('\n').filter(r => r.trim().startsWith('|'));
        if (rows.length >= 2) {
          let tableHtml = '<div class="table-responsive"><table border="1" cellpadding="8" style="width: 100%; border-collapse: collapse; margin: 16px 0; min-width: 480px;">';
          rows.forEach((row, idx) => {
            if (row.includes('---')) return;
            const cells = row.split('|').filter(c => c.trim().length > 0);
            tableHtml += '<tr>';
            cells.forEach(cell => {
              tableHtml += idx === 0
                ? `<th style="background: #F1F5F9; text-align: start; padding: 10px 12px; border-bottom: 2px solid #CBD5E1;">${cell.trim()}</th>`
                : `<td style="padding: 10px 12px; border-bottom: 1px solid #E2E8F0;">${cell.trim()}</td>`;
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</table></div>';
          return tableHtml;
        }
      }

      // Unordered list
      const lines = trimmed.split('\n');
      if (lines.every(l => /^[-*]\s+/.test(l.trim()))) {
        const items = lines.map(l => `<li style="margin-bottom: 6px;">${l.trim().replace(/^[-*]\s+/, '')}</li>`).join('');
        return `<ul style="padding-inline-start: 22px; margin: 12px 0;">${items}</ul>`;
      }

      // Ordered list
      if (lines.every(l => /^\d+\.\s+/.test(l.trim()))) {
        const items = lines.map(l => `<li style="margin-bottom: 6px;">${l.trim().replace(/^\d+\.\s+/, '')}</li>`).join('');
        return `<ol style="padding-inline-start: 22px; margin: 12px 0;">${items}</ol>`;
      }

      // Headings / blockquotes / code placeholders directly
      if (/^<(h[1-4]|blockquote|div|pre)/i.test(trimmed) || /^@@CODE_BLOCK_\d+@@$/.test(trimmed)) {
        return trimmed.replace(/\n/g, '<br>');
      }

      return `<p style="margin-bottom: 12px; line-height: 1.75;">${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // 5. Restore fenced code blocks
    codeBlocks.forEach((blockHtml, idx) => {
      html = html.replace(`@@CODE_BLOCK_${idx}@@`, blockHtml);
    });

    return html;
  }

  updateSpeechUI(state) {
    const btn = document.getElementById('btnReadAloud');
    if (!btn) return;
    if (state.isPlaying && !state.isPaused) {
      btn.classList.add('speaking', 'active');
      btn.innerHTML = '❚❚';
      btn.title = 'Pause Read Aloud';
    } else if (state.isPaused) {
      btn.classList.remove('speaking');
      btn.classList.add('active');
      btn.innerHTML = '▶';
      btn.title = 'Resume Read Aloud';
    } else {
      btn.classList.remove('speaking', 'active');
      btn.innerHTML = '🔊';
      btn.title = 'Read Aloud (Text-to-Speech)';
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
    }, 3400);
  }

  refreshAllData() {
    if (!this.currentUser) {
      this.currentUser = window.realmDB.objects('User').items[0];
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.tutorApp = new TutorAIApp();
  window.tutorApp.init();
});
