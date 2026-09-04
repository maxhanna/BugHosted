import { Injectable } from '@angular/core';
import { BookEntry } from './datacontracts/books/book-entry';

@Injectable({
  providedIn: 'root'
})
export class BooksService {
  constructor() { }

  /** Books the user has added to their own library. */
  async getMyLibrary(userId: number, sessionToken?: string): Promise<BookEntry[]> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch(`/books/getmylibrary?userId=${userId}`, { headers });
      if (!response.ok) return [];
      return (await response.json()) as BookEntry[];
    } catch (error) {
      console.error('Error fetching book library:', error);
      return [];
    }
  }

  /** All publicly shared / shared books — the community catalog. */
  async getCatalog(userId?: number): Promise<BookEntry[]> {
    try {
      const url = userId ? `/books/getcatalog?userId=${userId}` : '/books/getcatalog';
      const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) return [];
      return (await response.json()) as BookEntry[];
    } catch (error) {
      console.error('Error fetching book catalog:', error);
      return [];
    }
  }

  /** Registers an uploaded file (pdf/txt/doc...) as a book in the user's library. */
  async registerBook(payload: {
    userId: number; fileId: number; title: string; author?: string; description?: string;
    coverFileId?: number; isPublic?: boolean;
  }, sessionToken?: string): Promise<{ bookId: number; fileId: number; updated: boolean } | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/register', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error registering book:', error);
      return null;
    }
  }

  async updateBook(payload: {
    userId: number; bookId?: number; fileId?: number; title: string; author?: string;
    description?: string; coverFileId?: number; isPublic?: boolean;
  }, sessionToken?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/update', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('Error updating book:', error);
      return false;
    }
  }

  /** Share a book publicly or with specific usernames/user ids. */
  async shareBook(payload: {
    userId: number; bookId: number; makePublic?: boolean; usernames?: string[]; userIds?: number[];
  }, sessionToken?: string): Promise<{ success: boolean; isPublic?: boolean; sharedWith?: number[]; unknownUsernames?: string[] } | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/share', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error sharing book:', error);
      return null;
    }
  }

  async unshareBook(payload: {
    userId: number; bookId: number; makePublic?: boolean; usernames?: string[]; userIds?: number[];
  }, sessionToken?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/unshare', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('Error unsharing book:', error);
      return false;
    }
  }

  /** Removes a book from the library (the uploaded file itself is untouched). */
  async removeBook(payload: { userId: number; bookId: number }, sessionToken?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/remove', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('Error removing book:', error);
      return false;
    }
  }

  /**
   * Preview image for a book: the uploaded cover file when present, otherwise a
   * deterministic server-generated SVG cover (same book always gets the same art).
   */
  getCoverUrl(book: BookEntry, sessionToken?: string): string {
    if (book.coverUrl) return book.coverUrl;
    const params = new URLSearchParams();
    params.set('title', book.title || 'Untitled');
    if (book.author) params.set('author', book.author);
    if (book.fileType) params.set('fmt', book.fileType);
    return `/books/cover.svg?${params.toString()}`;
  }

  /**
   * Builds a shareable deep link to the eBooks component. Keyed by fileId —
   * the canonical identity of the book (bookId differs per user who saved a
   * copy, and unregistered files have none).
   */
  getShareLink(book: BookEntry): string {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/Books/${book.fileId}`;
  }

  /** Per-user reading position for a book file (null when none saved yet).
   *  `position` carries a free-form reader location such as an EPUB CFI. */
  async getReadingProgress(userId: number, fileId: number, sessionToken?: string): Promise<{ page: number; scroll: number; position?: string } | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch(`/books/progress?userId=${userId}&fileId=${fileId}`, { headers });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data?.position) return null;
      return {
        page: data.position.page ?? 1,
        scroll: data.position.scroll ?? 0,
        position: data.position.position ?? undefined,
      };
    } catch (error) {
      console.error('Error fetching reading progress:', error);
      return null;
    }
  }

  /** Saves the per-user reading position (page + in-page scroll ratio 0..1, plus
   *  an optional free-form position such as an EPUB CFI). */
  async saveReadingProgress(payload: { userId: number; fileId: number; page: number; scroll: number; position?: string }, sessionToken?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/progress', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('Error saving reading progress:', error);
      return false;
    }
  }

  /** Streams the actual book file for reading/downloading. */
  async downloadBook(fileId: number): Promise<Blob | null> {
    try {
      const response = await fetch(`/file/getfilebyid/${fileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(null),
      });
      if (!response.ok) return null;
      return await response.blob();
    } catch (error) {
      console.error('Error downloading book:', error);
      return null;
    }
  }
}
