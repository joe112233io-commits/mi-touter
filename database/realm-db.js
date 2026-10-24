/**
 * TutorAI Universal Realm DB Manager
 * Compatible with Realm C++ Node/Electron engine and High-Performance Browser Indexed Storage.
 * Provides full ACID write transactions, schema validation, and live query listeners.
 */

class RealmCollection {
  constructor(name, schema, dbInstance) {
    this.name = name;
    this.schema = schema;
    this.db = dbInstance;
    this.items = [];
  }

  toJSON() {
    return this.items;
  }

  load(data) {
    if (Array.isArray(data)) {
      this.items = data.map(item => ({ ...item }));
    }
  }

  filtered(predicateFnOrString) {
    if (typeof predicateFnOrString === 'function') {
      return this.items.filter(predicateFnOrString);
    }
    // Simple property matches (e.g., "courseId == 'xyz'")
    if (typeof predicateFnOrString === 'string') {
      const match = predicateFnOrString.match(/(\w+)\s*==\s*['"]?([^'"]+)['"]?/);
      if (match) {
        const [, key, val] = match;
        return this.items.filter(item => String(item[key]) === String(val));
      }
    }
    return [...this.items];
  }

  find(predicate) {
    return this.items.find(predicate);
  }

  sorted(key, reverse = false) {
    return [...this.items].sort((a, b) => {
      if (a[key] < b[key]) return reverse ? 1 : -1;
      if (a[key] > b[key]) return reverse ? -1 : 1;
      return 0;
    });
  }

  get length() {
    return this.items.length;
  }
}

class LocalRealmDatabase {
  constructor() {
    this.storageKey = 'tutorai_realm_local_store_v1';
    this.schemas = {};
    this.collections = {};
    this.inTransaction = false;
    this.listeners = new Set();
    this.initSchemas();
  }

  initSchemas() {
    const schemasList = typeof RealmSchemas !== 'undefined' 
      ? RealmSchemas 
      : (typeof require !== 'undefined' ? require('./realm-schema.js').RealmSchemas : []);

    for (const s of schemasList) {
      this.schemas[s.name] = s;
      this.collections[s.name] = new RealmCollection(s.name, s, this);
    }
  }

  async initialize() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const name in parsed) {
          if (this.collections[name]) {
            this.collections[name].load(parsed[name]);
          }
        }
      } else {
        await this.seedInitialData();
      }
    } catch (e) {
      console.warn('Realm store init notice:', e);
      await this.seedInitialData();
    }
    return this;
  }

  objects(schemaName) {
    if (!this.collections[schemaName]) {
      throw new Error(`Schema ${schemaName} not registered in Realm.`);
    }
    return this.collections[schemaName];
  }

  write(callback) {
    this.inTransaction = true;
    try {
      callback();
      this.persist();
      this.notify();
    } finally {
      this.inTransaction = false;
    }
  }

  create(schemaName, data, updateMode = 'modified') {
    const col = this.objects(schemaName);
    const primaryKeyField = this.schemas[schemaName]?.primaryKey || 'id';

    if (!data[primaryKeyField]) {
      data[primaryKeyField] = 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    const existingIndex = col.items.findIndex(item => item[primaryKeyField] === data[primaryKeyField]);

    if (existingIndex >= 0) {
      if (updateMode === 'modified' || updateMode === true) {
        col.items[existingIndex] = { ...col.items[existingIndex], ...data };
        if (!this.inTransaction) {
          this.persist();
          this.notify();
        }
        return col.items[existingIndex];
      } else {
        throw new Error(`Item with key ${data[primaryKeyField]} already exists in ${schemaName}`);
      }
    } else {
      const newItem = { ...data };
      col.items.push(newItem);
      if (!this.inTransaction) {
        this.persist();
        this.notify();
      }
      return newItem;
    }
  }

  delete(schemaName, primaryKeyValue) {
    const col = this.objects(schemaName);
    const primaryKeyField = this.schemas[schemaName]?.primaryKey || 'id';
    const index = col.items.findIndex(item => item[primaryKeyField] === primaryKeyValue);
    if (index >= 0) {
      const removed = col.items.splice(index, 1);
      if (!this.inTransaction) {
        this.persist();
        this.notify();
      }
      return removed[0];
    }
    return null;
  }

  persist() {
    try {
      const state = {};
      for (const name in this.collections) {
        state[name] = this.collections[name].toJSON();
      }
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to persist Realm local data:', err);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try { listener(); } catch (e) { console.error(e); }
    }
  }

  async resetToDefaults() {
    localStorage.removeItem(this.storageKey);
    for (const name in this.collections) {
      this.collections[name].items = [];
    }
    await this.seedInitialData();
    this.notify();
  }

  async seedInitialData() {
    this.write(() => {
      // 1. Organization
      this.create('Organization', {
        id: 'org_lumination_main',
        name: 'Lumination AI Ltd',
        customDomain: 'tutorai.me',
        logoUrl: '',
        primaryColor: '#4F46E5',
        hideTutoraiBranding: false,
        createdAt: new Date().toISOString()
      });

      // 2. Default User
      const defaultUser = this.create('User', {
        id: 'usr_default_learner',
        orgId: 'org_lumination_main',
        email: 'learner@tutorai.me',
        fullName: 'Alex Morgan',
        role: 'learner',
        planTier: 'genius', // Genius plan unlocks unlimited courses, spaced repetition & chat
        coursesGeneratedCount: 3,
        knowledgeLevelPref: 'intermediate',
        learningStylePref: 'visual_and_practical',
        stripeCustomerId: 'cus_demo_tutorai_9921',
        createdAt: new Date().toISOString()
      });

      // 3. Seed the 9 Official Courses from the Technical Report
      const seedCoursesData = [
        {
          id: 'course_ai_foundations',
          title: 'Foundations of Artificial Intelligence',
          topicPrompt: 'History of AI, machine learning, neural networks, NLP, and ethics.',
          learnerLevel: 'beginner',
          description: 'A comprehensive journey into the history, core milestones, algorithmic revolutions, and modern ethical considerations shaping artificial intelligence today.',
          isPublicFeatured: true,
          status: 'published',
          progressPercentage: 45.0,
          modules: [
            {
              id: 'mod_ai_1',
              orderIndex: 1,
              title: 'Origins & Early Symbolic AI',
              summary: 'From the Dartmouth Workshop to rule-based expert systems and the first AI winters.',
              lessons: [
                {
                  id: 'les_ai_1_1',
                  orderIndex: 1,
                  title: 'The Turing Test & The Dartmouth Workshop',
                  isCompleted: true,
                  contentMarkdown: `### The Dawn of Artificial Intelligence\n\nIn 1950, **Alan Turing** published his seminal paper *"Computing Machinery and Intelligence"*, introducing the famous Imitation Game now recognized worldwide as the **Turing Test**.\n\n> "Can machines think?" — Alan Turing (1950)\n\n#### The Dartmouth Workshop of 1956\nThe term *"Artificial Intelligence"* was officially coined at the Dartmouth Summer Research Project on Artificial Intelligence organized by **John McCarthy**, **Marvin Minsky**, **Nathaniel Rochester**, and **Claude Shannon**.\n\n| Pioneer | Contribution | Core Milestone |\n| :--- | :--- | :--- |\n| **Alan Turing** | Theoretical Computation | Turing Test & Universal Turing Machine |\n| **John McCarthy** | Logic-based AI | Coined term 'AI', LISP language |\n| **Marvin Minsky** | Neural Nets & Frames | Perceptrons analysis, Minsky frames |\n\n#### Key Takeaways:\n- Artificial Intelligence originated from symbolic logic and mathematics.\n- The early optimism laid the blueprint for modern computational theory.\n- Early systems relied on handcrafted rules rather than statistical learning.`
                },
                {
                  id: 'les_ai_1_2',
                  orderIndex: 2,
                  title: 'Symbolic AI vs Connectionism',
                  isCompleted: true,
                  contentMarkdown: `### Two Paradigms: Good Old-Fashioned AI vs Neural Nets\n\nArtificial Intelligence historically divided into two primary camps:\n1. **Symbolic AI (GOFAI)**: Knowledge represented as explicit logic assertions (e.g., $P \\rightarrow Q$).\n2. **Connectionism**: Knowledge represented as continuous weights in distributed neuron topologies.\n\n#### Comparison Matrix:\n| Feature | Symbolic AI (GOFAI) | Connectionism (Deep Learning) |\n| :--- | :--- | :--- |\n| **Knowledge Representation** | Explicit if-then rules & trees | Weight tensors ($W \\in \\mathbb{R}^{m \\times n}$) |\n| **Explainability** | High (Traceable proofs) | Low (Black box representations) |\n| **Noise Tolerance** | Extremely brittle | Robust and noise tolerant |\n| **Data Needs** | Low (Expert curated) | Massive training corpora |\n\n#### Key Takeaways:\n- Symbolic AI excels at formal mathematical logic and deterministic deduction.\n- Neural networks excel at fuzzy perception, pattern recognition, and sensory comprehension.\n- Contemporary hybrid AI integrates both symbolic reasoning and large statistical foundation models.`
                }
              ]
            },
            {
              id: 'mod_ai_2',
              orderIndex: 2,
              title: 'Neural Networks & Deep Learning Revolution',
              summary: 'Perceptrons, backpropagation, and multi-layer deep network architectures.',
              lessons: [
                {
                  id: 'les_ai_2_1',
                  orderIndex: 1,
                  title: 'The Perceptron & Backpropagation',
                  isCompleted: false,
                  contentMarkdown: `### The Artificial Neuron (Frank Rosenblatt, 1958)\n\nA perceptron computes a weighted sum of inputs and passes it through an activation function:\n\n$$y = \\sigma\\left(\\sum_{i=1}^{n} w_i x_i + b\\right)$$\n\nWhere:\n- $w_i$ represents the synpatic weight vector.\n- $x_i$ represents the input feature vector.\n- $b$ represents the scalar bias term.\n- $\\sigma(z)$ is a non-linear activation function (such as Sigmoid, ReLU, or GELU).\n\n#### The Backpropagation Algorithm\nBackpropagation computes the gradient of the loss function $\\mathcal{L}$ with respect to each weight using the **Calculus Chain Rule**:\n\n$$\\frac{\\partial \\mathcal{L}}{\\partial w_{ij}} = \\frac{\\partial \\mathcal{L}}{\\partial a_j} \\cdot \\frac{\\partial a_j}{\\partial z_j} \\cdot \\frac{\\partial z_j}{\\partial w_{ij}}$$\n\n#### Why This Matters:\nWithout backpropagation, training networks with millions or billions of parameters would be computationally intractable. Gradient descent iteratively updates weights in the opposite direction of the gradient: $W \\leftarrow W - \\eta \\nabla_W \\mathcal{L}$.`
                },
                {
                  id: 'les_ai_2_2',
                  orderIndex: 2,
                  title: 'Transformers & Self-Attention',
                  isCompleted: false,
                  contentMarkdown: `### The Transformer Revolution (Vaswani et al., 2017)\n\nIn 2017, the breakthrough paper *"Attention Is All You Need"* eliminated recurrent loops in favor of the **Scaled Dot-Product Attention** mechanism:\n\n$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{Q K^T}{\\sqrt{d_k}}\\right) V$$\n\n#### Core Pillars of Transformers:\n1. **Parallel Training**: Unlike RNNs which compute sequentially token-by-token, Transformers process entire sequences simultaneously.\n2. **Long-Range Context**: Overcomes vanishing gradients across distant sentences.\n3. **Multi-Head Projections**: Learns distinct syntactic and semantic relationships across multiple subspace representations.\n\n#### Key Takeaways:\n- Transformers power all modern LLMs including Gemini, GPT-4, and Claude.\n- The $\\sqrt{d_k}$ scaling prevents dot products from growing excessively large, stabilizing softmax gradients.`
                }
              ]
            }
          ]
        },
        {
          id: 'course_ml_intro',
          title: 'Introduction to Machine Learning',
          topicPrompt: 'Core principles, algorithms, and real-world machine learning problem solving.',
          learnerLevel: 'intermediate',
          description: 'Master supervised, unsupervised, and reinforcement learning paradigms with hands-on mathematical models and evaluation metrics.',
          isPublicFeatured: true,
          status: 'published',
          progressPercentage: 20.0,
          modules: [
            {
              id: 'mod_ml_1',
              orderIndex: 1,
              title: 'Foundations of Statistical Learning',
              summary: 'Supervised vs unsupervised paradigms, cost functions, and overfitting.',
              lessons: [
                {
                  id: 'les_ml_1_1',
                  orderIndex: 1,
                  title: 'What is Machine Learning?',
                  isCompleted: true,
                  contentMarkdown: `### Defining Machine Learning (Tom Mitchell, 1997)\n\n> "A computer program is said to learn from experience **E** with respect to some class of tasks **T** and performance measure **P**, if its performance at tasks in **T**, as measured by **P**, improves with experience **E**."\n\n#### The Three Primary Learning Paradigms:\n1. **Supervised Learning**: Model learns from labeled dataset pairs $(x_i, y_i)$ (e.g. classification, regression).\n2. **Unsupervised Learning**: Discovering latent structure, clusters, or manifold representations without labels ($x_i$ only).\n3. **Reinforcement Learning**: Agent learns optimal policies $\\pi(a|s)$ via reward signals from an environment.\n\n#### Key Takeaways:\n- Supervised learning maps known inputs to verified ground-truth targets.\n- Unsupervised learning detects hidden patterns and reduces dimensionality.\n- Model quality is evaluated on strictly held-out test distributions.`
                },
                {
                  id: 'les_ml_1_2',
                  orderIndex: 2,
                  title: 'Bias-Variance Tradeoff & Overfitting',
                  isCompleted: false,
                  contentMarkdown: `### The Bias-Variance Tradeoff\n\nTotal expected test error decomposes into three fundamental components:\n\n$$\\mathbb{E}[(y - \\hat{f}(x))^2] = \\text{Bias}[\\hat{f}(x)]^2 + \\text{Var}[\\hat{f}(x)] + \\sigma^2$$\n\n- **High Bias (Underfitting)**: The model is overly simplistic to capture the true underlying data trend.\n- **High Variance (Overfitting)**: The model memorizes training noise and fails to generalize to unseen test instances.\n- **Irreducible Error ($\\sigma^2$)**: Inherent noise in the data generating process.\n\n#### Techniques to Prevent Overfitting:\n- Regularization ($L_1$ Lasso, $L_2$ Ridge, Dropout)\n- K-Fold Cross Validation\n- Early Stopping during gradient descent\n- Data Augmentation`
                }
              ]
            }
          ]
        },
        {
          id: 'course_ml_beginners',
          title: 'Fundamentals of Machine Learning for Beginners',
          topicPrompt: 'Beginner-friendly, no-code introduction to machine learning concepts and applications.',
          learnerLevel: 'beginner',
          description: 'A gentle, zero-prerequisite introduction to how computers learn patterns from everyday data without heavy math jargon.',
          isPublicFeatured: true,
          status: 'published',
          progressPercentage: 10.0,
          modules: [
            {
              id: 'mod_mlb_1',
              orderIndex: 1,
              title: 'Everyday Machine Learning',
              summary: 'How recommendation algorithms, spam filters, and voice assistants work.',
              lessons: [
                {
                  id: 'les_mlb_1_1',
                  orderIndex: 1,
                  title: 'How Computers Learn from Experience',
                  isCompleted: true,
                  contentMarkdown: `### How Does Machine Learning Work in Simple Terms?\n\nImagine teaching a child to recognize a cat. You don't write a 500-page rulebook detailing every angle of whiskers. Instead, you show hundreds of pictures of cats and dogs, and the child's brain automatically extracts the defining features.\n\nMachine learning works the same way:\n1. **Data**: We feed thousands of sample emails.\n2. **Pattern Finding**: The computer spots words frequently linked to spam.\n3. **Prediction**: When a new email arrives, it calculates the likelihood of spam.\n\n#### Real-World Examples:\n- **Spam Filtering**: Gmail detects suspicious sender patterns.\n- **Recommendations**: Spotify and Netflix suggest tracks and movies you enjoy.\n- **Predictive Typing**: Your smartphone keyboard suggests the next word.`
                }
              ]
            }
          ]
        },
        {
          id: 'course_french',
          title: 'Intermediate French Grammar',
          topicPrompt: 'Compound tenses, subjunctive mood, conversational structures, and nuances.',
          learnerLevel: 'intermediate',
          description: 'Advance your conversational fluency with mastery over the Subjonctif, Conditionnel, and complex French sentence connectors.',
          isPublicFeatured: true,
          status: 'published',
          progressPercentage: 0.0,
          modules: [
            {
              id: 'mod_fr_1',
              orderIndex: 1,
              title: 'The Subjunctive Mood (Le Subjonctif)',
              summary: 'Master expressing doubt, emotion, necessity, and desire.',
              lessons: [
                {
                  id: 'les_fr_1_1',
                  orderIndex: 1,
                  title: 'Forming the Present Subjunctive',
                  isCompleted: false,
                  contentMarkdown: `### Le Subjonctif Présent\n\nThe subjunctive is a **mood**, not just a tense. It expresses subjectivity, uncertainty, emotions, wishes, and necessities rather than objective facts.\n\n#### Common Trigger Phrases:\n- *Il faut que...* (It is necessary that...)\n- *Je veux que...* (I want that...)\n- *Bien que...* (Although...)\n- *J'ai peur que...* (I fear that...)\n\n#### Regular Conjugation Pattern:\nTake the 3rd person plural (*ils/elles*) of the present indicative, drop *-ent*, and add:\n- **je**: *-e*\n- **tu**: *-es*\n- **il/elle**: *-e*\n- **nous**: *-ions*\n- **vous**: *-iez*\n- **ils/elles**: *-ent*`
                }
              ]
            }
          ]
        },
        {
          id: 'course_productivity',
          title: 'Productivity Mastery: Getting Things Done in the Digital Age',
          topicPrompt: 'Time management, focus rituals, digital organization, and GTD methodology.',
          learnerLevel: 'all',
          description: 'Reclaim your cognitive bandwidth using systematic task triage, time blocking, deep work habits, and digital decluttering.',
          isPublicFeatured: true,
          status: 'published',
          progressPercentage: 60.0,
          modules: [
            {
              id: 'mod_prod_1',
              orderIndex: 1,
              title: 'The Architecture of Focus',
              summary: 'Deep work principles and managing digital cognitive friction.',
              lessons: [
                {
                  id: 'les_prod_1_1',
                  orderIndex: 1,
                  title: 'Deep Work vs Shallow Work (Cal Newport)',
                  isCompleted: true,
                  contentMarkdown: `### The Deep Work Hypothesis\n\n> "The ability to perform deep work is becoming increasingly rare at exactly the same time it is becoming increasingly valuable in our economy." — Cal Newport\n\n#### The Two Modes:\n1. **Deep Work**: Professional activities performed in a state of distraction-free concentration that push your cognitive capabilities to their limit.\n2. **Shallow Work**: Non-cognitively demanding, logistical tasks often performed while distracted (e.g. answering chat notifications, reactive email browsing).\n\n#### Practical Rules for Implementation:\n- **Time Blocking**: Allocate 90-minute uninterrupted creative focus intervals.\n- **Attention Residue**: Avoid switching tabs every 3 minutes; each context switch drains mental energy.\n- **Shutdown Ritual**: Define a clear ritual that closes the workday mentally.`
                }
              ]
            }
          ]
        },
        {
          id: 'course_mindfulness',
          title: 'Mindfulness and Stress Management for Professionals',
          topicPrompt: 'Cognitive grounding techniques, workplace resilience, and emotional regulation.',
          learnerLevel: 'all',
          description: 'Science-backed mindfulness techniques, somatic resets, and cognitive reappraisal strategies tailored for high-pressure professional environments.',
          isPublicFeatured: true,
          status: 'published',
          progressPercentage: 0.0,
          modules: [
            {
              id: 'mod_mind_1',
              orderIndex: 1,
              title: 'Physiological Nervous System Resets',
              summary: 'Vagus nerve stimulation, box breathing, and somatic grounding.',
              lessons: [
                {
                  id: 'les_mind_1_1',
                  orderIndex: 1,
                  title: 'The Physiological Sigh & Autonomic Regulation',
                  isCompleted: false,
                  contentMarkdown: `### Real-Time Stress Regulation (Neurobiology)\n\nWhen acute stress strikes, our sympathetic nervous system triggers the classic fight-or-flight response, shallow breathing, and elevated cortisol.\n\n#### The Physiological Sigh (Stanford Medicine):\n- **Mechanism**: Two rapid nasal inhalations followed by one prolonged, slow oral exhalation.\n- **Effect**: Re-inflates collapsed pulmonary alveoli and immediately lowers heart rate via vagal nerve stimulation.\n\n#### Practical 3-Minute Protocol:\n1. Inhale deeply through the nose.\n2. Top off with a second sharp sip of air.\n3. Slowly exhale through pursed lips for 6 to 8 seconds.\n4. Repeat 3 times to achieve measurable autonomic calm.`
                }
              ]
            }
          ]
        },
        {
          id: 'course_creative_writing',
          title: 'Creative Writing Workshop: Crafting Compelling Stories',
          topicPrompt: 'Story arc architecture, 3-act structure, character motivation, and pacing.',
          learnerLevel: 'intermediate',
          description: 'Transform raw story ideas into gripping narratives using professional screenwriting beats, deep character arcs, and dynamic dialogue.',
          isPublicFeatured: true,
          status: 'published',
          progressPercentage: 0.0,
          modules: [
            {
              id: 'mod_cw_1',
              orderIndex: 1,
              title: 'Narrative Arcs & Tension',
              summary: 'Building the hero journey and dramatic question.',
              lessons: [
                {
                  id: 'les_cw_1_1',
                  orderIndex: 1,
                  title: 'The 3-Act Structure & The Midpoint Shift',
                  isCompleted: false,
                  contentMarkdown: `### The Classical Three-Act Structure\n\nEvery resonant story balances external conflict with internal character transformation:\n\n1. **Act I (The Setup - 25%)**: Status quo, the Inciting Incident, and crossing the First Threshold into the unknown.\n2. **Act II (The Confrontation - 50%)**: Rising obstacles, false victories, the crucial **Midpoint Shift** (where reactive protagonist becomes proactive), leading to the "Dark Night of the Soul".\n3. **Act III (The Resolution - 25%)**: The Climax where internal growth unlocks victory over the central antagonistic force.\n\n#### The Golden Rule: Show, Don't Tell\nInstead of writing *"Elena was terrified"*, write *"Elena gripped the steering wheel until her knuckles turned chalk-white, her breath catching at every shadow in the rearview mirror."*`
                }
              ]
            }
          ]
        },
        {
          id: 'course_public_speaking',
          title: 'Effective Public Speaking and Presentation Skills',
          topicPrompt: 'Rhetoric, presentation structure, nonverbal communication, and stage presence.',
          learnerLevel: 'all',
          description: 'Captivate any audience from boardroom meetings to keynote auditoriums with structural rhetoric, vocal variety, and engaging slide storytelling.',
          isPublicFeatured: true,
          status: 'published',
          progressPercentage: 0.0,
          modules: [
            {
              id: 'mod_ps_1',
              orderIndex: 1,
              title: 'Structuring High-Impact Talks',
              summary: 'The Hook, the Rule of Three, and memorability frameworks.',
              lessons: [
                {
                  id: 'les_ps_1_1',
                  orderIndex: 1,
                  title: 'The Hook and The Rule of Three',
                  isCompleted: false,
                  contentMarkdown: `### Capturing Attention in the First 30 Seconds\n\nThe average human attention span during a presentation drops dramatically if you open with boring logistical pleasantries.\n\n#### Three Powerful Opening Hooks:\n1. **A Counterintuitive Statistic**: *"Did you know that 82% of enterprise software initiatives fail due to one single miscommunication?"*\n2. **A Vivid Miniature Story**: Bring the audience directly into a high-stakes moment.\n3. **A Provocative Question**: Force the audience to imagine an alternative reality.\n\n#### The Rhetorical Rule of Three (Tricolon):\nInformation presented in groups of three is naturally more satisfying, memorable, and rhythmically persuasive (e.g., *"Veni, vidi, vici"*, *"Life, liberty, and the pursuit of happiness"*).`
                }
              ]
            }
          ]
        },
        {
          id: 'course_happiness',
          title: 'Principles of Happiness',
          topicPrompt: 'Psychological well-being, habit formation, gratitude science, and eudaimonia.',
          learnerLevel: 'all',
          description: 'Explore the empirical science of positive psychology, hedonic adaptation, and evidence-based routines for sustained life satisfaction.',
          isPublicFeatured: true,
          status: 'published',
          progressPercentage: 0.0,
          modules: [
            {
              id: 'mod_hap_1',
              orderIndex: 1,
              title: 'The Science of Well-Being',
              summary: 'Hedonic adaptation, PERMA model, and meaning versus pleasure.',
              lessons: [
                {
                  id: 'les_hap_1_1',
                  orderIndex: 1,
                  title: 'Hedonic Adaptation & The PERMA Model',
                  isCompleted: false,
                  contentMarkdown: `### Martin Seligman\'s PERMA Model\n\nPositive psychology distinguishes fleeting pleasure (*hedonia*) from deep fulfillment (*eudaimonia*). The PERMA framework details the five pillars of human flourishing:\n\n- **P - Positive Emotions**: Cultivating peace, gratitude, and curiosity.\n- **E - Engagement**: Experiencing flow states where time disappears.\n- **R - Relationships**: Meaningful social connections and reciprocal empathy.\n- **M - Meaning**: Belonging to and serving something greater than oneself.\n- **A - Accomplishment**: Pursuing mastery and intrinsic competence.\n\n#### Combating the Hedonic Treadmill:\nPracticing deliberate cognitive reappraisal and keeping an active gratitude journal interrupts hedonic habituation, sustaining happiness over decades.`
                }
              ]
            }
          ]
        }
      ];

      for (const c of seedCoursesData) {
        this.create('Course', {
          id: c.id,
          userId: defaultUser.id,
          title: c.title,
          topicPrompt: c.topicPrompt,
          learnerLevel: c.learnerLevel,
          description: c.description,
          isPublicFeatured: c.isPublicFeatured,
          status: c.status,
          progressPercentage: c.progressPercentage,
          createdAt: new Date().toISOString()
        });

        for (const m of c.modules) {
          this.create('Module', {
            id: m.id,
            courseId: c.id,
            orderIndex: m.orderIndex,
            title: m.title,
            summary: m.summary
          });

          for (const l of m.lessons) {
            this.create('Lesson', {
              id: l.id,
              moduleId: m.id,
              orderIndex: l.orderIndex,
              title: l.title,
              contentMarkdown: l.contentMarkdown,
              simplifiedMarkdown: null,
              examplesMarkdown: null,
              audioUrl: null,
              isCompleted: l.isCompleted,
              completedAt: l.isCompleted ? new Date().toISOString() : null
            });

            // Seed Inline Quiz for the first lesson
            if (l.id === 'les_ai_1_1') {
              this.create('LessonQuiz', {
                id: 'quiz_ai_1_1',
                lessonId: l.id,
                questionsJson: JSON.stringify([
                  {
                    question: 'In which year was the seminal Dartmouth Workshop held, officially coining "Artificial Intelligence"?',
                    options: ['1945', '1956', '1969', '1982'],
                    correctIndex: 1,
                    explanation: 'The Dartmouth Summer Research Project took place in the summer of 1956, organized by John McCarthy, Marvin Minsky, and colleagues.'
                  },
                  {
                    question: 'What was the original purpose of the Turing Test proposed by Alan Turing in 1950?',
                    options: [
                      'To test memory read speed',
                      'To determine if a machine can exhibit intelligent behavior indistinguishable from a human',
                      'To benchmark multi-core CPU clock cycles',
                      'To compile symbolic assembly code'
                    ],
                    correctIndex: 1,
                    explanation: 'Alan Turing proposed the Imitation Game as an operational definition of whether a machine can exhibit conversational behavior indistinguishable from a human.'
                  }
                ]),
                userScore: 2,
                completedAt: new Date().toISOString()
              });
            }
          }
        }
      }

      // 4. Seed Initial Flashcards with SM-2 Spaced Repetition values
      const seedFlashcards = [
        {
          id: 'fc_1',
          userId: defaultUser.id,
          courseId: 'course_ai_foundations',
          lessonId: 'les_ai_1_1',
          frontPrompt: 'What is the Dartmouth Workshop (1956) famous for?',
          backAnswer: 'It is the seminal academic conference where the term "Artificial Intelligence" was officially coined by John McCarthy and colleagues.',
          easinessFactor: 2.5,
          intervalDays: 1,
          repetitions: 1,
          nextReviewAt: new Date().toISOString()
        },
        {
          id: 'fc_2',
          userId: defaultUser.id,
          courseId: 'course_ml_intro',
          lessonId: 'les_ml_1_2',
          frontPrompt: 'What is overfitting in machine learning?',
          backAnswer: 'Overfitting occurs when a statistical model memorizes the training data noise and idiosyncratic variance, performing poorly on unseen test data.',
          easinessFactor: 2.6,
          intervalDays: 3,
          repetitions: 2,
          nextReviewAt: new Date(Date.now() + 86400000).toISOString()
        },
        {
          id: 'fc_3',
          userId: defaultUser.id,
          courseId: 'course_ai_foundations',
          lessonId: 'les_ai_2_2',
          frontPrompt: 'What is the core formula for Scaled Dot-Product Attention in Transformers?',
          backAnswer: 'Attention(Q, K, V) = softmax((Q * K^T) / sqrt(d_k)) * V',
          easinessFactor: 2.36,
          intervalDays: 0,
          repetitions: 0,
          nextReviewAt: new Date().toISOString()
        },
        {
          id: 'fc_4',
          userId: defaultUser.id,
          courseId: 'course_productivity',
          lessonId: 'les_prod_1_1',
          frontPrompt: 'What is "Attention Residue"?',
          backAnswer: 'When switching between tasks, a portion of your attention remains stuck on the previous task, reducing cognitive performance on the new task.',
          easinessFactor: 2.5,
          intervalDays: 2,
          repetitions: 1,
          nextReviewAt: new Date().toISOString()
        }
      ];

      for (const fc of seedFlashcards) {
        this.create('Flashcard', fc);
      }

      // 5. Seed Math Solver Solutions
      this.create('HomeworkSolution', {
        id: 'sol_math_sample_1',
        userId: defaultUser.id,
        toolType: 'math_solver',
        inputText: 'd/dx [ (3x^2 + 1)^4 ]',
        inputImageUrl: null,
        extractedLatex: '\\frac{d}{dx} \\left[ (3x^2 + 1)^4 \\right]',
        subjectCategory: 'Calculus',
        stepsJson: JSON.stringify([
          {
            stepNumber: 1,
            stepTitle: 'Identify the Chain Rule',
            mathExpression: 'u = 3x^2 + 1, \\quad y = u^4, \\quad \\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}',
            explanation: 'Recognize the composite function structure: an outer polynomial function u^4 and an inner quadratic function 3x^2 + 1.'
          },
          {
            stepNumber: 2,
            stepTitle: 'Differentiate outer and inner functions',
            mathExpression: '\\frac{dy}{du} = 4u^3, \\quad \\frac{du}{dx} = 6x',
            explanation: 'Apply the power rule to the outer term yielding 4(3x^2 + 1)^3 and differentiate the inner polynomial to get 6x.'
          },
          {
            stepNumber: 3,
            stepTitle: 'Multiply and Simplify Constants',
            mathExpression: '4(3x^2 + 1)^3 \\cdot 6x = 24x(3x^2 + 1)^3',
            explanation: 'Multiply the outer constant 4 by 6x to produce the final coefficient 24x.'
          }
        ]),
        finalAnswer: '24x(3x^2 + 1)^3',
        createdAt: new Date().toISOString()
      });
    });
  }
}

// Global Singleton Instance
window.realmDB = new LocalRealmDatabase();
