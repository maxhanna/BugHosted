import { Injectable } from '@angular/core'; 
import { User } from './datacontracts/user/user';
import { FriendRequest } from './datacontracts/friends/friendship-request';

@Injectable({
  providedIn: 'root'
})
export class FriendService {
  async getFriendRequests(user: User) {
    try {
      const response = await fetch(`/friend/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      console.log(error);
      return `Error occured while getting friend requests: ${error}`;
    }
  }

  async getFriends(user: User) {
    if (!user || user.id == 0) return;
    try {
      const response = await fetch(`/friend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      console.log(error as string);
      return `Error occured while getting friends: ${error}`;
    }
  }

  async sendFriendRequest(sender: User, receiver: User) {
    try {
      const response = await fetch(`/friend/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sender, receiver }),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while sending friend request: ${error}`;
    }
  }

  async acceptFriendRequest(request: FriendRequest) {
    try {
      const response = await fetch(`/friend/request/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while accepting friend request: ${error}`;
    }
  }

  async rejectFriendRequest(request: FriendRequest) {
    try {
      const response = await fetch(`/friend/request/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while rejecting friend request: ${error}`;
    }
  }

  async deleteFriendRequest(request: FriendRequest) {
    try {
      const response = await fetch(`/friend/request/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while rejecting friend request: ${error}`;
    }
  }

  async removeFriend(user: User, friend: User) {
    try {
      const response = await fetch(`/friend/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ User: user, Friend: friend }),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while removing friend: ${error}`;
    }
  }
}
