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
      this.weather = res
      this.collapsedDays = res.forecast.forecastday.slice(1).map((day: { date: any; }) => day.date);
    });
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
