import { Injectable } from '@angular/core';
import { Story } from './datacontracts/social/story';
import { StoryResponse } from './datacontracts/social/story-response';
import { User } from './datacontracts/user/user';
 
@Injectable({
  providedIn: 'root'
})
export class SocialService {
  async getStories(user?: User, search?: string, topics?: string, profileUserId?: number, page: number = 1, pageSize: number = 10) {
    let params = new URLSearchParams();
    if (search)
      params.append("search", search);
    if (topics)
      params.append("topics", topics);
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
  async editStory(user: User, story: Story) {
    try {
      const res = await fetch('/social/edit-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, story }),
      });

      if (!res.ok) {
        return 'Error editing story';
      }
      return 'Story editing successfully';
    } catch (error) {
      console.error('Error editing story:', error);
      return 'Error editing story';
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
