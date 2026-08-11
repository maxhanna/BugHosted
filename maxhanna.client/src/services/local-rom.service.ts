import { Injectable } from '@angular/core';

export interface LocalRomEntry {
  name: string;
  size: number;
  savedAt: number;
  source: 'folder' | 'browser';
}

/** Source info for a locally stored ROM copy, used by offline badges. */
export interface OfflineFileInfo {
  name: string;
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
  // Meta key for browser-stored copies that fell back because the folder
  // wasn't writable (e.g. permission lost) and should be promoted to real
  // files once access is restored.
  private readonly PENDING_KEY = 'pendingFolderWrites';

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
      // Open the picker inside the previously chosen folder (when one is
      // stored) so re-selecting after a lost permission is a single confirm
      // instead of navigating back to it.
      const previous = await this.getFolderHandle();
      const handle: FileSystemDirectoryHandle = await w.showDirectoryPicker({
        id: 'rom-dir',
        mode: 'readwrite',
        startIn: previous ?? 'downloads'
      });
      // The handle is structured-cloneable in Chromium, so it can live as the
      // stored value under a fixed key.
      await this.idbSet('meta', handle, 'romDirHandle');
      // Ask for persistent storage so the stored handle (and any browser
      // copies) aren't evicted — the handle must survive in IndexedDB for
      // permission re-arming on the next visit.
      try {
        if (navigator.storage?.persist) await navigator.storage.persist();
      } catch { /* best-effort */ }
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

  // ---------------- Folder permission ----------------
  // File System Access grants are origin-bound and don't survive closing the
  // last tab by default. Since Chrome 122, calling requestPermission() on a
  // previously-granted, IndexedDB-stored handle offers the user a persistent
  // option ("Allow on every visit"), which is the only way access survives
  // browser restarts. These helpers drive that flow.

  /**
   * Read-only check of the stored folder handle's permission — never prompts.
   * Returns null when no folder is configured or the API is unavailable.
   */
  async getFolderPermissionState(mode: 'read' | 'readwrite' = 'read'): Promise<PermissionState | null> {
    const handle = await this.getFolderHandle();
    if (!handle) return null;
    try {
      return await (handle as any).queryPermission({ mode }) ?? 'prompt';
    } catch {
      return null;
    }
  }

  /**
   * Ensure the stored folder handle has the requested permission, prompting
   * the user only when access was lost (state 'prompt'). On a fresh browser
   * visit this is what surfaces Chrome's persistent-permission prompt, where
   * picking "Allow on every visit" removes the need for future re-grants.
   */
  async ensureFolderPermission(mode: 'read' | 'readwrite' = 'read'): Promise<PermissionState | null> {
    const handle = await this.getFolderHandle();
    if (!handle) return null;
    try {
      const state = await (handle as any).queryPermission({ mode });
      if (state === 'granted') return state;
      return await (handle as any).requestPermission({ mode }) ?? 'denied';
    } catch {
      return null;
    }
  }

  /**
   * Reconnect a folder whose permission was lost. When access is restored,
   * browser-stored copies that silently fell back are re-attempted so they
   * end up as real files. Returns whether access is back and how many copies
   * were promoted.
   */
  async reconnectFolder(): Promise<{ granted: boolean; migrated: number }> {
    const state = await this.ensureFolderPermission('readwrite');
    if (state !== 'granted') return { granted: false, migrated: 0 };
    const migrated = await this.flushPendingFolderWrites();
    return { granted: true, migrated };
  }

  async clearFolder(): Promise<void> {
    await this.idbDelete('meta', 'romDirHandle');
    // Unlinking means browser storage is now the user's choice — drop any
    // "promote to folder" intent so it doesn't leak into a future folder.
    await this.setPendingWrites([]);
  }

  // ---------------- Pending folder promotions ----------------
  // When a folder write fails (permission lost mid-session, etc.) the copy
  // falls back to browser storage and is marked as pending; once folder
  // access is restored it's moved into the folder so it becomes a real file.

  private async getPendingWrites(): Promise<{ kind: 'roms' | 'saves'; name: string }[]> {
    try {
      const list = await this.idbGet('meta', this.PENDING_KEY);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private async setPendingWrites(list: { kind: 'roms' | 'saves'; name: string }[]): Promise<void> {
    try {
      await this.idbSet('meta', list, this.PENDING_KEY);
    } catch { /* best-effort */ }
  }

  private async markPendingFolderWrite(kind: 'roms' | 'saves', name: string): Promise<void> {
    const list = await this.getPendingWrites();
    if (!list.some(w => w.kind === kind && w.name === name)) {
      list.push({ kind, name });
      await this.setPendingWrites(list);
    }
  }

  private async unmarkPendingFolderWrite(kind: 'roms' | 'saves', name: string): Promise<void> {
    const list = await this.getPendingWrites();
    const next = list.filter(w => !(w.kind === kind && w.name === name));
    await this.setPendingWrites(next);
  }

  /** How many browser-stored copies are waiting to be promoted to the folder. */
  async getPendingFolderWriteCount(): Promise<number> {
    return (await this.getPendingWrites()).length;
  }

  /**
   * Re-attempt every browser-stored copy that fell back while the folder was
   * unreachable, moving it into the configured folder. Returns how many
   * became real files. Copies whose browser entry vanished are unmarked;
   * copies that still fail to write stay pending for the next attempt.
   */
  async flushPendingFolderWrites(): Promise<number> {
    const handle = await this.getFolderHandle();
    if (!handle) return 0;
    let migrated = 0;
    for (const w of await this.getPendingWrites()) {
      try {
        const ok = w.kind === 'roms'
          ? await this.moveToFolder(w.name)
          : await this.moveSaveStateToFolder(w.name);
        if (ok) {
          migrated++;
          await this.unmarkPendingFolderWrite(w.kind, w.name);
        } else {
          const stillExists = w.kind === 'roms'
            ? await this.idbGet('roms', w.name)
            : await this.idbGet('saves', w.name);
          if (!stillExists) await this.unmarkPendingFolderWrite(w.kind, w.name);
        }
      } catch {
        /* keep pending for the next attempt */
      }
    }
    return migrated;
  }

  /**
   * Promote every browser-stored copy (ROMs and save states) into the
   * configured folder — including copies saved before a folder was ever
   * chosen, not just tracked fallback writes. Returns how many moved. Copies
   * that fail the folder write stay in browser storage and stay pending.
   */
  async promoteAllBrowserCopies(): Promise<number> {
    const handle = await this.getFolderHandle();
    if (!handle) return 0;
    let moved = 0;
    try {
      const roms = await this.idbAll('roms') as any[];
      for (const e of roms) {
        if (e?.name && await this.moveToFolder(e.name)) moved++;
      }
    } catch { /* keep going */ }
    try {
      const saves = await this.idbAll('saves') as any[];
      for (const e of saves) {
        if (e?.name && await this.moveSaveStateToFolder(e.name)) moved++;
      }
    } catch { /* keep going */ }
    // Pending entries that just got promoted no longer have a browser copy —
    // this cleans the list, while copies that failed to move stay pending.
    await this.flushPendingFolderWrites();
    return moved;
  }

  /**
   * Migrate a browser-stored save state into the configured folder. Returns
   * true on success (the IndexedDB copy is removed); false when no folder is
   * set, the copy isn't in browser storage, or the folder write fails.
   */
  async moveSaveStateToFolder(romName: string): Promise<boolean> {
    const handle = await this.getFolderHandle();
    if (!handle) return false;
    try {
      const entry = await this.idbGet('saves', romName);
      if (!entry?.blob) return false;
      const fh = await handle.getFileHandle(this.saveStateFileName(romName), { create: true });
      const writable = await fh.createWritable();
      await writable.write(entry.blob);
      await writable.close();
      await this.idbDelete('saves', romName);
      return true;
    } catch (e) {
      console.warn('[LocalRom] Save-state move to folder failed', e);
      return false;
    }
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
        // Mark so this copy is promoted to a real file once folder access is
        // restored (e.g. after reconnecting the folder).
        await this.markPendingFolderWrite('roms', romName);
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
          // Per-ROM save-state files live next to the ROMs — never list them
          // as ROM copies in the Local Copies panel.
          if (name.endsWith('.state')) continue;
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
          // Leave per-ROM .state files alone — this action clears ROM copies,
          // and save progress is kept (and always mirrored to the server).
          if ((entry[0] as string).endsWith('.state')) continue;
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

  // ---------------- Save states ----------------
  // Server remains the source of truth; these are an offline convenience.
  // Like ROMs, saves prefer the configured folder — written as per-ROM
  // `<rom>.state` files right next to the ROM copies so offline progress is
  // a real, browsable file. Browser storage is the fallback. `listRoms`/
  // `clearRoms` skip `.state` files so they never masquerade as ROMs in the
  // Local Copies panel.

  private saveStateFileName(romName: string): string {
    return this.sanitizeName(romName) + '.state';
  }

  /**
   * Persist a save state locally. Writes a `<rom>.state` file into the
   * configured folder when one exists; otherwise falls back to browser
   * storage. Returns where it was saved, or null on failure.
   */
  async saveSaveState(romName: string, blob: Blob): Promise<'folder' | 'browser' | null> {
    const handle = await this.getFolderHandle();
    if (handle) {
      try {
        const fh = await handle.getFileHandle(this.saveStateFileName(romName), { create: true });
        const writable = await fh.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'folder';
      } catch (e) {
        console.warn('[LocalRom] Folder save-state write failed, falling back to browser storage', e);
        // Mark so this save is promoted to a real .state file once folder
        // access is restored.
        await this.markPendingFolderWrite('saves', romName);
      }
    }
    try {
      await this.idbSet('saves', { name: romName, blob, savedAt: Date.now() });
      return 'browser';
    } catch (e) {
      console.warn('[LocalRom] Browser save-state write failed (quota?)', e);
      return null;
    }
  }

  /**
   * Returns a locally stored save state, or null. Checks the folder's
   * `<rom>.state` file first, then the legacy `saves/<rom>.sav` location
   * (first version of this feature), then browser storage.
   */
  async getSaveState(romName: string): Promise<Blob | null> {
    const handle = await this.getFolderHandle();
    if (handle) {
      try {
        const fh = await handle.getFileHandle(this.saveStateFileName(romName));
        const file = await fh.getFile();
        if (file.size > 0) return file;
      } catch {
        /* not saved as a .state file */
      }
      try {
        const dir = await handle.getDirectoryHandle('saves');
        const fh = await dir.getFileHandle(this.sanitizeName(romName) + '.sav');
        const file = await fh.getFile();
        if (file.size > 0) return file;
      } catch {
        /* no legacy .sav copy */
      }
    }
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
