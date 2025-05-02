// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user/user';
import { HttpErrorResponse } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class FavouriteService {
  async getFavourites(search?: string, page = 1, pageSize = 10, showAll = false, orderBy?: string, userId?: number) {
    try {
      const response = await fetch(`/favourite/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Search: search,
          Page: page,
          PageSize: pageSize,
          OrderBy: orderBy,
          UserId: userId,
          ShowAll: showAll
        }),
      });
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async addFavourite(userId: number, favoriteId: number) {
    try {
      const response = await fetch(`/favourite/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, FavouriteId: favoriteId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async removeFavourite(userId: number, favoriteId: number) {
    try {
      const response = await fetch(`/favourite/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, FavouriteId: favoriteId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async deleteFavourite(userId: number, favoriteId: number) {
    try {
      const response = await fetch(`/favourite/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, FavouriteId: favoriteId }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }

  async updateFavourites(user: User, url: string, id: number, imageUrl?: string, name?: string) {
    try {
      const response = await fetch(`/favourite/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Url: url, ImageUrl: imageUrl, id: id, CreatedBy: user.id, Name: name }),
      });
      if (!response.ok) {
        return await response.text();
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      }
      return "Error.";
    }
  }
  async visit(favouriteId: number) {
    try {
      const response = await fetch(`/favourite/visit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(favouriteId),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  }
}
