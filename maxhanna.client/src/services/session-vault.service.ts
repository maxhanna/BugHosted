/**
 * SessionVault — an encrypted localStorage slot for the session token.
 *
 * The app keeps the token in memory and also receives it as an HttpOnly
 * cookie (the cookie bridge). This vault is a THIRD, independent persistence
 * layer: the token is encrypted at rest with AES-GCM (Web Crypto, no external
 * dependency) using a key derived from an app-scoped pepper + the user id, so
 * a plaintext token never sits in JS-readable storage.
 *
 * Why a second client-side copy at all? The HttpOnly cookie bridge is the
 * primary reload path, but it can be unavailable or stale (cookie domain
 * mismatches, third-party cookie blocking, the cookie being cleared by other
 * tabs, or middleware ordering). With the vault, a reload can restore the
 * session purely from localStorage — and since the vault is only written with
 * tokens the server just issued/validated, it never resurrects a dead session:
 * a refused token simply falls back to the cookie bridge, then to login.
 *
 * Security notes:
 *  - The encryption key is derived (PBKDF2) from a fixed app pepper combined
 *    with the numeric user id, so each account's token is encrypted under a
 *    different key and the vault is useless to anyone who copies localStorage
 *    alone (the pepper is not stored in localStorage).
 *  - Web Crypto requires a secure context; on http:// non-localhost the
 *    save/load calls fail gracefully and the cookie bridge remains the path.
 *  - The token is still sent as the Encrypted-UserId header by the app; the
 *    vault is storage only.
 */
export class SessionVault {
  private static readonly STORAGE_KEY = 'maxhanna.sessionToken.v1';
  /** App-scoped pepper — NOT stored in localStorage. Change once and all old
   *  vault entries become undecryptable (they are dropped on first read). */
  private static readonly PEPPER = 'maxhanna.session.vault.v1.pepper.9f2a';
  private static readonly ITERATIONS = 120000;

  private static keyCache = new Map<number, CryptoKey>();

  /** Encrypts and stores the token for the given user. No-op on failure
   *  (secure context missing, storage blocked, etc.) — the in-memory copy and
   *  cookie bridge still work. */
  static async save(token: string, userId: number | undefined): Promise<void> {
    try {
      if (!token || !userId || !this.isSupported()) return;
      const key = await this.keyFor(userId);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(token)
      );
      const payload = {
        v: 1,
        uid: userId,
        iv: this.b64(iv),
        data: this.b64(new Uint8Array(data)),
      };
      try {
        window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // localStorage unavailable (private mode / quota) — ignore.
      }
    } catch (e) {
      console.warn('[SessionVault] save failed:', e);
    }
  }

  /** Decrypts and returns the stored token for the given user, or null when
   *  absent, unreadable, for another user, or the key no longer matches. */
  static async load(userId: number): Promise<string | null> {
    try {
      if (!userId || !this.isSupported()) return null;
      const raw = window.localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      let payload: any;
      try { payload = JSON.parse(raw); } catch { return null; }
      if (payload?.v !== 1 || payload.uid !== userId || !payload.iv || !payload.data) {
        return null;
      }
      const key = await this.keyFor(userId);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.unb64(payload.iv) },
        key,
        this.unb64(payload.data)
      );
      const token = new TextDecoder().decode(plain);
      return token || null;
    } catch {
      // Corrupt / key mismatch / secure context missing — treat as absent.
      return null;
    }
  }

  /** Removes the vault entry (logout, expiry, or current-device revoke). */
  static clear(): void {
    try {
      window.localStorage.removeItem(this.STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  private static isSupported(): boolean {
    return typeof crypto !== 'undefined' && !!crypto.subtle &&
      typeof window !== 'undefined' && !!window.localStorage;
  }

  private static async keyFor(userId: number): Promise<CryptoKey> {
    const cached = this.keyCache.get(userId);
    if (cached) return cached;
    const salt = new TextEncoder().encode(`${this.PEPPER}:${userId}`);
    const material = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(this.PEPPER), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: this.ITERATIONS,
        hash: 'SHA-256',
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    this.keyCache.set(userId, key);
    return key;
  }

  private static b64(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }

  private static unb64(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
}
