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
  constructor(private http: HttpClient) { super(); }

  ngOnInit() {
    this.getForecasts();
  }

  getForecasts() {
    this.promiseWrapper(lastValueFrom(this.http.get<WeatherResponse>('/weatherforecast'))).then(res => this.weather = res);
  } 
}
