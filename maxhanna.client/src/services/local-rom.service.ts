import { Injectable } from '@angular/core';

export interface LocalRomEntry {
  name: string;
  size: number;
  savedAt: number;
  source: 'folder' | 'browser';
}

/**
 * Opt-in local storage for ROMs (and save states) so the emulator can load
 * them from the device instead of re-downloading from the server.
 *
 * Two backends:
 *  - A real user-chosen folder via the File System Access API (Chromium /
 *    Edge / Android Chrome). The directory handle is persisted in IndexedDB,
 *    so it survives reloads.
 *  - Browser storage (IndexedDB) as the universal fallback — Safari/Firefox
 *    can't hold folder handles, so copies live in a virtual "folder" there.
 */
@Injectable({
  providedIn: 'root'
})
export class LocalRomService {
  private readonly DB_NAME = 'maxhanna_local_roms';
  private readonly DB_VERSION = 1;
  private dbPromise?: Promise<IDBDatabase>;

  // ---------------- IndexedDB plumbing ----------------

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('roms')) db.createObjectStore('roms', { keyPath: 'name' });
          if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'name' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private idbSet(store: string, value: any, key?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.getDb().then(db => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }).catch(reject);
    });
  }

  private idbGet(store: string, key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.getDb().then(db => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch(reject);
    });
  }

  private idbDelete(store: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.getDb().then(db => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }).catch(reject);
    });
  }

  private idbAll(store: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.getDb().then(db => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
      }).catch(reject);
    });
  }

  // ---------------- File System Access folder ----------------

  supportsFileSystemAccess(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  private async getFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.supportsFileSystemAccess()) return null;
    try {
      const handle = await this.idbGet('meta', 'romDirHandle');
      return handle && typeof (handle as any).queryPermission === 'function' ? handle : null;
    } catch {
      return null;
    }
  }

  /** Ask the user to pick a folder for ROM copies and remember it. */
  async chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.supportsFileSystemAccess()) return null;
    try {
      const w = window as any;
      const handle: FileSystemDirectoryHandle = await w.showDirectoryPicker({
        id: 'rom-dir',
        mode: 'readwrite',
        startIn: 'downloads'
      });
      // The handle is structured-cloneable in Chromium, so it can live as the
      // stored value under a fixed key.
      await this.idbSet('meta', handle, 'romDirHandle');
      return handle;
    } catch (e: any) {
      if (e?.name === 'AbortError') return null; // user cancelled — not an error
      throw e;
    }
  }

  async getFolderName(): Promise<string | null> {
    try {
      const h = await this.getFolderHandle();
      return h?.name ?? null;
    } catch {
      return null;
    }
  }

  async clearFolder(): Promise<void> {
    await this.idbDelete('meta', 'romDirHandle');
  }

  // ---------------- ROM storage ----------------

  /** Returns a local copy of the ROM, or null if none exists. */
  async getRomBlob(romName: string): Promise<Blob | null> {
    const handle = await this.getFolderHandle();
    if (handle) {
      try {
        const fh = await handle.getFileHandle(this.sanitizeName(romName));
        const file = await fh.getFile();
        if (file.size > 0) return file;
      } catch {
        /* not in the folder */
      }
    }
    try {
      const entry = await this.idbGet('roms', romName);
      return entry?.blob ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Persist a downloaded ROM locally. Writes to the chosen folder when one is
   * configured; otherwise (or if the folder write fails) falls back to
   * browser storage. Returns where it was saved, or null on failure.
   */
  async saveRom(romName: string, blob: Blob): Promise<'folder' | 'browser' | null> {
    const handle = await this.getFolderHandle();
    if (handle) {
      try {
        const fh = await handle.getFileHandle(this.sanitizeName(romName), { create: true });
        const writable = await fh.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'folder';
      } catch (e) {
        console.warn('[LocalRom] Folder write failed, falling back to browser storage', e);
      }
    }
    try {
      await this.idbSet('roms', { name: romName, blob, size: blob.size, savedAt: Date.now() });
      return 'browser';
    } catch (e) {
      console.warn('[LocalRom] Browser storage write failed (quota?)', e);
      return null;
    }
  }

  async deleteRom(romName: string): Promise<void> {
    const handle = await this.getFolderHandle();
    if (handle) {
      try { await handle.removeEntry(this.sanitizeName(romName)); } catch { /* ignore */ }
    }
    try { await this.idbDelete('roms', romName); } catch { /* ignore */ }
  }

  /**
   * Migrate a browser-stored copy into the configured folder. Returns true on
   * success (the IndexedDB copy is removed); false when no folder is set, the
   * copy isn't in browser storage, or the folder write fails.
   */
  async moveToFolder(romName: string): Promise<boolean> {
    const handle = await this.getFolderHandle();
    if (!handle) return false;
    try {
      const entry = await this.idbGet('roms', romName);
      if (!entry?.blob) return false;
      const fh = await handle.getFileHandle(this.sanitizeName(romName), { create: true });
      const writable = await fh.createWritable();
      await writable.write(entry.blob);
      await writable.close();
      await this.idbDelete('roms', romName);
      return true;
    } catch (e) {
      console.warn('[LocalRom] Move to folder failed', e);
      return false;
    }
  }

  async listRoms(): Promise<LocalRomEntry[]> {
    const entries: LocalRomEntry[] = [];
    const handle = await this.getFolderHandle();
    if (handle) {
      try {
        for await (const entry of (handle as any).entries()) {
          const name = entry[0] as string;
          try {
            const fh = await handle.getFileHandle(name);
            const f = await fh.getFile();
            entries.push({ name, size: f.size, savedAt: f.lastModified ?? Date.now(), source: 'folder' });
          } catch { /* skip unreadable */ }
        }
      } catch { /* ignore */ }
    }
    try {
      const idbEntries = await this.idbAll('roms') as any[];
      for (const e of idbEntries) {
        if (entries.some(x => x.name === e.name)) continue;
        entries.push({
          name: e.name,
          size: e.blob?.size ?? e.size ?? 0,
          savedAt: e.savedAt ?? Date.now(),
          source: 'browser'
        });
      }
    } catch { /* ignore */ }
    return entries.sort((a, b) => b.savedAt - a.savedAt);
  }

  async clearRoms(): Promise<void> {
    const handle = await this.getFolderHandle();
    if (handle) {
      try {
        for await (const entry of (handle as any).entries()) {
          try { await handle.removeEntry(entry[0] as string); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
    const db = await this.getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('roms', 'readwrite');
      tx.objectStore('roms').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------------- Save states (browser storage) ----------------
  // Server remains the source of truth; these are an offline convenience.

  async saveSaveState(romName: string, blob: Blob): Promise<void> {
    try {
      await this.idbSet('saves', { name: romName, blob, savedAt: Date.now() });
    } catch { /* best-effort */ }
  }

  async getSaveState(romName: string): Promise<Blob | null> {
    try {
      const entry = await this.idbGet('saves', romName);
      return entry?.blob ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Current browser-storage usage vs quota in bytes (null when unsupported).
   * Only meaningful for copies stored in IndexedDB — folder copies bypass the
   * web quota entirely.
   */
  async getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
      const est = await navigator.storage.estimate();
      return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    } catch {
      return null;
    }
  }

  private sanitizeName(name: string): string {
    // ROM names from the server may contain path separators — make a
    // folder-safe single file name.
    return name.replace(/[\\/:*?"<>|]+/g, '_');
  }
}
