import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { WeatherResponse } from '../weather-response';

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

  constructor(private http: HttpClient) { super(); }

  ngOnInit() {
    this.getForecasts();
  }
  getForecasts() {
    this.promiseWrapper(lastValueFrom(this.http.get<WeatherResponse>('/weatherforecast'))).then(res => {
      this.weather = res;
      this.collapsedDays = res.forecast.forecastday.map((day: { date: any; }) => day.date);
    });
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

    // Calculate the average for numerical values
    let numericAverage: number | string = countNumeric > 0 ? sum / countNumeric : 0;

    // Calculate the most frequent text value
    let maxTextCount = 0;
    let mostFrequentText: string | undefined = '';
    for (let text in textMap) {
      if (textMap[text] > maxTextCount) {
        maxTextCount = textMap[text];
        mostFrequentText = text;
      }
    }

    // If there's a tie, return 'Mixed' for text values
    if (countText > 0 && maxTextCount === countText) {
      return 'Mixed';
    }

    // Return the most frequent text value if it exists
    if (mostFrequentText) {
      return mostFrequentText;
    }

    // Return the numeric average if no text value is dominant
    return numericAverage.toFixed(2);
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
}
