
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
  async getNotifications(user: User): Promise<UserNotification[]> {
    return await this.fetchData('/notification', user);
  }
  async deleteNotification(user: User, notificationId?: number): Promise<string> {
    return await this.fetchData('/notification/delete', { User: user, NotificationId: notificationId });
  }
  async readNotifications(user: User, notificationIds?: number[]): Promise<string> {
    return await this.fetchData('/notification/read', { User: user, NotificationIds: notificationIds });
  }
  async unreadNotifications(user: User, notificationIds?: number[]): Promise<string> {
    return await this.fetchData('/notification/unread', { User: user, NotificationIds: notificationIds });
  }
  async subscribeToTopic(user: User, token: string, topic: string): Promise<string> {
    return await this.fetchData('/notification/subscribe', { User: user, Token: token, Topic: topic });
  }
  async notifyUsers(fromUser: User, toUser: User[], message: string) {
    return await this.fetchData('/notification/notifyusers', { FromUser: fromUser, ToUser: toUser, Message: message });
  }
  async createNotifications(params: {
    fromUser: User, toUser: User[], message: string,
    storyId?: number, fileId?: number, chatId?: number,
    commentId?: number, userProfileId?: number,
  }) {
    return await this.fetchData('/notification/createnotifications',
      {
        FromUser: params.fromUser, ToUser: params.toUser, Message: params.message,
        StoryId: params.storyId, FileId: params.fileId, ChatId: params.chatId,
        CommentId: params.commentId, UserProfileId: params.userProfileId
      });
  }  

}
