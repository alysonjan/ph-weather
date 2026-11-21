export interface City {
  id: string;
  name: string;
  region: string;
  island: IslandGroup;
  lat: number;
  lon: number;
  /** Highland stations run much cooler than the lowlands sitting beside them. */
  highland?: boolean;
  /** Sub-region grouping, so Metro Cebu can be picked in one tap. */
  metro?: "cebu";
}

export type IslandGroup = "Luzon" | "Visayas" | "Mindanao";

export const CITIES: City[] = [
  { id: "manila", name: "Manila", region: "Metro Manila", island: "Luzon", lat: 14.5995, lon: 120.9842 },
  { id: "quezon-city", name: "Quezon City", region: "Metro Manila", island: "Luzon", lat: 14.676, lon: 121.0437 },
  { id: "baguio", name: "Baguio", region: "Benguet", island: "Luzon", lat: 16.4023, lon: 120.596, highland: true },
  { id: "laoag", name: "Laoag", region: "Ilocos Norte", island: "Luzon", lat: 18.1978, lon: 120.5936 },
  { id: "vigan", name: "Vigan", region: "Ilocos Sur", island: "Luzon", lat: 17.5747, lon: 120.3869 },
  { id: "tuguegarao", name: "Tuguegarao", region: "Cagayan", island: "Luzon", lat: 17.6132, lon: 121.727 },
  { id: "basco", name: "Basco", region: "Batanes", island: "Luzon", lat: 20.4489, lon: 121.97 },
  { id: "dagupan", name: "Dagupan", region: "Pangasinan", island: "Luzon", lat: 16.0433, lon: 120.3333 },
  { id: "clark", name: "Clark", region: "Pampanga", island: "Luzon", lat: 15.145, lon: 120.588 },
  { id: "tagaytay", name: "Tagaytay", region: "Cavite", island: "Luzon", lat: 14.1153, lon: 120.9621, highland: true },
  { id: "legazpi", name: "Legazpi", region: "Albay", island: "Luzon", lat: 13.1391, lon: 123.7438 },
  { id: "naga", name: "Naga", region: "Camarines Sur", island: "Luzon", lat: 13.6218, lon: 123.1948 },
  { id: "puerto-princesa", name: "Puerto Princesa", region: "Palawan", island: "Luzon", lat: 9.7392, lon: 118.7353 },
  { id: "iloilo", name: "Iloilo City", region: "Iloilo", island: "Visayas", lat: 10.7202, lon: 122.5621 },
  { id: "bacolod", name: "Bacolod", region: "Negros Occidental", island: "Visayas", lat: 10.6765, lon: 122.9509 },
  { id: "dumaguete", name: "Dumaguete", region: "Negros Oriental", island: "Visayas", lat: 9.3068, lon: 123.3054 },
  { id: "cebu", name: "Cebu City", region: "Cebu", island: "Visayas", lat: 10.3157, lon: 123.8854, metro: "cebu" },
  { id: "mandaue", name: "Mandaue", region: "Cebu", island: "Visayas", lat: 10.3237, lon: 123.9223, metro: "cebu" },
  { id: "lapu-lapu", name: "Lapu-Lapu", region: "Cebu", island: "Visayas", lat: 10.3103, lon: 123.9494, metro: "cebu" },
  { id: "tacloban", name: "Tacloban", region: "Leyte", island: "Visayas", lat: 11.2444, lon: 125.0039 },
  { id: "cagayan-de-oro", name: "Cagayan de Oro", region: "Misamis Oriental", island: "Mindanao", lat: 8.4542, lon: 124.6319 },
  { id: "davao", name: "Davao City", region: "Davao del Sur", island: "Mindanao", lat: 7.1907, lon: 125.4553 },
  { id: "general-santos", name: "General Santos", region: "South Cotabato", island: "Mindanao", lat: 6.1164, lon: 125.1716 },
  { id: "zamboanga", name: "Zamboanga City", region: "Zamboanga del Sur", island: "Mindanao", lat: 6.9214, lon: 122.079 },
  { id: "butuan", name: "Butuan", region: "Agusan del Norte", island: "Mindanao", lat: 8.9475, lon: 125.5406 },
  { id: "cotabato", name: "Cotabato City", region: "Maguindanao", island: "Mindanao", lat: 7.2047, lon: 124.231 },
  { id: "malaybalay", name: "Malaybalay", region: "Bukidnon", island: "Mindanao", lat: 8.1573, lon: 125.1277, highland: true },
  { id: "kabayan", name: "Kabayan", region: "Benguet", island: "Luzon", lat: 16.6176, lon: 120.8246, highland: true },
];

export const DEFAULT_CITY_ID = "cebu";

/** The station the El Niño panel reports local conditions for. */
export const HOME_CITY_ID = "cebu";
