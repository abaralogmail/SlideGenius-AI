import { Injectable, signal } from '@angular/core';

export interface ImageSettings {
  scale: number; // 0.1 to 5.0
  x: number; // 0-100%
  y: number; // 0-100%
  width?: number; // 20-80% (container width for split mode)
  fit?: 'cover' | 'contain';
  layout?: 'split' | 'background'; // New property
}

export interface Slide {
  id: number;
  title: string;
  content: string[];
  speakerNotes: string;
  imagePrompt: string;
  generatedImage?: string;
  imageSettings?: ImageSettings;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  slides: Slide[];
  language: string;
  selectedVoiceURI?: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  projects = signal<Project[]>([]);

  constructor() {
    this.loadProjects();
  }

  private loadProjects() {
    try {
      const data = localStorage.getItem('slidegenius_projects');
      if (data) {
        this.projects.set(JSON.parse(data));
      }
    } catch (e) {
      console.error('Failed to load projects', e);
    }
  }

  saveProject(project: Project) {
    this.projects.update(list => {
      const idx = list.findIndex(p => p.id === project.id);
      if (idx >= 0) {
        const newList = [...list];
        newList[idx] = project;
        return newList;
      }
      return [project, ...list];
    });
    this.persist();
  }

  deleteProject(id: string) {
    if (!confirm('Are you sure you want to delete this project?')) return;
    this.projects.update(list => list.filter(p => p.id !== id));
    this.persist();
  }

  createProject(name: string, slides: Slide[], lang: string): Project {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name: name || 'Untitled Presentation',
      createdAt: Date.now(),
      slides: slides,
      language: lang
    };
    this.saveProject(newProject);
    return newProject;
  }

  private persist() {
    try {
      localStorage.setItem('slidegenius_projects', JSON.stringify(this.projects()));
    } catch (e) {
      alert('Storage limit reached. Delete some projects to save new ones.');
      console.error('LocalStorage error:', e);
    }
  }
}