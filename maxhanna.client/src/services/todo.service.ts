// user.service.ts
import { Injectable } from '@angular/core';
import { Todo } from './datacontracts/todo';
import { MusicPlaylist } from './datacontracts/music-playlist';

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
  async getTodoCount(userId: number, type: string, search?: string) {
    try {
      let params = new URLSearchParams({ type: type });
      if (search) {
        params.set("search", search);
      }
      const response = await fetch('/todo/getcount?' + params, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userId)
      });
      return await response.json(); // expects { count: number }
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
  async editTodo(id: number, content: string, url?: string, fileId?: number) {
    try {
      const response = await fetch('/todo/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: id, content: content, url: url, fileId: fileId }),
      });

      return await response.text();
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
}
