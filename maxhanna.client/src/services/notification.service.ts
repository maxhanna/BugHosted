
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user'; 
import { UserNotification } from './datacontracts/notification/user-notification';


@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  private async fetchData(url: string, body: any) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      const res = await response;
      if (!res.ok) {
        return await res.text();
      }

      const contentType = response.headers.get('Content-Type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(error);
    }
  }
  async getNotifications(userId: number): Promise<UserNotification[]> {
    return await this.fetchData('/notification', userId);
  }
  async deleteNotification(userId: number, notificationId?: number): Promise<string> {
    return await this.fetchData('/notification/delete', { UserId: userId, NotificationId: notificationId });
  }
  async readNotifications(userId: number, notificationIds?: number[]): Promise<string> {
    return await this.fetchData('/notification/read', { UserId: userId, NotificationIds: notificationIds });
  }
  async unreadNotifications(userId: number, notificationIds?: number[]): Promise<string> {
    return await this.fetchData('/notification/unread', { UserId: userId, NotificationIds: notificationIds });
  }
  async stopNotifications(userId: number, fromUserId: number): Promise<string> {
    return await this.fetchData('/notification/stopnotifications', { UserId: userId, FromUserId: fromUserId });
  }
  async allowNotifications(userId: number, fromUserId: number): Promise<string> {
    return await this.fetchData('/notification/allownotifications', { UserId: userId, FromUserId: fromUserId });
  }
  async getStoppedNotifications(userId: number): Promise<number[]> {
    return await this.fetchData('/notification/getstoppednotifications', userId);
  }
  async subscribeToTopic(userId: number, token: string, topic: string): Promise<string> {
    return await this.fetchData('/notification/subscribe', { UserId: userId, Token: token, Topic: topic });
  } 
  async createNotifications(params: {
    fromUserId: number, toUserIds: number[], message: string,
    storyId?: number, fileId?: number, chatId?: number,
    commentId?: number, userProfileId?: number,
  }) {
    return await this.fetchData('/notification/createnotifications',
      {
        FromUserId: params.fromUserId, ToUserIds: params.toUserIds, Message: params.message,
        StoryId: params.storyId, FileId: params.fileId, ChatId: params.chatId,
        CommentId: params.commentId, UserProfileId: params.userProfileId
      });
  }  

}
