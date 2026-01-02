import { Injectable } from '@angular/core'; 
 
export interface N64StateUpload {
  /** Logged-in user ID */
  userId: number;
  /** ROM file name shown to user (e.g., GoldenEye 007 (U) [!].z64) */
  romName: string;
  /** The *save* filename you want to persist (eep/sra/fla/srm/sav) */
  filename: string;
  /** Raw bytes to upload */
  bytes: Uint8Array;
  /** Optional timing/analytics fields already supported in your backend */
  startTimeMs?: number;      // when play started
  saveTimeMs?: number;       // when save occurred
  durationSeconds?: number;  // seconds played since last upload
} 
export interface SaveUploadResponse {
  ok: boolean;
  status: number;
  body?: any;
  errorText?: string;
}

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
 
/** Normalize input into a tight ArrayBuffer (no offset/extra bytes). */
private toTightArrayBuffer(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  const view = input as ArrayBufferView;
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}
 
async saveN64State(req: N64StateUpload): Promise<SaveUploadResponse> {
  const form = new FormData();

  // ✅ Normalize to a tight ArrayBuffer — satisfies strict DOM typings
  const tightAb: ArrayBuffer = this.toTightArrayBuffer(req.bytes);

  // Option A: File (sets filename directly on the part)
  const fileBlob = new File([tightAb], req.filename, { type: 'application/octet-stream' });
  form.append('file', fileBlob);

  // Option B: Blob + filename (equivalent; FormData takes a filename in the 3rd argument)
  // const blob = new Blob([tightAb], { type: 'application/octet-stream' });
  // form.append('file', blob, req.filename);

  // Required & optional fields
  form.append('userId', JSON.stringify(req.userId));
  form.append('romName', req.romName);
  if (typeof req.startTimeMs === 'number') form.append('startTimeMs', String(req.startTimeMs));
  if (typeof req.saveTimeMs === 'number') form.append('saveTimeMs', String(req.saveTimeMs));
  if (typeof req.durationSeconds === 'number') form.append('durationSeconds', String(req.durationSeconds));

  try {
    const res = await fetch(`/rom/uploadrom/`, { method: 'POST', body: form });
    const status = res.status;

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Upload failed');
      return { ok: false, status, errorText };
    }

    let body: any;
    try { body = await res.json(); } catch { body = await res.text(); }
    return { ok: true, status, body };
  } catch (error: any) {
    return { ok: false, status: 0, errorText: String(error?.message ?? error) };
  }
}



}
