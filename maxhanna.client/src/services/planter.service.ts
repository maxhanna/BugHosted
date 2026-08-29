import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs/internal/Observable';
import { UserPlant } from './datacontracts/planter/user-plant';
import { FileEntry } from './datacontracts/file/file-entry';
import { PlantIdentificationResult } from './datacontracts/planter/plant-identification';
import { PlantPhoto } from './datacontracts/planter/plant-photo';

@Injectable({
  providedIn: 'root'
})
export class PlanterService {
  constructor(private http: HttpClient) { }

  async getPlants(userId: number): Promise<UserPlant[]> {
    try {
      const response = await fetch(`/planter/getplants?userId=${userId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return [];
      const plants = await response.json() as UserPlant[];
      
      // For each plant, fetch the photos to get the full FileEntry information
      for (const plant of plants) {
        if (plant.photoCount > 0 && plant.id) {
          const photosResponse = await fetch(`/planter/getphotos?plantId=${plant.id}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          if (photosResponse.ok) {
            const photos = await photosResponse.json() as PlantPhoto[];
            if (photos.length > 0) {
              plant.photos = photos;
            }
          }
        }
      }
      
      return plants;
    } catch (error) {
      console.error('Error fetching plants:', error);
      return [];
    }
  }

  async getPublicPlants(): Promise<UserPlant[]> {
    try {
      const response = await fetch('/planter/getpublicplants', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return [];
      const plants = await response.json() as UserPlant[];
      await this.loadPlantPhotos(plants);
      return plants;
    } catch (error) {
      console.error('Error fetching public plants:', error);
      return [];
    }
  }

  private async loadPlantPhotos(plants: UserPlant[]): Promise<void> {
    for (const plant of plants) {
      if (plant.photoCount > 0 && plant.id) {
        const response = await fetch(`/planter/getphotos?plantId=${plant.id}`);
        if (response.ok) plant.photos = await response.json() as PlantPhoto[];
      }
    }
  }

  async addPlant(userId: number, name: string, species?: string, notes?: string, location?: string, photoFileId?: number, suggestedWaterHours?: number): Promise<number | null> {
    try {
      const response = await fetch('/planter/addplant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name, species, notes, location, photoFileId, suggestedWaterHours }),
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.id;
    } catch (error) {
      console.error('Error adding plant:', error);
      return null;
    }
  }

  async updatePlant(plantId: number, updates: { name?: string; species?: string; notes?: string; location?: string; lastWatered?: Date }): Promise<boolean> {
    try {
      const response = await fetch('/planter/updateplant', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantId, ...updates }),
      });
      return response.ok;
    } catch (error) {
      console.error('Error updating plant:', error);
      return false;
    }
  }

  async deletePlant(plantId: number, userId: number): Promise<boolean> {
    try {
      const response = await fetch(`/planter/deleteplant?plantId=${plantId}&userId=${userId}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch (error) {
      console.error('Error deleting plant:', error);
      return false;
    }
  }

  uploadPhoto(plantId: number, userId: number, file: File): Observable<HttpEvent<any>> {
    const formData = new FormData();
    formData.append('plantId', plantId.toString());
    formData.append('userId', userId.toString());
    formData.append('file', file);

    const req = new HttpRequest('POST', '/planter/uploadphoto', formData, {
      reportProgress: true,
      responseType: 'json'
    });
    return this.http.request(req);
  }

  async deletePhoto(fileId: number, userId: number): Promise<boolean> {
    try {
      const response = await fetch(`/planter/deletephoto?fileId=${fileId}&userId=${userId}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch (error) {
      console.error('Error deleting photo:', error);
      return false;
    }
  }

  async getPhotos(plantId: number): Promise<FileEntry[]> {
    try {
      const response = await fetch(`/planter/getphotos?plantId=${plantId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return [];
      return await response.json() as FileEntry[];
    } catch (error) {
      console.error('Error fetching photos:', error);
      return [];
    }
  }

  uploadPhotoForIdentification(userId: number, file: File): Observable<HttpEvent<any>> {
    const formData = new FormData();
    formData.append('userId', userId.toString());
    formData.append('file', file);
    const req = new HttpRequest('POST', '/planter/uploadphotoforidentification', formData, {
      reportProgress: true,
      responseType: 'json'
    });
    return this.http.request(req);
  }

  async identifyPlant(userId: number, photoFileId: number): Promise<PlantIdentificationResult | null> {
    try {
      const response = await fetch('/planter/identifyplant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, photoFileId }),
      });
      if (!response.ok) return null;
      return await response.json() as PlantIdentificationResult;
    } catch (error) {
      console.error('Error identifying plant:', error);
      return null;
    }
  }

  async identifyPlantStream(
    userId: number,
    photoFileId: number,
    onToken: (token: string) => void,
    onStatus: (message: string) => void,
    signal?: AbortSignal
  ): Promise<PlantIdentificationResult | null> {
    try {
      const response = await fetch('/planter/identifyplantstream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, photoFileId }),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: PlantIdentificationResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.substring(6);
            try {
              const parsed = JSON.parse(data);

              if (currentEvent === 'token' && parsed.text) {
                onToken(parsed.text);
              } else if (currentEvent === 'status') {
                onStatus(parsed.message || '');
              } else if (currentEvent === 'result') {
                finalResult = parsed as PlantIdentificationResult;
              } else if (currentEvent === 'error') {
                finalResult = {
                  suggestions: [],
                  topPick: { name: '', species: '', reason: '' },
                  errorDetail: parsed.error || 'Unknown streaming error',
                };
              }
            } catch { /* skip malformed JSON */ }
          }
        }
      }

      return finalResult;
    } catch (error: any) {
      if (error?.name === 'AbortError') return null;
      console.error('Error in streaming plant identification:', error);
      return {
        suggestions: [],
        topPick: { name: '', species: '', reason: '' },
        errorDetail: error?.message || 'Streaming connection failed. Please try again.',
      };
    }
  }

  async analyzePlant(userId: number, plantId: number, photoFileId: number, analysisType: string, regenerate?: boolean): Promise<string | null> {
    try {
      const response = await fetch('/planter/analyzeplant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plantId, photoFileId, analysisType, regenerate }),
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.reply;
    } catch (error) {
      console.error('Error analyzing plant:', error);
      return null;
    }
  }

  async chatAboutPlant(userId: number, plantId: number, message: string, photoFileId?: number): Promise<string | null> {
    try {
      const response = await fetch('/planter/chataboutplant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plantId, message, photoFileId }),
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.reply;
    } catch (error) {
      console.error('Error chatting about plant:', error);
      return null;
    }
  }
}
