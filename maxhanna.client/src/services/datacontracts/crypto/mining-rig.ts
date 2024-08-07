import { MiningRigDevice } from "./mining-rig-device";

export class MiningRig {
  rigId: string | undefined;
  rigName: string | undefined; 
  minerStatus: string | undefined;
  unpaidAmount: number | undefined;
  speedRejected: number | undefined;
  localProfitability: number | undefined;
  actualProfitability: number | undefined;
  devices: Array<MiningRigDevice> | undefined;
}
