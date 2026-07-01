import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class HealthTrackerService {
    private apiUrl = 'https://localhost:5001/HealthTracker'; // Adjust URL as needed

    constructor(private http: HttpClient) { }

    addExercise(exercise: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/exercise`, exercise);
    }

    addFoodItem(foodItem: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/food`, foodItem);
    }
}