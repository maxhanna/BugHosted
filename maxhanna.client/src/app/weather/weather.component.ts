import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { WeatherService } from '../../services/weather.service';
import { WeatherResponse } from '../../services/datacontracts/weather/weather-response';
interface WeatherForecast {
  date: string;
  temperatureC: number;
  temperatureF: number;
  summary: string;
}

@Component({
  selector: 'app-weather',
  templateUrl: './weather.component.html',
  styleUrl: './weather.component.css'
})
export class WeatherComponent extends ChildComponent implements OnInit {
  weather: WeatherResponse = new WeatherResponse();
  collapsedDays: string[] = [];
  city?: string = undefined;
  location?: string = undefined;

  constructor(private weatherService: WeatherService) { super(); }

  ngOnInit() {
    this.getForecasts();
    this.getLocation();
  }
  async getLocation() {
    try {
      const res = await this.weatherService.getWeatherLocation(this.parentRef?.user!);
      if (res && res.city) {
        this.city = res.city;
      }
      if (res && res.location) {
        this.location = res.location;
      }
    } catch { }
  }
  async getForecasts() {
    this.startLoading();

    const res = await this.weatherService.getWeather(this.parentRef?.user!);
    if (res) {
      this.weather = res;
      this.collapsedDays = res.forecast.forecastday.map((day: { date: any; }) => day.date);
    }
    
    this.stopLoading();
  }
  calculateAverage(hours: any[], property: string): string | number {
    if (hours.length === 0) return 0;

    let sum: number | string = 0;
    let countNumeric = 0;
    let countText = 0;
    let textMap: { [key: string]: number } = {};

    for (let hour of hours) {
      let value = hour[property];
      if (property == "conditionIcon") {
        value = hour["condition"].icon;
      }
      else if (property == "conditionText") {
        value = hour["condition"].text;
      }
      if (typeof value === 'number') {
        sum += value;
        countNumeric++;
      } else if (typeof value === 'string') {
        if (!textMap[value]) {
          textMap[value] = 1;
        } else {
          textMap[value]++;
        }
        countText++;
      }
    } 
    let numericAverage: number | string = countNumeric > 0 ? sum / countNumeric : 0; 
    let maxTextCount = 0;
    let mostFrequentText: string | undefined = '';
    for (let text in textMap) {
      if (textMap[text] > maxTextCount) {
        maxTextCount = textMap[text];
        mostFrequentText = text;
      }
    } 
    if (countText > 0 && maxTextCount === countText) {
      return 'Mixed';
    } 
    if (mostFrequentText) {
      return mostFrequentText;
    }

    return numericAverage.toFixed(0);
  }

  toggleDay(date: string) {
    const index = this.collapsedDays.indexOf(date);
    if (index === -1) {
      this.collapsedDays.push(date);
    } else {
      this.collapsedDays.splice(index, 1);
    }
  }
  isCollapsed(date: string) {
    return this.collapsedDays.includes(date);
  }
  isCurrentHour(time: string): boolean {
    const currentTime = new Date();
    const hour = currentTime.getHours();
    const timeParts = time.split(' ');
    const hourPart = parseInt(timeParts[1].split(':')[0]);
    return hourPart === hour;
  }
}
