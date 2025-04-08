import { Injectable } from '@angular/core';  
import { WeatherResponse } from './datacontracts/weather/weather-response';

@Injectable({
  providedIn: 'root'
})
export class WeatherService { 
  async getWeather(userId: number) {
    try {
      const res = await fetch('/weatherforecast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
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
  async getWeatherLocation(userId: number) {
    try {
      const response = await fetch(`/weatherforecast/getweatherlocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  } 
  async updateWeatherLocation(userId: number, location: string, city?: string, country?: string) {
    try {
      const response = await fetch(`/weatherforecast/updateweatherlocation`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, location, city, country }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
  } 
}
