import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TtsService {
  private synth = window.speechSynthesis;
  private musicAudio = new Audio();
  private voices: SpeechSynthesisVoice[] = [];
  
  isSpeaking = signal(false);
  availableVoices = signal<SpeechSynthesisVoice[]>([]);
  
  // Royalty free ambient music
  private musicUrl = 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112762.mp3';

  constructor() {
    this.musicAudio.src = this.musicUrl;
    this.musicAudio.loop = true;
    this.musicAudio.volume = 0.1; // Low background volume
    
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
    // Initial load attempt
    setTimeout(() => this.loadVoices(), 100);
  }

  private loadVoices() {
    this.voices = this.synth.getVoices();
    this.availableVoices.set(this.voices);
  }

  speak(text: string, lang: string = 'en', voiceURI?: string) {
    if (this.synth.speaking) {
      this.synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    let voiceToUse: SpeechSynthesisVoice | undefined;

    // 1. Try to use the specific voice chosen by the user
    if (voiceURI) {
      voiceToUse = this.voices.find(v => v.voiceURI === voiceURI);
    }

    // 2. Fallback: Try to find a good matching voice for the language
    if (!voiceToUse) {
        // Smart Dialect Fallback
        voiceToUse = this.findBestVoiceForLanguage(lang);
    }

    if (voiceToUse) {
      utterance.voice = voiceToUse;
      // Some browsers require the utterance lang to match the voice exactly to work best
      utterance.lang = voiceToUse.lang; 
    } else {
       utterance.lang = lang; // Fallback to requested lang code if no voice found
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    this.synth.speak(utterance);
  }

  // Improved logic to find the best voice for a specific locale
  private findBestVoiceForLanguage(langCode: string): SpeechSynthesisVoice | undefined {
      const normalizedLang = langCode.toLowerCase(); // e.g. 'es-ar'
      const baseLang = normalizedLang.split('-')[0]; // 'es'

      // Priority list based on input language
      const priorities: string[] = [normalizedLang]; 
      
      // Add regional fallbacks
      if (baseLang === 'es') {
          if (normalizedLang === 'es-ar' || normalizedLang === 'es-mx' || normalizedLang === 'es-419' || normalizedLang === 'es-us') {
              // For Latin American requests, prefer other LatAm codes before Spain
              if (normalizedLang !== 'es-419') priorities.push('es-419');
              if (normalizedLang !== 'es-mx') priorities.push('es-mx');
              if (normalizedLang !== 'es-us') priorities.push('es-us'); // US often has LatAm Spanish
              priorities.push('es'); // Generic
          } else if (normalizedLang === 'es-es') {
              priorities.push('es');
          }
      }

      // 1. Exact priority match (e.g. User asks es-AR, we have es-AR)
      for (const p of priorities) {
          const match = this.voices.find(v => v.lang.toLowerCase() === p && !v.name.includes('Microsoft Server')); // Prefer local/Google voices usually
          if (match) return match;
      }

      // 2. Google High Quality check (often labelled "Google Français", "Google Español")
      const googleMatch = this.voices.find(v => v.lang.toLowerCase().startsWith(baseLang) && v.name.includes('Google'));
      if (googleMatch) return googleMatch;

      // 3. Any match with correct base language, but try to avoid wrong region if possible
      // (Simple implementation: just find the first one matching base lang)
      return this.voices.find(v => v.lang.toLowerCase().startsWith(baseLang));
  }

  stop() {
    if (this.synth.speaking) {
      this.synth.cancel();
    }
    this.isSpeaking.set(false);
  }

  playMusic() {
    this.musicAudio.play().catch(e => console.log('Autoplay prevented', e));
  }

  pauseMusic() {
    this.musicAudio.pause();
  }
  
  setMusicVolume(vol: number) {
    this.musicAudio.volume = Math.max(0, Math.min(1, vol));
  }
}