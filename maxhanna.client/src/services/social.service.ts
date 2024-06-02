import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { Story } from './datacontracts/story';
import { StoryComment } from './datacontracts/story-comment';

@Injectable({
  providedIn: 'root'
})
export class SocialService {
  async getStories(user?: User, search?: string) {
    var params = new URLSearchParams({ search: search! });

    try { 
      const res = await fetch('/social' + (search ? '?' + params : ''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch stories');
      }
      return await res.json() as Story[];
    } catch (error) {
      console.error('Error fetching stories:', error);
      return null;
    }
  }

  async postStory(user: User, story: Story) {
    try {
      const res = await fetch('/social/post-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({user, story}),
      });

      if (!res.ok) {
        throw new Error('Failed to post story');
      }
      return 'Story posted successfully';
    } catch (error) {
      console.error('Error posting story:', error);
      return null;
    }
  }

  async getComments(storyId: number, user?: User) {
    try {
      const res = await fetch(`/social/${storyId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch comments');
      }
      return await res.json() as StoryComment[];
    } catch (error) {
      console.error('Error fetching comments:', error);
      return null;
    }
  }

  async upvoteStory(user: User, storyId: number, upvote: boolean) {
    try {
      const body = {
        storyId: storyId,
        user: user,
        upvote: upvote
      };

      const res = await fetch('/social/story/upvote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('Failed to upvote comment');
      }
      return 'Comment upvoted successfully';
    } catch (error) {
      console.error('Error upvoting comment:', error);
      return null;
    }
  }

  async downvoteStory(user: User, storyId: number, downvote: boolean) {
    try {
      const body = {
        storyId: storyId,
        user: user,
        downvote: downvote
      };

      const res = await fetch('/social/story/downvote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('Failed to downvote comment');
      }
      return 'Comment downvoted successfully';
    } catch (error) {
      console.error('Error downvoting comment:', error);
      return null;
    }
  }
  async upvoteComment(user: User, commentId: number, upvote: boolean) {
    try {
      const body = {
        commentId: commentId,
        user: user,
        upvote: upvote
      };

      const res = await fetch('/social/comment/upvote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('Failed to upvote comment');
      }
      return 'Comment upvoted successfully';
    } catch (error) {
      console.error('Error upvoting comment:', error);
      return null;
    }
  }

  async downvoteComment(user: User, commentId: number, downvote: boolean) {
    try {
      const body = {
        commentId: commentId,
        user: user,
        downvote: downvote
      };

      const res = await fetch('/social/comment/downvote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('Failed to downvote comment');
      }
      return 'Comment downvoted successfully';
    } catch (error) {
      console.error('Error downvoting comment:', error);
      return null;
    }
  }
  async getMetadata(user: User, url: string) {
    try {
      const res = await fetch('/social/getmetadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, user }),
      });

      if (!res.ok) {
        throw new Error('Failed to get metadata');
      }
      return res.json();
    } catch (error) {
      console.error('Error getting metadata:', error);
      return null;
    }
  }
}
