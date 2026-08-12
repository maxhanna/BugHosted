// user.service.ts
import { Injectable } from '@angular/core';
import { Todo } from './datacontracts/todo';
import { MusicPlaylist } from './datacontracts/music-playlist';
import { MoviePlaylist } from './datacontracts/movie-playlist';

// Canonical stored values returned by /todo/edit after a successful save, so the
// caller can finalize (sanitize) its optimistic edit with what actually persisted.
export interface TodoEditResult {
  success: boolean;
  content?: string;
  url?: string | null;
  fileId?: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class TodoService {
  async getTodo(userId: number, type: string, search?: string) {
    try {
      let params = new URLSearchParams({ type: type });
      if (search) {
        params.set("search", search);
      }

      const response = await fetch('/todo?' + params, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getAllTodo(userId: number) {
    try {

      const response = await fetch('/todo/getall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getTodayMusic() {
    try {
      const response = await fetch('/todo/todaymusic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getTodoCount(userId: number, type: string, search?: string, signal?: AbortSignal) {
    try {
      let params = new URLSearchParams({ type: type });
      if (search) {
        params.set("search", search);
      }
      const response = await fetch('/todo/getcount?' + params, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userId),
        signal
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async renameColumn(oldName: string, newName: string) {
    try {
      const response = await fetch('/todo/columns/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ OldName: oldName, NewName: newName })
      });
      // The endpoint returns an empty Ok() on success, so a plain
      // response.json() would throw and hide the result — surface ok instead.
      return { ok: response.ok };
    } catch (error) {
      return null;
    }
  }
  async createTodo(userId: number, todo: Todo) {
    try {
      const response = await fetch('/todo/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: userId, todo: todo }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async editTodo(id: number, content: string, url?: string, fileId?: number): Promise<TodoEditResult | null> {
    try {
      const response = await fetch('/todo/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: id, content: content, url: url, fileId: fileId }),
      });

      // A non-2xx response is a negative result — surface it as null so the
      // caller can detect failure instead of treating an error body as success.
      if (!response.ok) {
        return null;
      }
      const text = await response.text();
      try {
        return JSON.parse(text) as TodoEditResult;
      } catch {
        // Legacy plain-text response ('Edit successful.') — treat as success
        // with no canonical payload; the caller keeps the optimistic value.
        return { success: true, content };
      }
    } catch (error) {
      return null;
    }
  }
  async editTodoUrlAndTitle(id: number, content: string, url?: string) {
    try {
      const response = await fetch('/todo/editurlandtitle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: id, content: content, url: url }),
      });

      if (!response.ok) {
        return null;
      }
      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async shareListWith(userId: number, toUserId: number, todoColumn: string) {
    try {
      const response = await fetch('/todo/sharelistwith', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ToUserId: toUserId, Column: todoColumn }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async getPendingShareInvites(userId: number) {
    try {
      const response = await fetch('/todo/getpendingshareinvites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userId),
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async acceptShareInvite(inviteId: number, userId: number) {
    try {
      const response = await fetch('/todo/acceptshareinvite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ InviteId: inviteId, UserId: userId }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async declineShareInvite(inviteId: number, userId: number) {
    try {
      const response = await fetch('/todo/declineshareinvite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ InviteId: inviteId, UserId: userId }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async deleteTodo(userId: number, id: number) {
    try {
      const response = await fetch(`/todo/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async addColumn(userId: number, column: string) {
    try {
      const response = await fetch(`/todo/columns/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Column: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async removeColumn(userId: number, column: string) {
    try {
      const response = await fetch(`/todo/columns/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Column: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async getColumnsForUser(userId: number) {
    try {
      const response = await fetch(`/todo/columns/getcolumnsforuser`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getSharedColumns(userId: number) {
    try {
      const response = await fetch(`/todo/getsharedcolumns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async getColumnActivations(ownerColumnId: number) {
    try {
      const response = await fetch(`/todo/getcolumnactivations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ownerColumnId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async unshareWith(userId: number, unshareWithUserId: number, column: string) {
    try {
      const response = await fetch(`/todo/unsharewith`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ToUserId: unshareWithUserId, Column: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async leaveSharedColumn(userId: number, ownerId: number, column: string) {
    try {
      const response = await fetch(`/todo/leavesharedcolumn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, OwnerId: ownerId, ColumnName: column }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async subscribeToColumn(ownerColumnId: number, userId: number) {
    try {
      const response = await fetch(`/todo/columns/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ OwnerColumnId: ownerColumnId, UserId: userId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async unsubscribeFromColumn(ownerColumnId: number, userId: number) {
    try {
      const response = await fetch(`/todo/columns/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ OwnerColumnId: ownerColumnId, UserId: userId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }

  // ───────────── Music Playlists ─────────────

  async getMusicPlaylists(userId: number): Promise<MusicPlaylist[] | null> {
    try {
      const response = await fetch('/todo/playlist/getall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userId),
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async createMusicPlaylist(userId: number, name: string): Promise<string | null> {
    try {
      const response = await fetch('/todo/playlist/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async deleteMusicPlaylist(userId: number, playlistId: number): Promise<string | null> {
    try {
      const response = await fetch('/todo/playlist/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async renameMusicPlaylist(userId: number, playlistId: number, name: string): Promise<string | null> {
    try {
      const response = await fetch('/todo/playlist/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId, name }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async saveMusicPlaylistEntries(userId: number, playlistId: number, todoIds: number[]): Promise<string | null> {
    try {
      const response = await fetch('/todo/playlist/saveentries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId, todoIds }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async getMusicPlaylistEntries(userId: number, playlistId: number): Promise<Todo[] | null> {
    try {
      const response = await fetch('/todo/playlist/getentries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId }),
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async shareMusicPlaylistWithUser(userId: number, playlistId: number, targetUserId: number): Promise<string | null> {
    try {
      const response = await fetch('/todo/playlist/sharewithuser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId, targetUserId }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async unshareMusicPlaylistWithUser(userId: number, playlistId: number, targetUserId: number): Promise<string | null> {
    try {
      const response = await fetch('/todo/playlist/unsharewithuser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId, targetUserId }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async setMusicPlaylistPublic(userId: number, playlistId: number, isPublic: boolean): Promise<{ shareToken: string } | null> {
    try {
      const response = await fetch('/todo/playlist/setpublic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId, isPublic }),
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async getMusicPlaylistByShareToken(shareToken: string): Promise<MusicPlaylist | null> {
    try {
      const response = await fetch('/todo/playlist/getbysharetoken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareToken }),
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async addUserToSharedPlaylistByShareToken(shareToken: string, userId: number): Promise<boolean> {
    try {
      const response = await fetch('/todo/playlist/addbysharetoken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareToken, userId }),
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // ───────────── Movie Playlists (public gallery) ─────────────

  async getMoviePlaylists(): Promise<MoviePlaylist[] | null> {
    try {
      const response = await fetch('/todo/movieplaylist/getall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async createMoviePlaylist(userId: number, name: string): Promise<string | null> {
    try {
      const response = await fetch('/todo/movieplaylist/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async deleteMoviePlaylist(userId: number, playlistId: number): Promise<string | null> {
    try {
      const response = await fetch('/todo/movieplaylist/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async renameMoviePlaylist(userId: number, playlistId: number, name: string): Promise<string | null> {
    try {
      const response = await fetch('/todo/movieplaylist/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId, name }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async saveMoviePlaylistEntries(userId: number, playlistId: number, todoIds: number[]): Promise<string | null> {
    try {
      const response = await fetch('/todo/movieplaylist/saveentries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, playlistId, todoIds }),
      });
      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async getMoviePlaylistEntries(playlistId: number): Promise<Todo[] | null> {
    try {
      const response = await fetch('/todo/movieplaylist/getentries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId }),
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }
}
