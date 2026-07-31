import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FollowService {

  async toggleFollow(userId: number, followType: 'story' | 'file' | 'comment', followId: number): Promise<{ following: boolean; message: string } | null> {
    try {
      const response = await fetch(`/follow/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserId: userId, FollowType: followType, FollowId: followId }),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Failed to toggle follow:', error);
      return null;
    }
  }

  async checkFollow(userId: number, followType: 'story' | 'file' | 'comment', followId: number): Promise<boolean> {
    try {
      const response = await fetch(`/follow/check?userId=${userId}&followType=${followType}&followId=${followId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.following === true;
    } catch (error) {
      console.error('Failed to check follow:', error);
      return false;
    }
  }

  async listFollows(userId: number): Promise<{ followType: string; followId: number; createdAt: string }[]> {
    try {
      const response = await fetch(`/follow/list?userId=${userId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error('Failed to list follows:', error);
      return [];
    }
  }
}
