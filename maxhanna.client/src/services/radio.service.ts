import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface RadioStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  country: string;
  language: string;
  tags: string;
  bitrate: number;
  votes: number;
}

export interface RadioCountry {
  name: string;
  stationcount: number;
}

export interface RadioLanguage {
  name: string;
  stationcount: number;
}

export interface RadioTag {
  name: string;
  stationcount: number;
}

export interface RadioFilters {
  country: string;
  language: string;
  tag: string;
}

@Injectable({
  providedIn: 'root'
})
export class RadioService {
  private readonly API_BASE_URL = 'https://at1.api.radio-browser.info/json';
  private readonly USER_AGENT = 'MaxHanna Music Player/1.0';

  constructor(private http: HttpClient) { }

  async fetchCountries(): Promise<RadioCountry[]> {
    try {
      const data: any = await this.http.get(`${this.API_BASE_URL}/countries`, {
        headers: {
          'User-Agent': this.USER_AGENT
        }
      }).toPromise();
      return data
        .filter((c: any) => c.stationcount > 0)
        .sort((a: any, b: any) => b.stationcount - a.stationcount)
        .slice(0, 50);
    } catch (error) {
      console.error('Error fetching radio countries:', error);
      return [];
    }
  }

  async fetchLanguages(): Promise<RadioLanguage[]> {
    try {
      const data: any = await this.http.get(`${this.API_BASE_URL}/languages`, {
        headers: {
          'User-Agent': this.USER_AGENT
        }
      }).toPromise();
      return data
        .filter((l: any) => l.stationcount > 0)
        .sort((a: any, b: any) => b.stationcount - a.stationcount)
        .slice(0, 50);
    } catch (error) {
      console.error('Error fetching radio languages:', error);
      return [];
    }
  }

  async fetchTags(): Promise<RadioTag[]> {
    try {
      const data: any = await this.http.get(`${this.API_BASE_URL}/tags`, {
        headers: {
          'User-Agent': this.USER_AGENT
        }
      }).toPromise();
      return data
        .filter((t: any) => t.stationcount > 0)
        .sort((a: any, b: any) => b.stationcount - a.stationcount)
        .slice(0, 50);
    } catch (error) {
      console.error('Error fetching radio tags:', error);
      return [];
    }
  }

  async fetchStations(filters: RadioFilters): Promise<RadioStation[]> {
    try {
      let url = `${this.API_BASE_URL}/stations/search`;
      const params = new URLSearchParams();
      
      if (filters.country) {
        params.append('country', filters.country);
      }
      if (filters.language) {
        params.append('language', filters.language);
      }
      if (filters.tag) {
        params.append('tag', filters.tag);
      }
      
      params.append('limit', '100');
      params.append('order', 'votes');
      params.append('reverse', 'true');
      
      if (params.toString()) {
        url += '?' + params.toString();
      }
      
      const data: any = await this.http.get(url, {
        headers: {
          'User-Agent': this.USER_AGENT
        }
      }).toPromise();
      return data.filter((station: any) => station.url_resolved);
    } catch (error) {
      console.error('Error fetching radio stations:', error);
      return [];
    }
  }

  async registerStationClick(stationuuid: string): Promise<void> {
    try {
      await this.http.get(`${this.API_BASE_URL}/url/${stationuuid}`, {
        headers: {
          'User-Agent': this.USER_AGENT
        }
      }).toPromise();
    } catch (error) {
      console.warn('Failed to register radio click:', error);
    }
  }
}
