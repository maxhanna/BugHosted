import { Injectable } from '@angular/core'; 

@Injectable({
  providedIn: 'root'
})
export class FriendService {
  async getFriendRequests(userId: number) {
    try {
      const response = await fetch(`/friend/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      console.log(error);
      return `Error occured while getting friend requests: ${error}`;
    }
  }

  async getFriends(userId: number) {
    if (!userId) return;
    try {
      const response = await fetch(`/friend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      console.log(error as string);
      return `Error occured while getting friends: ${error}`;
    }
  }

  async sendFriendRequest(senderId: number, receiverId: number) {
    try {
      const response = await fetch(`/friend/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ senderId, receiverId }),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while sending friend request: ${error}`;
    }
  }

  async acceptFriendRequest(senderId: number, receiverId: number) {
    try {
      const response = await fetch(`/friend/request/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ SenderId: senderId, ReceiverId: receiverId }),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while accepting friend request: ${error}`;
    }
  }

  async rejectFriendRequest(requestId: number, userId: number) {
    try {
      const response = await fetch(`/friend/request/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ RequestId: requestId, UserId: userId }),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while rejecting friend request: ${error}`;
    }
  }

  async deleteFriendRequest(requestId: number) {
    try {
      const response = await fetch(`/friend/request/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestId),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while rejecting friend request: ${error}`;
    }
  }

  async removeFriend(userId: number, friendId: number) {
    try {
      const response = await fetch(`/friend/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, FriendId: friendId }),
      });

      return await response.text();
    } catch (error) {
      console.log(error);
      return `Error occured while removing friend: ${error}`;
    }
  }

  // Returns { count: number } of active friends within the last N minutes (default 10)
  async getActiveFriendCount(userId: number, minutes: number = 10) {
    if (!userId) return { count: 0 };
    try {
      const response = await fetch(`/friend/activecount`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, Minutes: minutes })
      });
      if (!response.ok) {
        return { count: 0 };
      }
      return await response.json();
    } catch (error) {
      console.log(error);
      return { count: 0 };
    }
  }
}
