// user.service.ts
import { Injectable } from '@angular/core';
import { Topic } from './datacontracts/topics/topic';
import { User } from './datacontracts/user/user';
import { TopicRank } from './datacontracts/topics/topic-rank';

@Injectable({
  providedIn: 'root'
})
export class TopicService {
  
  topStoryTopics?: TopicRank[] = undefined;
  topFileTopics?: TopicRank[] = undefined;
  ignoredTopics?: Topic[] = undefined;
  favTopics?: Topic[] = undefined;
  
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
  async addFavTopic(userId: number, topics: Topic[]) {
    try {
      const response = await fetch(`/topic/addfavtopic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, TopicIds: topics.map(x => x.id) }),
      });
      if (!this.favTopics) {
        this.favTopics = [];
      }
      this.favTopics.concat(topics);
      return await response.json();
    } catch (error) {
    }
  }
  async addIgnoredTopic(userId: number, topic: Topic) {
    try {
      const response = await fetch(`/topic/addignoredtopic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, TopicIds: [topic.id] }),
      });
      if (!this.ignoredTopics) {
        this.ignoredTopics = [];
      }
      this.ignoredTopics.push(topic);
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
      this.favTopics = this.favTopics?.filter(x => topicIds.includes(x.id));
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
      this.ignoredTopics = this.ignoredTopics?.filter(x => topicIds.includes(x.id));
      return await response.json();
    } catch (error) {
    }
  }
  async getTopStoryTopics() {
    try {
      if (this.topStoryTopics) {
        return this.topStoryTopics;
      }
      const res = await fetch('/topic/gettopstorytopics', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to get top topics');
      }
      this.topStoryTopics = await res.json() as TopicRank[]; 
      return this.topStoryTopics;
    } catch (error) {
      console.error('Error getting top topics:', error);
      return null;
    }
  }
  async getFavTopics(user: User) {
    try {
      if (this.favTopics) {
        return this.favTopics;
      }
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
      this.favTopics = await res.json() as Topic[];
      return this.favTopics;
    } catch (error) {
      console.error('Error getting fav topics:', error);
      return null;
    }
  }
  async getIgnoredTopics(user: User) {
    try {
      if (this.ignoredTopics) {
        return this.ignoredTopics;
      }
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
      this.ignoredTopics = await res.json() as Topic[];
      return this.ignoredTopics;
    } catch (error) {
      console.error('Error getting ignored topics:', error);
      return null;
    }
  }
  async getTopFileTopics() {
    try {
      if (this.topFileTopics) {
        return this.topFileTopics;
      }
      const res = await fetch('/topic/gettopfiletopics', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to get top file topics');
      }
      this.topFileTopics = await res.json();
      return this.topFileTopics;
    } catch (error) {
      console.error('Error getting top file topics:', error);
      return null;
    }
  } 
}
