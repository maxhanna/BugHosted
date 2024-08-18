
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

}
