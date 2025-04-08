// user.service.ts
import { Injectable } from '@angular/core'; 
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class NotepadService {
  async getNote(userId: number, id: number) {
    try {
      const response = await fetch(`/notepad/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(userId), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    } 
  } 
  async getNotes(userId:number, search?: string) {
    try {
      const response = await fetch(`/notepad/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify({ UserId: userId, Search: search }), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
  async shareNote(userId: number, user2Id: number, noteId: number) {
    try {
      const response = await fetch(`/notepad/share/${noteId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify({ user1Id: userId, user2Id: user2Id }), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
  async addNote(userId: number, text: string) {
    try {
      const response = await fetch(`/notepad/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify({ userId: userId, note: text }), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    } 
  }
  async updateNote(userId: number, text: string, id: number) {
    try {
      const response = await fetch(`/notepad/update/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify({ userId: userId, note: text }), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
  async deleteNote(userId: number, id: number) {
    try {
      const response = await fetch(`/notepad/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(userId), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
}
