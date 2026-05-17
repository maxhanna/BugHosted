export interface PlantSuggestion {
  name: string;
  species: string;
  reason: string;
}

export interface PlantIdentificationResult {
  suggestions: PlantSuggestion[];
  topPick: PlantSuggestion;
}
