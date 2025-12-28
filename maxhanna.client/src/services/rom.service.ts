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
  // Returns breakdown per ROM: [{ romFileName, totalSeconds, plays }, ...]
  async getUserEmulationBreakdown(userId: number) {
    try {
      const res = await fetch(`/rom/usergamebreakdown/${userId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }
  async getActivePlayers(minutes: number = 2) {
    try {
      const response = await fetch('/rom/activeplayers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minutes)
      });
      if (!response.ok) return null;
      return await response.json(); // { count }
    } catch { return null; }
  }

  // Mapping persistence APIs
  async listMappings(userId: number) {
    try {
      const res = await fetch('/rom/getmappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userId)
      });
      if (!res.ok) return null;
      return await res.json(); // array of names
    } catch {
      return null;
    }
  }

  async getMapping(userId: number, name: string) {
    try {
      const req = { UserId: userId, Name: name };
      const res = await fetch('/rom/getmapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      if (!res.ok) return null;
      return await res.json(); // mapping object
    } catch {
      return null;
    }
  }

  async saveMapping(userId: number, name: string, mapping: any) {
    try {
      const req = { UserId: userId, Name: name, Mapping: mapping };
      const res = await fetch('/rom/savemapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      const status = res.status;
      if (!res.ok) {
        // return status and text for caller to inspect (e.g. 403 limit reached)
        const txt = await res.text();
        return { ok: false, status, text: txt };
      }
      const body = await res.json();
      return { ok: true, status, body };
    } catch {
      return null;
    }
  }

  async deleteMapping(userId: number, name: string) {
    try {
      const req = { UserId: userId, Name: name };
      const res = await fetch('/rom/deletemapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}
