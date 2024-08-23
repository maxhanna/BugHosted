import { NexusAttackSent } from "./nexus-attack-sent";

export interface AttackEventPayload {
  attack: NexusAttackSent;
  isSendingDefence: boolean;
  switchBase: boolean;
}
