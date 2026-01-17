import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService } from './services/gemini.service';
import { TtsService } from './services/tts.service';
import { ProjectService, Project, Slide, ImageSettings } from './services/project.service';
import { ImageGeneratorComponent } from './components/image-generator.component';
import { ImageEditorComponent } from './components/image-editor.component';

// Declaration for the global library loaded via CDN
declare var PptxGenJS: any;
declare var pdfjsLib: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageGeneratorComponent, ImageEditorComponent],
  templateUrl: './app.component.html',
  styles: [`
    .slide-image-col { width: 100%; }
    @media (min-width: 768px) {
      .slide-image-col { width: var(--slide-image-width, 50%); }
    }
  `]
})
export class AppComponent {
  public geminiService = inject(GeminiService);
  public ttsService = inject(TtsService);
  public projectService = inject(ProjectService);

  // App State
  viewState = signal<'projects' | 'create' | 'editor' | 'present' | 'transcription_result'>('projects');
  
  // Create Flow State
  creationMode = signal<'presentation' | 'transcription'>('presentation');
  
  isProcessing = signal(false);
  
  // Current Project State
  currentProject = signal<Project | null>(null);
  activeSlideIndex = signal(0);
  
  // Transcription Result State
  transcriptionResult = signal<string>('');
  
  // UI State
  showImageGeneratorForSlideId = signal<number | null>(null);
  showImageEditorForSlideId = signal<number | null>(null); // New state for Editor
  userPrompt = signal(''); // User intent prompt

  // Supported Languages
  languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es', name: 'Español (General)' },
    { code: 'es-ES', name: 'Español (España)' },
    { code: 'es-419', name: 'Español (Latinoamérica)' },
    { code: 'es-AR', name: 'Español (Argentina)' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'it-IT', name: 'Italiano' },
    { code: 'ja-JP', name: 'Japanese' },
    { code: 'ko-KR', name: 'Korean' },
    { code: 'zh-CN', name: 'Chinese' }
  ];

  // Computed
  activeSlide = computed(() => {
    const project = this.currentProject();
    if (!project || !project.slides.length) return null;
    return project.slides[this.activeSlideIndex()];
  });

  filteredVoices = computed(() => {
    const project = this.currentProject();
    const allVoices = this.ttsService.availableVoices();
    if (!project) return [];
    
    const langCode = project.language.toLowerCase();
    const langPrefix = langCode.split('-')[0];
    
    // Filter by base language (e.g. 'es')
    let voices = allVoices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));

    // Sort logic to bubble up better regional matches
    voices.sort((a, b) => {
        const aLang = a.lang.toLowerCase();
        const bLang = b.lang.toLowerCase();

        // Exact match gets highest priority
        if (aLang === langCode && bLang !== langCode) return -1;
        if (bLang === langCode && aLang !== langCode) return 1;

        // If sorting for Argentina/LatAm, prefer 419/MX/US over ES
        if (langCode === 'es-ar' || langCode === 'es-419') {
             const isLatAmA = ['es-ar', 'es-419', 'es-mx', 'es-us'].some(c => aLang.includes(c));
             const isLatAmB = ['es-ar', 'es-419', 'es-mx', 'es-us'].some(c => bLang.includes(c));
             const isSpainA = aLang.includes('es-es');
             const isSpainB = bLang.includes('es-es');

             if (isLatAmA && !isLatAmB) return -1;
             if (!isLatAmA && isLatAmB) return 1;
             if (isSpainA && !isSpainB) return 1; // Push Spain down
             if (!isSpainA && isSpainB) return -1;
        }

        return a.name.localeCompare(b.name);
    });

    return voices;
  });

  constructor() {
    effect(() => {
       if (this.projectService.projects().length === 0 && this.viewState() === 'projects') {
          // Stay on projects to show empty state
       }
    });
  }

  // --- Project Management ---

  goToProjects() {
    this.ttsService.stop();
    this.ttsService.pauseMusic();
    this.viewState.set('projects');
    this.currentProject.set(null);
    this.transcriptionResult.set('');
  }

  openProject(project: Project) {
    this.currentProject.set(JSON.parse(JSON.stringify(project)));
    this.activeSlideIndex.set(0);
    this.viewState.set('editor');
  }

  startCreate(mode: 'presentation' | 'transcription') {
    this.creationMode.set(mode);
    this.viewState.set('create');
    this.userPrompt.set('');
  }

  deleteProject(id: string, event: Event) {
    event.stopPropagation();
    this.projectService.deleteProject(id);
  }

  saveCurrentProject() {
    const project = this.currentProject();
    if (project) {
      this.projectService.saveProject(project);
    }
  }

  // --- File Processing ---

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isProcessing.set(true);

    try {
      const base64 = await this.fileToBase64(file);
      
      if (this.creationMode() === 'presentation') {
        await this.handlePresentationCreation(file, base64);
      } else {
        await this.handleTranscription(file, base64);
      }
      
    } catch (error) {
      console.error(error);
      alert('Error processing file. Please ensure it matches the selected tool.');
    } finally {
      this.isProcessing.set(false);
      // Reset input
      input.value = '';
    }
  }

  async handlePresentationCreation(file: File, base64: string) {
      const isImage = file.type.startsWith('image/');
      let pdfImages: string[] = [];
      let pageCount: number | undefined = undefined;

      // 1. If it's a PDF, render pages to images first
      if (file.type === 'application/pdf') {
         try {
           pdfImages = await this.renderPdfPages(file);
           pageCount = pdfImages.length;
           console.log(`Rendered ${pageCount} PDF pages`);
         } catch (e) {
           console.error("PDF Render Error", e);
           // Fallback if rendering fails: continue without images
         }
      }

      // 2. Analyze with Gemini
      const data = await this.geminiService.analyzeDocument(base64, file.type, this.userPrompt(), pageCount);
      
      // 3. Map slides
      const slides: Slide[] = data.slides.map((s: any, index: number) => {
        let generatedImage: string | null = null;
        let imageSettings: ImageSettings = { scale: 1, x: 50, y: 50, width: 50, fit: 'contain', layout: 'split' }; // Default settings
        
        if (isImage) {
          // If input was image, use it for the single slide
          generatedImage = `data:${file.type};base64,${base64}`;
        } else if (pdfImages.length > 0) {
          // If input was PDF, use the corresponding page image
          if (index < pdfImages.length) {
            generatedImage = pdfImages[index];
          }
        }

        return {
          ...s,
          id: Date.now() + index,
          generatedImage: generatedImage,
          imageSettings: imageSettings
        };
      });

      const projectName = file.name.split('.')[0].replace(/[-_]/g, ' ');
      const newProject = this.projectService.createProject(projectName, slides, data.language || 'en');
      
      this.openProject(newProject);
  }

  async renderPdfPages(file: File): Promise<string[]> {
    if (typeof pdfjsLib === 'undefined') {
      console.warn('PDF.js not loaded');
      return [];
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images: string[] = [];
    
    // Limit to 20 pages to prevent browser crash on large docs
    const maxPages = Math.min(pdf.numPages, 20);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 }); // Good quality balance
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      
      // Convert to JPEG to save space
      images.push(canvas.toDataURL('image/jpeg', 0.8));
    }
    
    return images;
  }

  async handleTranscription(file: File, base64: string) {
      const result = await this.geminiService.transcribeMedia(base64, file.type, this.userPrompt());
      this.transcriptionResult.set(result);
      this.viewState.set('transcription_result');
  }

  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  }

  // --- Editor Actions ---

  updateProjectName(name: string) {
    this.currentProject.update(p => p ? { ...p, name } : null);
    this.saveCurrentProject();
  }

  updateProjectLanguage(lang: string) {
    this.currentProject.update(p => p ? { ...p, language: lang } : null);
    this.saveCurrentProject();
  }

  updateVoice(voiceURI: string) {
    this.currentProject.update(p => p ? { ...p, selectedVoiceURI: voiceURI } : null);
    this.saveCurrentProject();
  }

  selectSlide(index: number) {
    this.activeSlideIndex.set(index);
    // Close editors when switching slides
    this.showImageGeneratorForSlideId.set(null);
    this.showImageEditorForSlideId.set(null);
  }

  // --- Image Generator (New Image) ---
  toggleImageGenerator(slideId: number) {
    if (this.showImageGeneratorForSlideId() === slideId) {
      this.showImageGeneratorForSlideId.set(null);
    } else {
      this.showImageGeneratorForSlideId.set(slideId);
      this.showImageEditorForSlideId.set(null); // Close editor if open
    }
  }

  onImageGenerated(slideId: number, base64Image: string) {
    this.currentProject.update(p => {
        if (!p) return null;
        return {
            ...p,
            slides: p.slides.map(s => s.id === slideId ? { 
              ...s, 
              generatedImage: base64Image,
              imageSettings: { scale: 1, x: 50, y: 50, width: 50, fit: 'contain', layout: 'split' } // Reset settings on new image
            } : s)
        };
    });
    this.saveCurrentProject();
    this.showImageGeneratorForSlideId.set(null);
  }

  // --- Image Editor (Modify Existing) ---
  toggleImageEditor(slideId: number) {
    if (this.showImageEditorForSlideId() === slideId) {
       this.showImageEditorForSlideId.set(null);
    } else {
       this.showImageEditorForSlideId.set(slideId);
       this.showImageGeneratorForSlideId.set(null); // Close generator if open
    }
  }

  onImageEdited(slideId: number, result: { image: string, settings: ImageSettings }) {
     this.currentProject.update(p => {
        if (!p) return null;
        return {
           ...p,
           slides: p.slides.map(s => s.id === slideId ? {
              ...s,
              generatedImage: result.image,
              imageSettings: result.settings
           } : s)
        };
     });
     this.saveCurrentProject();
     this.showImageEditorForSlideId.set(null);
  }

  // --- Export (JSON) ---
  exportProjectJson() {
      const project = this.currentProject();
      if (!project) return;
      const dataStr = JSON.stringify(project, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, '_')}_presentation.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  }

  // --- Export (PPTX) ---
  exportToPptx() {
      if (typeof PptxGenJS === 'undefined') {
        alert('PPTX Generator library not loaded.');
        return;
      }

      const project = this.currentProject();
      if (!project) return;

      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      pptx.author = 'SlideGenius AI';
      pptx.title = project.name;

      project.slides.forEach(slide => {
          const s = pptx.addSlide();
          
          const isBackground = slide.imageSettings?.layout === 'background';

          // Background Image
          if (slide.generatedImage && isBackground) {
             s.addImage({ 
                data: slide.generatedImage, 
                x: 0, y: 0, w: '100%', h: '100%',
                sizing: { type: slide.imageSettings?.fit === 'contain' ? 'contain' : 'cover', w: '100%', h: '100%' }
             });
             // Add a semi-transparent shape for text readability
             s.addShape(pptx.ShapeType.rect, { x:0, y:0, w:'100%', h:'100%', fill:{ color:'FFFFFF', transparency: 30 } });
          } else {
             // Default solid background
             s.background = { color: 'F8FAFC' }; 
          }

          // Title
          s.addText(slide.title, { 
            x: 0.5, y: 0.5, w: '90%', h: 1, 
            fontSize: 28, bold: true, color: '1E293B', fontFace: 'Arial' 
          });

          // Content
          const bulletPoints = slide.content.map(c => ({ text: c, options: { breakLine: true } }));
          
          if (isBackground) {
              // Centered text for background mode
              s.addText(bulletPoints, { 
                 x: 1, y: 1.6, w: '80%', h: 4, 
                 fontSize: 20, color: '1E293B', bullet: true, paraSpaceAfter: 10, fontFace: 'Arial', align: 'left'
              });
          } else {
              // Split mode text
              s.addText(bulletPoints, { 
                 x: 0.5, y: 1.6, w: slide.generatedImage ? '50%' : '90%', h: 4, 
                 fontSize: 18, color: '334155', bullet: true, paraSpaceAfter: 10, fontFace: 'Arial'
              });

              // Split mode Image
              if (slide.generatedImage) {
                 s.addImage({ 
                   data: slide.generatedImage, 
                   x: 5.5, y: 1.6, w: 4, h: 4,
                   sizing: { type: slide.imageSettings?.fit === 'contain' ? 'contain' : 'cover', w: 4, h: 4 }
                 });
              }
          }

          // Notes
          if (slide.speakerNotes) {
            s.addNotes(slide.speakerNotes);
          }
      });

      pptx.writeFile({ fileName: `${project.name.replace(/\s+/g, '_')}.pptx` });
  }
  
  // --- Transcription Export ---
  downloadTranscript() {
    const text = this.transcriptionResult();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Presentation Mode ---
  startPresentation() {
    this.viewState.set('present');
    this.activeSlideIndex.set(0);
    this.ttsService.playMusic();
    this.speakCurrentSlide();
  }

  exitPresentation() {
    this.ttsService.stop();
    this.ttsService.pauseMusic();
    this.viewState.set('editor');
  }

  nextSlide() {
    const project = this.currentProject();
    if (project && this.activeSlideIndex() < project.slides.length - 1) {
      this.activeSlideIndex.update(i => i + 1);
      this.speakCurrentSlide();
    }
  }

  prevSlide() {
    if (this.activeSlideIndex() > 0) {
      this.activeSlideIndex.update(i => i - 1);
      this.speakCurrentSlide();
    }
  }

  speakCurrentSlide() {
    this.ttsService.stop();
    const slide = this.activeSlide();
    const project = this.currentProject();
    
    if (slide && project) {
      setTimeout(() => {
         const note = slide.speakerNotes;
         if (note) {
             this.ttsService.speak(note, project.language, project.selectedVoiceURI);
         }
      }, 500);
    }
  }

  isKnownLanguage(code?: string) {
    if (!code) return false;
    return this.languages.some(l => l.code === code);
  }
}