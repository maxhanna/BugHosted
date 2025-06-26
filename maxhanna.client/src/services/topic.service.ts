// user.service.ts
import { Injectable } from '@angular/core';
import { Topic } from './datacontracts/topics/topic';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class TopicService {
  async getTopics(topic?: string, user?: User) {
    try {
      const response = await fetch(`/topic/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: user?.id, Topic: new Topic(0, topic ?? "") }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async addTopic(userId: number, topic: Topic) {
    try {
      const response = await fetch(`/topic/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, topic }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async addFavTopic(userId: number, topicIds: number[]) {
    try {
      const response = await fetch(`/topic/addfavtopic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, TopicIds: topicIds }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async addIgnoredTopic(userId: number, topicIds: number[]) {
    try {
      const response = await fetch(`/topic/addignoredtopic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, TopicIds: topicIds }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async removeFavTopic(userId: number, topicIds: number[]) {
    try {
      const response = await fetch(`/topic/removefavtopic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, TopicIds: topicIds }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async removeIgnoredTopic(userId: number, topicIds: number[]) {
    try {
      const response = await fetch(`/topic/removeignoredtopic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, TopicIds: topicIds }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async getTopStoryTopics() {
    try {
      const res = await fetch('/topic/gettopstorytopics', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to get top topics');
      }
      return res.json();
    } catch (error) {
      console.error('Error getting top topics:', error);
      return null;
    }
  }
  async getFavTopics(user: User) {
    try {
      const res = await fetch('/topic/getFavTopics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user.id),
      });

      if (!res.ok) {
        throw new Error('Failed to get fav topics');
      }
      return res.json();
    } catch (error) {
      console.error('Error getting fav topics:', error);
      return null;
    }
  }
  async getIgnoredTopics(user: User) {
    try {
      const res = await fetch('/topic/getIgnoredTopics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user.id),
      });

      if (!res.ok) {
        throw new Error('Failed to get ignored topics');
      }
      return res.json();
    } catch (error) {
      console.error('Error getting ignored topics:', error);
      return null;
    }
  }
  async getTopFileTopics() {
    try {
      const res = await fetch('/topic/gettopfiletopics', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to get top file topics');
      }
      return res.json();
    } catch (error) {
      console.error('Error getting top file topics:', error);
      return null;
    }
  } 
}
