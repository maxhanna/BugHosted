// user.service.ts
import { Injectable } from '@angular/core';
import { Topic } from './datacontracts/topics/topic';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class TopicService {
  async getTopics(topic?: string) {
    try {
      const response = await fetch(`/topic/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(topic),
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
  async getTopStoryTopics() {
    try {
      const res = await fetch('/topic/gettopstorytopics', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to get top story topics');
      }
      return res.json();
    } catch (error) {
      console.error('Error getting top story topics:', error);
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
