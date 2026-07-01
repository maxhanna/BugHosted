import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { WeatherService } from '../../services/weather.service';
import { WeatherResponse } from '../../services/datacontracts/weather/weather-response';

@Component({
  selector: 'app-weather',
  templateUrl: './weather.component.html',
  styleUrl: './weather.component.css',
  standalone: false
})
export class WeatherComponent extends ChildComponent implements OnInit, OnDestroy {
  weather: WeatherResponse = new WeatherResponse();
  collapsedDays: string[] = [];
  city?: string = undefined;
  country?: string = undefined;
  location?: string = undefined;
  activeTab: 'now' | 'plus6' | 'plus12' = 'now';

  private tabInterval: any;
  private userInteracted = false;


  constructor(private weatherService: WeatherService) { super(); }

  ngOnInit() {
    this.getForecasts();
    this.getLocation();
    this.startTabRotation();
  }
  ngOnDestroy() {
    this.stopTabRotation();
  }
  async getLocation() {
    try {
      const res = await this.weatherService.getWeatherLocation(this.parentRef?.user?.id ?? 0);
      if (res && res.city) {
        this.city = res.city;
        this.country = res.country;
      }
      if (res && res.location) {
        this.location = res.location;
      }
    } catch { }
  }
  async getForecasts() {
    this.startLoading();

    const res = await this.weatherService.getWeather(this.parentRef?.user?.id ?? 0);
    if (res) {
      this.weather = res;
      this.collapsedDays = res.forecast.forecastday.map((day: { date: any; }) => day.date);
      this.weather.forecast.forecastday.forEach(fDay => {
        fDay.hour.forEach(hour => {
          hour.feelslike_c = this.calculateFeelsLikeC(hour.temp_c, hour.wind_kph, hour.humidity);
          hour.feelslike_f = this.calculateFeelsLikeF(hour.temp_f, hour.wind_mph, hour.humidity);
        });
      });
      this.weather.current.feelslike_c = this.calculateFeelsLikeC(this.weather.current.temp_c, this.weather.current.wind_kph, this.weather.current.humidity);
      this.weather.current.feelslike_f = this.calculateFeelsLikeF(this.weather.current.temp_f, this.weather.current.wind_mph, this.weather.current.humidity);
    }

    this.stopLoading();
  }
  calculateFeelsLikeC(temp_c: number, wind_kph: number, humidity: number) {
    const Ta = temp_c;
    const WS = wind_kph;
    const E = (humidity / 100) * (6.105 * Math.exp((17.27 * Ta) / (237.7 + Ta)));
    return parseInt((Ta + 0.33 * E - 0.7 * WS - 4).toFixed(2));
  }
  calculateFeelsLikeF(temp_f: number, wind_mph: number, humidity: number): number {
    const Ta_C = (temp_f - 32) * (5 / 9);
    const WS = wind_mph;
    const E = (humidity / 100) * (6.105 * Math.exp((17.27 * Ta_C) / (237.7 + Ta_C)));
    const feelsLikeF = (Ta_C + 0.33 * E - 0.7 * WS - 4) * (9 / 5) + 32;

    return parseInt(feelsLikeF.toFixed(2));
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
  createUpdateUserComponent() {
    this.parentRef?.createComponent('UpdateUserSettings', {
      showOnlyWeatherLocation: true,
      showOnlySelectableMenuItems: false,
      areSelectableMenuItemsExplained: false,
      inputtedParentRef: this.parentRef,
      previousComponent: "Weather"
    });
  }

  isCountryAmerica(country: string) {
    return country.toLowerCase().includes("united states") || country.toLowerCase().includes("america") || country.toLowerCase().includes("usa");
  }
  getFutureHours(hoursAhead: number): any[] {
    if (!this.weather?.forecast) return [];

    const now = new Date();
    const targetTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
    const targetHour = targetTime.getHours();

    const forecastDay = this.weather.forecast.forecastday.find(day => {
      const forecastDate = new Date(day.date);
      return forecastDate.getDate() === targetTime.getDate() &&
        forecastDate.getMonth() === targetTime.getMonth() &&
        forecastDate.getFullYear() === targetTime.getFullYear();
    });

    if (!forecastDay) return [];

    const hour = forecastDay.hour.find(hour => {
      const hourTime = new Date(hour.time);
      return hourTime.getHours() === targetHour;
    });

    return hour ? [hour] : []; // Return as array
  }
  getTargetHour(hoursAhead: number) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
    const targetHour = targetTime.getHours();
    return targetHour;
  }

  startTabRotation() {
    this.tabInterval = setInterval(() => {
      if (!this.userInteracted) {
        this.rotateToNextTab();
      }
    }, 5000); // Rotate every 5 seconds
  }

  stopTabRotation() {
    if (this.tabInterval) {
      clearInterval(this.tabInterval);
    }
  }

  rotateToNextTab() {
    switch (this.activeTab) {
      case 'now':
        this.activeTab = 'plus6';
        break;
      case 'plus6':
        this.activeTab = 'plus12';
        break;
      case 'plus12':
        this.activeTab = 'now';
        break;
    }
  }

  onTabClick(tab: 'now' | 'plus6' | 'plus12') {
    this.userInteracted = true;
    this.activeTab = tab;
    this.stopTabRotation();
  }
  getCurrentDate() {
    return new Date();
  }

  getLunarPhase() {
    const now = this.getCurrentDate();
    const day = now.getDate();
    const month = now.getMonth() + 1; // getMonth() returns0-11
    const year = now.getFullYear();

    // Calculate the Julian Day Number
    let a = Math.floor((14 - month) / 12);
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;

    const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;

    // Calculate the phase of the moon
    const daysSinceNewMoon = (jdn - 2451549.5) % 29.530588853;
    const phase = daysSinceNewMoon / 29.530588853;

    // Determine the lunar phase name
    if (phase < 0.03 || phase >= 0.97) {
      return 'New Moon';
    } else if (phase < 0.22) {
      return 'Waxing Crescent';
    } else if (phase < 0.28) {
      return 'First Quarter';
    } else if (phase < 0.47) {
      return 'Waxing Gibbous';
    } else if (phase < 0.53) {
      return 'Full Moon';
    } else if (phase < 0.72) {
      return 'Waning Gibbous';
    } else if (phase < 0.78) {
      return 'Last Quarter';
    } else {
      return 'Waning Crescent';
    }
  }
  getLunarPhaseEmoji() {
    const phase = this.getLunarPhase();
    switch (phase) {
      case 'New Moon': return '🌑';
      case 'Waxing Crescent': return '🌒';
      case 'First Quarter': return '🌓';
      case 'Waxing Gibbous': return '🌔';
      case 'Full Moon': return '🌕';
      case 'Waning Gibbous': return '🌖';
      case 'Last Quarter': return '🌗';
      case 'Waning Crescent': return '🌘';
      default: return '🌙';
    }
  }
}