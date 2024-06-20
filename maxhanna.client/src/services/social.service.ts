import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { Story } from './datacontracts/story';
import { StoryComment } from './datacontracts/story-comment';
import { UpDownVoteCounts } from './datacontracts/up-down-vote-counts';
import { StoryResponse } from './datacontracts/story-response';

@Injectable({
  providedIn: 'root'
})
export class SocialService {
  async getStories(user?: User, search?: string, profileUserId?: number, page: number = 1, pageSize: number = 10) {
    var params = new URLSearchParams();
    if (search)
      params.append("search", search);
    if (page)
      params.append("page", page + '');
    if (pageSize)
      params.append("pageSize", pageSize + '');

    try {
      const res = await fetch('/social' + (params.size > 0 ? ('?' + params) : ''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, profileUserId }),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch stories');
      }
      return await res.json() as StoryResponse;
    } catch (error) {
      console.error('Error fetching stories:', error);
      return null;
    }
  }

  async postStory(user: User, story: Story, profileStoryId?: number) {
    try {
      const res = await fetch('/social/post-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, story, profileStoryId }),
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

  async deleteStory(user: User, story: Story) {
    try {
      const res = await fetch('/social/delete-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, story }),
      });

      if (!res.ok) {
        return 'Error deleting story';
      }
      return 'Story deleted successfully';
    } catch (error) {
      console.error('Error deleting story:', error);
      return 'Error deleting story';
    }
  }
  async comment(storyId: number, comment: string, user?: User) {
    try {
      const response = await fetch(`/social/comment/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, storyId, comment }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      throw error;
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
      return await res.json() as UpDownVoteCounts;
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
      return await res.json() as UpDownVoteCounts;
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
      return await res.json() as UpDownVoteCounts;
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
      return await res.json() as UpDownVoteCounts;
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
