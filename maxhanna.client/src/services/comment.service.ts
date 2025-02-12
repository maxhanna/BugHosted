// user.service.ts
import { Injectable } from '@angular/core';
import { FileEntry } from './datacontracts/file/file-entry';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class CommentService { 
  async addComment(comment: string, user?: User, fileId?: number, storyId?: number, commentId?: number, selectedFiles?: FileEntry[]) {
    if ((fileId && storyId && commentId) || (!fileId && !storyId && !commentId)) {
      return "Error: No Id supplied";
    }
    try {
      const response = await fetch(`/comment/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, fileId, storyId, commentId, selectedFiles, comment }),
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

  async getCommentById(commentId: number) {
    try {
      const response = await fetch(`/comment/getcommentbyid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commentId),
      });

      return await response.json();
    } catch (error) {
      throw error;
    }
  }
  async getCommentDataByIds(commentId: number) {
    try {
      const response = await fetch(`/comment/getcommentdata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify( commentId ),
      });

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

}
