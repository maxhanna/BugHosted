import { Injectable } from '@angular/core';
import { TrackedFlight } from './datacontracts/flight';

const AIRPORT_COORDS: Record<string, { lat: number; lon: number; name: string }> = {
  'YYZ': { lat: 43.6777, lon: -79.6248, name: 'Toronto Pearson International' },
  'YUL': { lat: 45.4706, lon: -73.7408, name: 'Montréal-Trudeau International' },
  'YVR': { lat: 49.1947, lon: -123.1792, name: 'Vancouver International' },
  'YYC': { lat: 51.1139, lon: -114.0203, name: 'Calgary International' },
  'YEG': { lat: 53.3097, lon: -113.5801, name: 'Edmonton International' },
  'YWG': { lat: 49.9100, lon: -97.2397, name: 'Winnipeg International' },
  'YOW': { lat: 45.3225, lon: -75.6692, name: 'Ottawa MacDonald-Cartier' },
  'YHZ': { lat: 44.8808, lon: -63.5086, name: 'Halifax Stanfield' },
  'YYT': { lat: 47.6186, lon: -52.7519, name: 'St. John\'s International' },
  'JFK': { lat: 40.6413, lon: -73.7781, name: 'John F. Kennedy International' },
  'LGA': { lat: 40.7772, lon: -73.8726, name: 'LaGuardia' },
  'EWR': { lat: 40.6895, lon: -74.1745, name: 'Newark Liberty International' },
  'LAX': { lat: 33.9416, lon: -118.4085, name: 'Los Angeles International' },
  'SFO': { lat: 37.6213, lon: -122.3790, name: 'San Francisco International' },
  'ORD': { lat: 41.9742, lon: -87.9073, name: 'O\'Hare International' },
  'ATL': { lat: 33.6407, lon: -84.4277, name: 'Hartsfield-Jackson Atlanta' },
  'DFW': { lat: 32.8998, lon: -97.0403, name: 'Dallas/Fort Worth International' },
  'DEN': { lat: 39.8561, lon: -104.6737, name: 'Denver International' },
  'SEA': { lat: 47.4502, lon: -122.3088, name: 'Seattle-Tacoma International' },
  'MIA': { lat: 25.7959, lon: -80.2870, name: 'Miami International' },
  'BOS': { lat: 42.3656, lon: -71.0096, name: 'Boston Logan International' },
  'PHX': { lat: 33.4342, lon: -112.0117, name: 'Phoenix Sky Harbor' },
  'MCO': { lat: 28.4294, lon: -81.3089, name: 'Orlando International' },
  'IAH': { lat: 29.9844, lon: -95.3414, name: 'George Bush Intercontinental' },
  'LAS': { lat: 36.0840, lon: -115.1537, name: 'Harry Reid International' },
  'MSP': { lat: 44.8848, lon: -93.2223, name: 'Minneapolis-St. Paul International' },
  'DTW': { lat: 42.2124, lon: -83.3534, name: 'Detroit Metropolitan' },
  'PHL': { lat: 39.8729, lon: -75.2437, name: 'Philadelphia International' },
  'CLT': { lat: 35.2140, lon: -80.9431, name: 'Charlotte Douglas International' },
  'FLL': { lat: 26.0742, lon: -80.1506, name: 'Fort Lauderdale-Hollywood' },
  'SAN': { lat: 32.7338, lon: -117.1933, name: 'San Diego International' },
  'TPA': { lat: 27.9797, lon: -82.5347, name: 'Tampa International' },
  'PDX': { lat: 45.5887, lon: -122.5975, name: 'Portland International' },
  'STL': { lat: 38.7487, lon: -90.3700, name: 'St. Louis Lambert International' },
  'BWI': { lat: 39.1774, lon: -76.6684, name: 'Baltimore/Washington International' },
  'DCA': { lat: 38.8521, lon: -77.0377, name: 'Ronald Reagan Washington National' },
  'IAD': { lat: 38.9445, lon: -77.4558, name: 'Washington Dulles International' },
  'HNL': { lat: 21.3187, lon: -157.9224, name: 'Honolulu International' },
  'LHR': { lat: 51.4700, lon: -0.4543, name: 'London Heathrow' },
  'LGW': { lat: 51.1537, lon: -0.1821, name: 'London Gatwick' },
  'CDG': { lat: 49.0097, lon: 2.5479, name: 'Charles de Gaulle' },
  'ORY': { lat: 48.7233, lon: 2.3794, name: 'Paris Orly' },
  'FRA': { lat: 50.0379, lon: 8.5622, name: 'Frankfurt Airport' },
  'MUC': { lat: 48.3537, lon: 11.7759, name: 'Munich Airport' },
  'AMS': { lat: 52.3086, lon: 4.7639, name: 'Amsterdam Schiphol' },
  'BCN': { lat: 41.2974, lon: 2.0833, name: 'Barcelona-El Prat' },
  'MAD': { lat: 40.4983, lon: -3.5676, name: 'Adolfo Suárez Madrid-Barajas' },
  'FCO': { lat: 41.8003, lon: 12.2389, name: 'Rome Fiumicino' },
  'MXP': { lat: 45.6301, lon: 8.7282, name: 'Milan Malpensa' },
  'ZRH': { lat: 47.4584, lon: 8.5480, name: 'Zurich Airport' },
  'GVA': { lat: 46.2380, lon: 6.1089, name: 'Geneva Airport' },
  'CPH': { lat: 55.6180, lon: 12.6508, name: 'Copenhagen Airport' },
  'ARN': { lat: 59.6498, lon: 17.9237, name: 'Stockholm Arlanda' },
  'OSL': { lat: 60.1939, lon: 11.1004, name: 'Oslo Gardermoen' },
  'HEL': { lat: 60.3172, lon: 24.9633, name: 'Helsinki-Vantaa' },
  'DUB': { lat: 53.4264, lon: -6.2499, name: 'Dublin Airport' },
  'NRT': { lat: 35.7653, lon: 140.3855, name: 'Narita International' },
  'HND': { lat: 35.5522, lon: 139.7797, name: 'Tokyo Haneda' },
  'ICN': { lat: 37.4602, lon: 126.4407, name: 'Incheon International' },
  'PVG': { lat: 31.1443, lon: 121.8083, name: 'Shanghai Pudong' },
  'PEK': { lat: 40.0799, lon: 116.6031, name: 'Beijing Capital' },
  'HKG': { lat: 22.3080, lon: 113.9145, name: 'Hong Kong International' },
  'SIN': { lat: 1.3644, lon: 103.9915, name: 'Singapore Changi' },
  'BKK': { lat: 13.6900, lon: 100.7501, name: 'Suvarnabhumi Airport' },
  'DEL': { lat: 28.5562, lon: 77.1000, name: 'Indira Gandhi International' },
  'BOM': { lat: 19.0887, lon: 72.8679, name: 'Chhatrapati Shivaji International' },
  'DXB': { lat: 25.2532, lon: 55.3657, name: 'Dubai International' },
  'AUH': { lat: 24.4432, lon: 54.6517, name: 'Abu Dhabi International' },
  'DOH': { lat: 25.2600, lon: 51.5650, name: 'Hamad International' },
  'IST': { lat: 41.2753, lon: 28.7519, name: 'Istanbul Airport' },
  'SYD': { lat: -33.9399, lon: 151.1753, name: 'Sydney Kingsford Smith' },
  'MEL': { lat: -37.6733, lon: 144.8433, name: 'Melbourne Airport' },
  'BNE': { lat: -27.3842, lon: 153.1175, name: 'Brisbane Airport' },
  'AKL': { lat: -37.0082, lon: 174.7850, name: 'Auckland Airport' },
  'GRU': { lat: -23.4356, lon: -46.4731, name: 'São Paulo Guarulhos' },
  'EZE': { lat: -34.8222, lon: -58.5358, name: 'Ministro Pistarini International' },
  'SCL': { lat: -33.3930, lon: -70.7858, name: 'Santiago International' },
  'CPT': { lat: -33.9713, lon: 18.6042, name: 'Cape Town International' },
  'JNB': { lat: -26.1392, lon: 28.2460, name: 'O.R. Tambo International' },
  'NBO': { lat: -1.3192, lon: 36.9278, name: 'Jomo Kenyatta International' },
  'CAI': { lat: 30.1120, lon: 31.4000, name: 'Cairo International' },
  'TUN': { lat: 36.8510, lon: 10.2272, name: 'Tunis-Carthage International' },
  'CMN': { lat: 33.3675, lon: -7.5900, name: 'Mohammed V International' },
};

@Injectable({
  providedIn: 'root'
})
export class FlightService {
  private readonly STORAGE_KEY = 'bugTrackedFlights';
  private cachedStates: any[] = [];
  private lastFetch = 0;
  private readonly FETCH_INTERVAL = 15000;
  private pendingFetch: Promise<any[]> | null = null;

  async getStates(): Promise<any[]> {
    const now = Date.now();
    if (now - this.lastFetch < this.FETCH_INTERVAL && this.cachedStates.length > 0) {
      return this.cachedStates;
    }
    if (this.pendingFetch) return this.pendingFetch;

    this.pendingFetch = this.fetchStates();
    try {
      return await this.pendingFetch;
    } finally {
      this.pendingFetch = null;
    }
  }

  private async fetchStates(): Promise<any[]> {
    try {
      const url = '/flight/states';
      const res = await fetch(url);
      if (!res.ok) {
        console.warn('Flight API returned', res.status);
        try {
          const body = await res.text();
          console.warn('Flight API response body (truncated):', body ? body.slice(0, 1000) : '<empty>');
        } catch {}
        return this.cachedStates;
      }

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        // Got HTML (likely index.html) or other non-JSON response — log and bail out
        try {
          const text = await res.text();
          console.warn('Flight API returned non-JSON response:', contentType || '<none>',
            text ? text.slice(0, 1000) : '<empty>');
        } catch {}
        return this.cachedStates;
      }

      const data = await res.json();
      this.cachedStates = data.states || [];
      this.lastFetch = Date.now();
    } catch (e) {
      console.error('Failed to fetch flight states:', e);
    }
    return this.cachedStates;
  }

  async updateFlightPositions(flights: TrackedFlight[]): Promise<TrackedFlight[]> {
    if (!flights.length) return flights;
    const states = await this.getStates();
    if (!states.length) return flights;

    return flights.map(flight => {
      const cs = flight.callsign.trim().toUpperCase();
      const state = states.find((s: any) => {
        const scs = s[1] && typeof s[1] === 'string' ? s[1].trim().toUpperCase() : '';
        return scs === cs;
      });
      if (state && state[5] != null && state[6] != null) {
        return {
          ...flight,
          lat: state[6],
          lon: state[5],
          altitude: state[7],
          heading: state[10],
          velocity: state[9],
          lastUpdated: new Date(),
        };
      }
      return flight;
    });
  }

  getTrackedFlights(): TrackedFlight[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  }

  saveTrackedFlights(flights: TrackedFlight[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(flights));
  }

  getAirportCoords(code: string): { lat: number; lon: number; name: string } | null {
    return AIRPORT_COORDS[code.toUpperCase()] || null;
  }

  searchAirports(query: string): { code: string; name: string; lat: number; lon: number }[] {
    const q = query.toUpperCase();
    return Object.entries(AIRPORT_COORDS)
      .filter(([code, info]) => code.includes(q) || info.name.toUpperCase().includes(q))
      .map(([code, info]) => ({ code, ...info }));
  }
}
