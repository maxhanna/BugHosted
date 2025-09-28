// user.service.ts
import { Injectable } from '@angular/core';
import { FileEntry } from './datacontracts/file/file-entry';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class CommentService { 
  async addComment(comment: string,
    userId?: number,
    fileId?: number,
    storyId?: number,
    commentId?: number,
    userProfileId?: number,
    selectedFiles?: FileEntry[],
    city?: string,
    country?: string,
    ip?: string) {
    if ((fileId && storyId && commentId) || (!fileId && !storyId && !commentId)) {
      alert("Error: Must supply exactly one of FileId, StoryId, or CommentId");
      return "Error: No Id supplied";
    }
    try {
      const response = await fetch(`/comment/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          UserId: userId,
          FileId: fileId,
          StoryId: storyId,
          CommentId: commentId,
          UserProfileId: userProfileId,
          SelectedFiles: selectedFiles,
          Comment: comment,
          City: city,
          Country: country,
          Ip: ip
        }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
  async deleteComment(userId: number, commentId: number) {
    try {
      const response = await fetch(`/comment/deletecomment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, commentId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }


  async editComment(userId: number, commentId: number, text: string) {
    try {
      const response = await fetch(`/comment/editcomment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, commentId, text }),
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
}
