// user.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs'; 
import { User } from './datacontracts/user';

@Injectable({
  providedIn: 'root'
})
export class NotepadService {
  async getNote(user: User, id: number) {
    try {
      const response = await fetch(`/notepad/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(user), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    } 
  } 
  async getNotes(user: User) {
    try {
      const response = await fetch(`/notepad/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(user), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
  async shareNote(user: User, user2: User, noteId: number) {
    try {
      const response = await fetch(`/notepad/share/${noteId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify({ user1: user, user2: user2 }), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
  async addNote(user: User, text: string) {
    try {
      const response = await fetch(`/notepad/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify({ user: user, note: text }), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    } 
  }
  async updateNote(user: User, text: string, id: number) {
    try {
      const response = await fetch(`/notepad/update/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify({ user: user, note: text }), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
  async deleteNote(user: User, id: number) {
    try {
      const response = await fetch(`/notepad/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json', // Set the Content-Type header to indicate JSON data
        },
        body: JSON.stringify(user), // Convert the user object to JSON string
      });

      return await response.json(); // Parse JSON response 
    } catch (error) {
      return null; // Return null in case of error
    }
  }
}
