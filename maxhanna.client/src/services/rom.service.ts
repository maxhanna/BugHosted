import { Injectable } from '@angular/core'; 
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class RomService {
  constructor() { }
   
  async getRomFile(rom: string, userId?: number) {
    try {
      const response = await fetch(`/rom/getromfile/${encodeURIComponent(rom)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.blob();
    } catch (error) {
      return null;
    }
  }
  async uploadRomFile(userId: number, form: FormData) {
    form.append('userId', JSON.stringify(userId));

    try {
      const response = await fetch(`/rom/uploadrom/`, {
        method: 'POST',
        body: form,
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  getFileExtension(file: string) {
    return file.lastIndexOf('.') !== -1 ? file.split('.').pop() : null;
  }

  // Returns aggregate emulation stats for a user: { totalSeconds, topGameName, topGamePlays }
  async getUserEmulationStats(userId: number) {
    try {
      const res = await fetch(`/rom/userstats/${userId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }
}
