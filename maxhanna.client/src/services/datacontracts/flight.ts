export interface TrackedFlight {
  id: string;
  callsign: string;
  label: string;
  lat?: number;
  lon?: number;
  altitude?: number;
  heading?: number;
  velocity?: number;
  origin?: string;
  destination?: string;
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
  lastUpdated?: Date;
  enabled: boolean;
}

export interface FlightArc {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  color?: string;
}
