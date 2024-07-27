import { NexusBattleOutcome } from "./nexus-battle-outcome";

export interface NexusBattleOutcomeReports {
  battleOutcomes: NexusBattleOutcome[];
  currentPage: number;
  pageSize: number;
  totalReports: number;
}
