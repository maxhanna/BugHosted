import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Recipe {
  id: number;
  userId: number;
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  tags: string[];
  imageFileIds: number[];
  externalLinks: string[];
  createdBy: string;
  createdAt: string;
}

export interface RecipePayload {
  userId: number;
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  tags: string[];
  imageFileIds: number[];
  externalLinks: string[];
  createdBy: string;
}

@Injectable({
  providedIn: 'root'
})
export class RecipeService {
  constructor(private http: HttpClient) { }

  getRecipes(search?: string): Observable<Recipe[]> {
    let params = new HttpParams();
    if (search) {
      params = params.set('search', search);
    }

    return this.http.get<Recipe[]>('/recipe', { params });
  }

  createRecipe(payload: RecipePayload): Observable<Recipe> {
    return this.http.post<Recipe>('/recipe', payload);
  }

  updateRecipe(id: number, payload: RecipePayload): Observable<Recipe> {
    return this.http.put<Recipe>(`/recipe/${id}`, payload);
  }
}