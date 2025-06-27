import { Injectable } from '@angular/core';
import { Story } from './datacontracts/social/story';
import { StoryResponse } from './datacontracts/social/story-response';
import { User } from './datacontracts/user/user';
import { Topic } from './datacontracts/topics/topic';
 
@Injectable({
  providedIn: 'root'
})
export class SocialService {
  async getStories(userId?: number, search?: string, topics?: string, profileUserId?: number, storyId?: number, page: number = 1, pageSize: number = 10, showHiddenStories = false, showPostsFromFilter: string = 'all') {
    let params = new URLSearchParams();
    if (search)
      params.append("search", search);
    if (topics)
      params.append("topics", topics);
    if (page)
      params.append("page", page + '');
    if (pageSize)
      params.append("pageSize", pageSize + '');
    if (showHiddenStories)
      params.append("showHiddenStories", showHiddenStories + '');
    if (showPostsFromFilter && showPostsFromFilter !== 'all')
      params.append("showPostsFromFilter", showPostsFromFilter);
    

    try {
      const res = await fetch('/social' + (params.size > 0 ? ('?' + params) : ''), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, ProfileUserId: profileUserId, StoryId: storyId }),
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

  async postStory(userId: number, story: Story, encryptedUserId: string, profileStoryId?: number) {
    try {
      const res = await fetch('/social/post-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId
        },
        body: JSON.stringify({ userId, story, profileStoryId }),
      });

      if (!res.ok) {
        throw new Error('Failed to post story');
      }
      return res.json();
    } catch (error) {
      console.error('Error posting story:', error);
      return null;
    }
  }

  async deleteStory(userId: number, story: Story, encryptedUserId: string) {
    try {
      const res = await fetch('/social/delete-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId
        },
        body: JSON.stringify({ userId, story }),
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
  async editStory(userId: number, story: Story, encryptedUserId: string) {
    try {
      const res = await fetch('/social/edit-story', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Encrypted-UserId': encryptedUserId,
        },
        body: JSON.stringify({ userId, story }),
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
  async editTopics(story: Story, topics: Topic[]) {
    try {
      const res = await fetch('/social/edit-topics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Topics: topics, Story: story }),
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
  async hideStory(userId: number, storyId: number) {
    try {
      const res = await fetch('/social/hide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, StoryId: storyId }),
      });

      if (!res.ok) {
        return 'Error hiding post';
      }
      return 'Post hidden successfully';
    } catch (error) {
      console.error('Error hiding post:', error);
      return 'Error hiding post';
    }
  }

  async unhideStory(userId: number, storyId: number) {
    try {
      const res = await fetch('/social/unhide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, StoryId: storyId }),
      });

      if (!res.ok) {
        return 'Error unhidden post';
      }
      return 'Post unhidden successfully';
    } catch (error) {
      console.error('Error unhidden post:', error);
      return 'Error unhidden post';
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
  async getLatestStoryId() {
    try {
      const res = await fetch('/social/getlateststoryid', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }, 
      });

      if (!res.ok) {
        throw new Error('Failed to get latest post id');
      }
      return res.text();
    } catch (error) {
      console.error('Error getting latest post id:', error);
      return null;
    }
  }
}
