// user.service.ts
import { Injectable } from '@angular/core';
import { FileEntry } from './datacontracts/file/file-entry';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class CommentService { 
  async addComment(comment: string, user?: User, fileId?: number, storyId?: number, selectedFiles?: FileEntry[]) {
    if ((fileId && storyId) || (!fileId && !storyId)) {
      return;
    }
    try {
      const response = await fetch(`/comment/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, fileId, storyId, selectedFiles, comment }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }


  async deleteComment(user: User, commentId: number) {
    try {
      const response = await fetch(`/comment/deletecomment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, commentId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }


  async editComment(user: User, commentId: number, text: string) {
    try {
      const response = await fetch(`/comment/editcomment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, commentId, text }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async upvoteComment(user: User, commentId: number) {
    try {
      const response = await fetch(`/comment/upvotecomment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: user, commentId, upvote: true, downvote: false }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }

  async downvoteComment(user: User, commentId: number) {
    try {
      const response = await fetch(`/comment/downvotecomment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: user, commentId, upvote: false, downvote: true }),
      });

      return await response.text();
    } catch (error) {
      throw error;
    }
  }

}
