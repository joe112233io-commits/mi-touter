/**
 * TutorAI Read Aloud (Text-to-Speech) Controller
 * Uses Web Speech Synthesis API with cross-platform desktop Electron compatibility.
 */

class TutorAISpeechController {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.utterance = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentText = '';
    this.onStateChange = null;
  }

  isSupported() {
    return !!this.synth;
  }

  speak(text, onEndCallback = null) {
    if (!this.synth) {
      console.warn('Speech synthesis is not supported on this platform.');
      return;
    }

    this.stop();

    // Clean markdown symbols to ensure natural reading voice
    const cleanText = text
      .replace(/###|##|#|\*\*|\*|`|\$\$/g, '')
      .replace(/\|/g, ' ')
      .replace(/-{3,}/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .trim();

    this.currentText = cleanText;
    this.utterance = new SpeechSynthesisUtterance(cleanText);
    this.utterance.rate = 1.0;
    this.utterance.pitch = 1.0;

    // Detect if Arabic or English to pick appropriate voice
    const hasArabic = /[\u0600-\u06FF]/.test(cleanText);
    const voices = this.synth.getVoices();
    if (voices && voices.length > 0) {
      const match = voices.find(v => hasArabic ? v.lang.startsWith('ar') : (v.lang.startsWith('en') && v.name.includes('Natural')));
      if (match) this.utterance.voice = match;
    }

    this.utterance.onstart = () => {
      this.isPlaying = true;
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: true, isPaused: false });
    };

    this.utterance.onend = () => {
      this.isPlaying = false;
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, isPaused: false });
      if (onEndCallback) onEndCallback();
    };

    this.utterance.onerror = (e) => {
      console.warn('Speech synthesis notice:', e);
      this.isPlaying = false;
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, isPaused: false });
    };

    this.synth.speak(this.utterance);
  }

  pause() {
    if (this.synth && this.isPlaying && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
      if (this.onStateChange) this.onStateChange({ isPlaying: true, isPaused: true });
    }
  }

  resume() {
    if (this.synth && this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: true, isPaused: false });
    }
  }

  toggle(text) {
    if (this.isPlaying) {
      if (this.isPaused) {
        this.resume();
      } else {
        this.pause();
      }
    } else {
      this.speak(text);
    }
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
      this.isPlaying = false;
      this.isPaused = false;
      if (this.onStateChange) this.onStateChange({ isPlaying: false, isPaused: false });
    }
  }
}

// Global Singleton Instance
window.speechController = new TutorAISpeechController();
