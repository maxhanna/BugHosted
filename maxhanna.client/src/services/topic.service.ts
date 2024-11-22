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
  async addTopic(user: User, topic: Topic) {
    try {
      const response = await fetch(`/topic/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, topic }),
      });

      return await response.json();
    } catch (error) {
    }
  }
  async getTopTopics() {
    try {
      const res = await fetch('/topic/gettoptopics', {
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
}
