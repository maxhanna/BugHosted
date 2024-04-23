import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

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
  public forecasts: WeatherForecast[] = [];
  constructor(private http: HttpClient) { super(); }

  ngOnInit() {
    this.getForecasts();
  }

  getForecasts() {
    this.promiseWrapper(lastValueFrom(this.http.get<WeatherForecast[]>('/weatherforecast'))).then(res => this.forecasts = res);
  } 
}
