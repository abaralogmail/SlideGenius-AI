import { Component, input, output, inject, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService } from '../services/gemini.service';
import { ImageSettings } from '../services/project.service';

@Component({
  selector: 'app-image-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[650px] w-full max-w-2xl animate-[fadeIn_0.2s_ease-out]">
      <!-- Header -->
      <div class="h-12 border-b border-slate-100 flex items-center justify-between px-4 bg-slate-50">
        <h3 class="font-bold text-slate-700 flex items-center gap-2">
          <span class="material-icons text-indigo-600">tune</span>
          Image Editor
        </h3>
        <button (click)="cancel.emit()" class="text-slate-400 hover:text-slate-600">
          <span class="material-icons">close</span>
        </button>
      </div>

      <div class="flex-1 flex overflow-hidden">
        <!-- Preview Area -->
        <div class="flex-1 bg-slate-100 relative overflow-hidden flex items-center justify-center p-4">
           <!-- The container acts as the 'frame' -->
           <div 
             class="relative h-full bg-slate-200 rounded shadow-inner overflow-hidden flex items-center justify-center transition-all duration-300"
             [style.width.%]="settings().layout === 'background' ? 100 : (settings().width || 100)"> 
             
             @if (currentImage()) {
                <img 
                  [src]="currentImage()" 
                  class="max-w-none transition-transform duration-100 ease-linear origin-center"
                  [style.transform]="'scale(' + settings().scale + ')'"
                  [style.object-position]="settings().x + '% ' + settings().y + '%'"
                  [style.object-fit]="settings().layout === 'background' ? 'cover' : (settings().fit || 'contain')"
                  style="width: 100%; height: 100%;">
             }
             
             <!-- Grid Overlay -->
             <div class="absolute inset-0 pointer-events-none opacity-20 border border-slate-400">
               <div class="w-full h-1/3 border-b border-slate-400"></div>
               <div class="w-full h-1/3 border-b border-slate-400"></div>
               <div class="absolute top-0 left-1/3 w-px h-full bg-slate-400"></div>
               <div class="absolute top-0 right-1/3 w-px h-full bg-slate-400"></div>
             </div>

             <!-- Layout Indicator Overlay -->
             @if (settings().layout === 'background') {
                 <div class="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded">Full Background Mode</div>
             }
           </div>
        </div>

        <!-- Controls Sidebar -->
        <div class="w-80 bg-white border-l border-slate-200 flex flex-col">
          <!-- Tabs -->
          <div class="flex border-b border-slate-100">
            <button 
              (click)="activeTab.set('adjust')" 
              class="flex-1 py-3 text-sm font-medium transition-colors"
              [class.text-indigo-600]="activeTab() === 'adjust'"
              [class.bg-indigo-50]="activeTab() === 'adjust'"
              [class.text-slate-500]="activeTab() !== 'adjust'">
              Layout & Zoom
            </button>
            <button 
              (click)="activeTab.set('ai')" 
              class="flex-1 py-3 text-sm font-medium transition-colors"
              [class.text-indigo-600]="activeTab() === 'ai'"
              [class.bg-indigo-50]="activeTab() === 'ai'"
              [class.text-slate-500]="activeTab() !== 'ai'">
              AI Edit
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-5">
            
            @if (activeTab() === 'adjust') {
              <div class="space-y-6">
                <!-- Layout Mode -->
                <div>
                   <label class="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-2">
                      <span class="material-icons text-xs">dashboard</span>
                      Slide Layout
                   </label>
                   <div class="flex bg-slate-100 p-1 rounded-lg">
                      <button 
                        (click)="setLayout('split')"
                        class="flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1"
                        [class.bg-white]="(settings().layout || 'split') === 'split'"
                        [class.shadow-sm]="(settings().layout || 'split') === 'split'"
                        [class.text-indigo-600]="(settings().layout || 'split') === 'split'"
                        [class.text-slate-500]="(settings().layout || 'split') !== 'split'">
                        <span class="material-icons text-[14px]">view_column</span>
                        Split
                      </button>
                      <button 
                        (click)="setLayout('background')"
                        class="flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1"
                        [class.bg-white]="settings().layout === 'background'"
                        [class.shadow-sm]="settings().layout === 'background'"
                        [class.text-indigo-600]="settings().layout === 'background'"
                        [class.text-slate-500]="settings().layout !== 'background'">
                        <span class="material-icons text-[14px]">wallpaper</span>
                        Full Slide
                      </button>
                   </div>
                </div>

                <hr class="border-slate-100">

                <!-- Fit Mode -->
                @if (settings().layout === 'background') {
                  <div class="opacity-50 pointer-events-none">
                     <label class="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-2">
                        <span class="material-icons text-xs">aspect_ratio</span>
                        Image Fit (Locked to Cover)
                     </label>
                     <p class="text-[10px] text-slate-400">In Full Slide mode, image must cover the background.</p>
                  </div>
                } @else {
                  <div>
                     <label class="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-2">
                        <span class="material-icons text-xs">aspect_ratio</span>
                        Image Fit
                     </label>
                     <div class="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                          (click)="updateSetting('fit', 'cover')"
                          class="flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1"
                          [class.bg-white]="settings().fit === 'cover'"
                          [class.shadow-sm]="settings().fit === 'cover'"
                          [class.text-indigo-600]="settings().fit === 'cover'"
                          [class.text-slate-500]="settings().fit !== 'cover'">
                          <span class="material-icons text-[14px]">crop</span>
                          Cover (Fill)
                        </button>
                        <button 
                          (click)="updateSetting('fit', 'contain')"
                          class="flex-1 py-1.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1"
                          [class.bg-white]="(settings().fit || 'contain') === 'contain'"
                          [class.shadow-sm]="(settings().fit || 'contain') === 'contain'"
                          [class.text-indigo-600]="(settings().fit || 'contain') === 'contain'"
                          [class.text-slate-500]="(settings().fit || 'contain') !== 'contain'">
                          <span class="material-icons text-[14px]">fit_screen</span>
                          Contain (Full)
                        </button>
                     </div>
                  </div>
                }

                <hr class="border-slate-100">

                <!-- Size / Width Control (Only for Split Mode) -->
                @if ((settings().layout || 'split') === 'split') {
                  <div>
                    <div class="flex justify-between mb-2">
                      <label class="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                        <span class="material-icons text-xs">view_sidebar</span>
                        Column Width
                      </label>
                      <span class="text-xs text-indigo-600 font-mono">{{ settings().width || 50 }}%</span>
                    </div>
                    <input 
                      type="range" min="20" max="80" step="1" 
                      [ngModel]="settings().width || 50" 
                      (ngModelChange)="updateSetting('width', $event)"
                      class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                    <p class="text-[10px] text-slate-400 mt-1">Adjusts the image column size on the slide.</p>
                  </div>
                } @else {
                  <div class="opacity-50">
                    <label class="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                        <span class="material-icons text-xs">view_sidebar</span>
                        Column Width
                    </label>
                    <p class="text-xs text-slate-400">Disabled in Full Slide mode.</p>
                  </div>
                }

                <!-- Zoom Control -->
                <div>
                  <div class="flex justify-between mb-2">
                    <label class="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                      <span class="material-icons text-xs">zoom_in</span>
                      Image Zoom
                    </label>
                    <span class="text-xs text-indigo-600 font-mono">{{ (settings().scale * 100).toFixed(0) }}%</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="3.0" step="0.1" 
                    [ngModel]="settings().scale" 
                    (ngModelChange)="updateSetting('scale', $event)"
                    class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                </div>

                <!-- Pan X -->
                <div>
                  <div class="flex justify-between mb-2">
                     <label class="text-xs font-bold text-slate-500 uppercase">Pan Horizontal</label>
                     <span class="text-xs text-indigo-600 font-mono">{{ settings().x.toFixed(0) }}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" step="1" 
                    [ngModel]="settings().x" 
                    (ngModelChange)="updateSetting('x', $event)"
                    class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                </div>

                <!-- Pan Y -->
                <div>
                  <div class="flex justify-between mb-2">
                     <label class="text-xs font-bold text-slate-500 uppercase">Pan Vertical</label>
                     <span class="text-xs text-indigo-600 font-mono">{{ settings().y.toFixed(0) }}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" step="1" 
                    [ngModel]="settings().y" 
                    (ngModelChange)="updateSetting('y', $event)"
                    class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600">
                </div>
                
                <button (click)="resetSettings()" class="text-xs text-slate-400 hover:text-red-500 underline w-full text-center">
                  Reset Layout & Position
                </button>
              </div>
            }

            @if (activeTab() === 'ai') {
              <div class="space-y-6">
                <!-- Watermark Removal -->
                 <div class="p-3 bg-blue-50 rounded-lg border border-blue-100">
                   <h4 class="text-sm font-bold text-blue-800 mb-1 flex items-center gap-1">
                     <span class="material-icons text-sm">auto_fix_high</span>
                     Remove Watermark
                   </h4>
                   <p class="text-xs text-blue-600 mb-3 leading-tight">
                     Re-creates a clean, high-quality version of this image without text or logos.
                   </p>
                   <button 
                     (click)="magicClean()"
                     [disabled]="isProcessing()"
                     class="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50">
                     @if(isProcessing() && processingMode() === 'clean') { Cleaning... } @else { Magic Clean }
                   </button>
                 </div>

                 <hr class="border-slate-100">

                 <!-- Shot Type -->
                 <div>
                    <label class="text-xs font-bold text-slate-500 uppercase mb-2 block">Change Shot Type</label>
                    <div class="grid grid-cols-2 gap-2">
                       @for (shot of ['Close Up', 'Medium Shot', 'Wide Shot', 'Overhead']; track shot) {
                          <button 
                            (click)="applyShotType(shot)"
                            [disabled]="isProcessing()"
                            class="px-2 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-600">
                            {{ shot }}
                          </button>
                       }
                    </div>
                 </div>

                 <!-- Custom Prompt -->
                 <div>
                   <label class="text-xs font-bold text-slate-500 uppercase mb-2 block">Custom Prompt</label>
                   <textarea 
                     [ngModel]="prompt()" 
                     (ngModelChange)="prompt.set($event)"
                     class="w-full h-20 text-xs p-2 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 resize-none mb-2"
                     placeholder="Describe changes..."></textarea>
                   <button 
                     (click)="regenerate()"
                     [disabled]="isProcessing() || !prompt()"
                     class="w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50">
                     @if(isProcessing() && processingMode() === 'regen') { Generating... } @else { Regenerate Image }
                   </button>
                 </div>
              </div>
            }

          </div>

          <!-- Footer Actions -->
          <div class="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
            <button 
              (click)="cancel.emit()"
              class="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white rounded-lg transition-colors">
              Cancel
            </button>
            <button 
              (click)="onSave()"
              class="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ImageEditorComponent {
  private geminiService = inject(GeminiService);

  image = input<string>();
  initialSettings = input<ImageSettings>();
  
  save = output<{ image: string, settings: ImageSettings }>();
  cancel = output<void>();

  activeTab = signal<'adjust' | 'ai'>('adjust');
  settings = signal<ImageSettings>({ scale: 1, x: 50, y: 50, width: 50, fit: 'contain', layout: 'split' });
  prompt = signal('');
  
  isProcessing = signal(false);
  processingMode = signal<'clean' | 'regen' | null>(null);
  
  currentImage = signal<string>('');

  constructor() {
    effect(() => {
        const img = this.image();
        if (img) this.currentImage.set(img);
    }, { allowSignalWrites: true });

    effect(() => {
        const init = this.initialSettings();
        if (init) this.settings.set({ fit: 'contain', layout: 'split', ...init });
    }, { allowSignalWrites: true });
  }

  // Handle switching layout with smart defaults
  setLayout(layout: 'split' | 'background') {
      this.settings.update(s => ({
          ...s,
          layout: layout,
          // If switching to background, force cover. 
          // If switching to split, default to contain.
          fit: layout === 'background' ? 'cover' : 'contain'
      }));
  }

  updateSetting(key: keyof ImageSettings, value: number | string) {
    this.settings.update(s => ({
        ...s,
        [key]: (key === 'fit' || key === 'layout') ? value : Number(value)
    }));
  }

  resetSettings() {
      this.settings.set({ scale: 1, x: 50, y: 50, width: 50, fit: 'contain', layout: 'split' });
  }

  async magicClean() {
      if (!this.currentImage()) return;
      this.startProcessing('clean');
      try {
          const desc = await this.geminiService.describeImage(this.currentImage(), "Describe this image in detail.");
          const cleanPrompt = `Create a high quality version of this image description: ${desc}. Do not include any text, watermarks, or logos. Pure visual content.`;
          const newImage = await this.geminiService.generateImage(cleanPrompt, '16:9');
          this.currentImage.set(newImage);
      } catch (e) {
          console.error(e);
          alert('Failed to clean image');
      } finally {
          this.stopProcessing();
      }
  }

  async applyShotType(type: string) {
      this.prompt.set(`Change this image to be a ${type} view.`);
      await this.regenerate();
  }

  async regenerate() {
      if (!this.prompt() || !this.currentImage()) return;
      this.startProcessing('regen');
      try {
          const desc = await this.geminiService.describeImage(this.currentImage(), "Describe the main subject and style of this image.");
          const fullPrompt = `Based on this description: "${desc}", generate a new image that obeys this instruction: ${this.prompt()}`;
          const newImage = await this.geminiService.generateImage(fullPrompt, '16:9');
          this.currentImage.set(newImage);
          this.prompt.set('');
      } catch (e) {
          console.error(e);
          alert('Failed to regenerate image');
      } finally {
          this.stopProcessing();
      }
  }

  onSave() {
      this.save.emit({
          image: this.currentImage(),
          settings: this.settings()
      });
  }

  private startProcessing(mode: 'clean' | 'regen') {
      this.isProcessing.set(true);
      this.processingMode.set(mode);
  }

  private stopProcessing() {
      this.isProcessing.set(false);
      this.processingMode.set(null);
  }
}
