import { Component, input, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService } from '../services/gemini.service';

@Component({
  selector: 'app-image-generator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
      <h3 class="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <span class="material-icons text-indigo-600 text-lg">image</span>
        AI Image Generator
      </h3>
      
      <div class="mb-4">
        <label class="block text-xs font-medium text-slate-500 mb-1">Prompt</label>
        <textarea 
          [ngModel]="prompt()" 
          (ngModelChange)="prompt.set($event)"
          class="w-full text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20"
          placeholder="Describe the image you want...">
        </textarea>
      </div>

      <div class="mb-4">
        <label class="block text-xs font-medium text-slate-500 mb-2">Aspect Ratio</label>
        <div class="grid grid-cols-4 gap-2">
          @for (ratio of aspectRatios; track ratio) {
            <button 
              (click)="selectedRatio.set(ratio)"
              [class.bg-indigo-600]="selectedRatio() === ratio"
              [class.text-white]="selectedRatio() === ratio"
              [class.bg-slate-100]="selectedRatio() !== ratio"
              [class.text-slate-600]="selectedRatio() !== ratio"
              class="text-xs py-1.5 px-2 rounded-md transition-colors font-medium border border-transparent hover:border-indigo-300">
              {{ ratio }}
            </button>
          }
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button 
          (click)="cancel.emit()"
          class="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          Cancel
        </button>
        <button 
          (click)="generate()"
          [disabled]="isGenerating()"
          class="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1">
          @if (isGenerating()) {
            <span class="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
          }
          Generate
        </button>
      </div>
    </div>
  `
})
export class ImageGeneratorComponent {
  private geminiService = inject(GeminiService);

  initialPrompt = input.required<string>();
  imageGenerated = output<string>();
  cancel = output<void>();

  prompt = signal('');
  isGenerating = signal(false);
  selectedRatio = signal('16:9');

  // User requested ratios
  aspectRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'];

  ngOnInit() {
    this.prompt.set(this.initialPrompt());
  }

  async generate() {
    if (!this.prompt()) return;
    
    this.isGenerating.set(true);
    try {
      const base64Image = await this.geminiService.generateImage(this.prompt(), this.selectedRatio());
      this.imageGenerated.emit(base64Image);
    } catch (error) {
      alert('Failed to generate image. Please try again.');
    } finally {
      this.isGenerating.set(false);
    }
  }
}