import { Injectable, signal } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  // Track token usage across the session
  public totalTokenUsage = signal({ input: 0, output: 0, total: 0 });

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env['API_KEY'] });
  }

  private updateUsage(response: any) {
    if (response?.usageMetadata) {
      this.totalTokenUsage.update(current => ({
        input: current.input + (response.usageMetadata.promptTokenCount || 0),
        output: current.output + (response.usageMetadata.candidatesTokenCount || 0),
        total: current.total + (response.usageMetadata.totalTokenCount || 0)
      }));
    }
  }

  async analyzeDocument(fileBase64: string, mimeType: string, customPrompt?: string, pageCount?: number): Promise<any> {
    const isImage = mimeType.startsWith('image/');

    let systemContext = '';
    
    if (isImage) {
      systemContext = `
        You are a presentation expert. The user has uploaded an IMAGE to be converted into a presentation slide.
        1. Detect the language of the text in the image (or default to the prompt language).
        2. Create ONE comprehensive slide that represents this image.
        3. The content should be a detailed analysis or transcription of the image.
        4. The title should be the main topic of the image.
      `;
    } else {
      const countInstruction = pageCount 
        ? `The PDF has exactly ${pageCount} pages. You MUST generate exactly ${pageCount} slides, one for each page, in the correct order.` 
        : `Create a presentation where EACH SLIDE corresponds to a PAGE or a distinct SECTION of the PDF ("Hoja por hoja").`;

      systemContext = `
        You are a presentation expert. The user has uploaded a PDF document.
        1. Detect the language of the document.
        2. ${countInstruction}
        3. Do not summarize the whole document into fewer slides than pages. Maintain the 1:1 relationship between PDF pages and slides as much as possible.
        4. Title format: "Page X: [Topic]" or just the Topic.
      `;
    }

    const basePrompt = `
      ${systemContext}
      
      Structure requirements (JSON):
      - 'language': ISO 639-1 code.
      - 'slides': Array of objects:
        - 'title': String
        - 'content': Array of Strings (bullet points)
        - 'speakerNotes': String (Narration script. IMPORTANT: This text MUST be in SPANISH (Español), regardless of the slide content language, to be read by a Spanish TTS voice).
        - 'imagePrompt': String (Visual description in English)
      
      Ensure the response is valid JSON.
    `;

    const fullPrompt = customPrompt ? `${basePrompt}\n\nUser Instruction: ${customPrompt}` : basePrompt;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType
            }
          },
          { text: fullPrompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            language: { type: Type.STRING, description: "ISO 639-1 language code" },
            slides: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.ARRAY, items: { type: Type.STRING } },
                  speakerNotes: { type: Type.STRING },
                  imagePrompt: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    this.updateUsage(response);

    try {
      let cleanText = response.text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```/, '').replace(/```$/, '');
      }
      return JSON.parse(cleanText);
    } catch (e) {
      console.error('Failed to parse JSON', e);
      throw new Error('Invalid JSON response from AI');
    }
  }

  async transcribeMedia(fileBase64: string, mimeType: string, customInstruction?: string): Promise<string> {
    const prompt = customInstruction || "Transcribe the audio/video content. Provide a summary first, then the full transcript. Format nicely with headers. If possible, provide the summary in Spanish.";
    
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType
            }
          },
          { text: prompt }
        ]
      }
    });

    this.updateUsage(response);

    return response.text;
  }

  async describeImage(fileBase64: string, instruction: string): Promise<string> {
     // Check if base64 contains the data prefix or not
     const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
     
     const response = await this.ai.models.generateContent({
       model: 'gemini-2.5-flash',
       contents: {
         role: 'user',
         parts: [
           {
             inlineData: {
               data: cleanBase64,
               mimeType: 'image/jpeg' 
             }
           },
           { text: instruction }
         ]
       }
     });

     this.updateUsage(response);

     return response.text;
  }

  async generateImage(prompt: string, aspectRatio: string): Promise<string> {
    const ratioMap: {[key: string]: string} = {
      '1:1': '1:1',
      '2:3': '3:4',
      '3:2': '4:3',
      '3:4': '3:4',
      '4:3': '4:3',
      '9:16': '9:16',
      '16:9': '16:9',
      '21:9': '16:9'
    };

    const safeRatio = ratioMap[aspectRatio] || '16:9';

    try {
      const response = await this.ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: safeRatio as any
        }
      });
      
      // Imagen usually doesn't return token usage in the same format, ignoring for now.

      if (response.generatedImages && response.generatedImages.length > 0) {
        return `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
      }
      throw new Error('No image generated');
    } catch (error) {
      console.error('Image generation error:', error);
      throw error;
    }
  }
}