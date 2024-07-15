import { Injectable } from '@angular/core';  
import { WeatherResponse } from './datacontracts/weather/weather-response';
import { User } from './datacontracts/user/user';

@Injectable({
  providedIn: 'root'
})
export class WeatherService { 
  async getWeather(user: User) {
    try {
      const res = await fetch('/weatherforecast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      if (!res.ok) {
        throw new Error('Failed to fetch weather data');
      }
      const data = await res.json();
      return data as WeatherResponse;
    } catch (error) {
      console.error('Error fetching weather data:', error);
      return null; 
    }
  }
  async getWeatherLocation(user: User) {
    try {
      const response = await fetch(`/weatherforecast/getweatherlocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  } 
  async updateWeatherLocation(user: User, location: string, city?: string) {
    try {
      const response = await fetch(`/weatherforecast/updateweatherlocation`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, location, city }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  } 
}
