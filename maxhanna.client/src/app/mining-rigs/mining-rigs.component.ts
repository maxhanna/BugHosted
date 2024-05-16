import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { lastValueFrom } from 'rxjs';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { MiningRig } from '../../services/datacontracts/mining-rig';
import { MiningRigDevice } from '../../services/datacontracts/mining-rig-device';
import { DailyMiningEarnings } from '../../services/datacontracts/daily-mining-earnings';
import { CoinWatchResponse } from '../../services/datacontracts/coin-watch-response';
import { MiningService } from '../../services/mining.service';
import { CoinWatchService } from '../../services/coin-watch.service';

@Component({
  selector: 'app-mining-rigs',
  templateUrl: './mining-rigs.component.html',
  styleUrl: './mining-rigs.component.css'
})
export class MiningRigsComponent extends ChildComponent {
  @ViewChild('notificationArea') notificationArea!: ElementRef<HTMLElement>;
  miningRigs: Array<MiningRig> = [];
  dailyEarnings: Array<DailyMiningEarnings> = [];
  showAllData: boolean = false;
  rate: number = 1;
  localProfitability: number = 0;
  actualProfitability: number = 0;
  miningRigDevices?: MiningRigDevice[] = undefined;
  showLocal = true;

  constructor(private miningService: MiningService, private coinwatchService: CoinWatchService) {
    super();
  }
  ngOnInit() {
    this.rate = 1;
    this.localProfitability = 0;
    this.actualProfitability = 0;
    this.getMiningInfo();
    this.getBTCRate();
    this.getDailyEarnings();
  } 
  async getMiningInfo() {
    this.startLoading();
    this.miningRigs = await this.miningService.getMiningRigInfo(this.parentRef?.user!);
    this.miningRigs.forEach(x => {
      this.localProfitability += Number(x.localProfitability!);
      this.actualProfitability += Number(x.actualProfitability!);
    });
    this.stopLoading();
  }
  async requestRigStateChange(rig: MiningRig) {
    var requestedAction = (this.miningService.isOffline(rig.minerStatus!) || this.miningService.isStopped(rig.minerStatus!)) ? "START" : "STOP";
    if (window.confirm(`Are sure you want to ${requestedAction} ${rig.rigName}?`)) {
      this.startLoading();

      try {
        const response = await this.miningService.requestRigStateChange(this.parentRef?.user!, rig);

        var requestedActionCapitalized = requestedAction.charAt(0).toUpperCase() + requestedAction.slice(1).toLowerCase();
        requestedActionCapitalized = requestedActionCapitalized.toLowerCase().includes("stop") ? requestedActionCapitalized + "p" : requestedActionCapitalized;
        const isSuccess = response.success;
        this.notificationArea.nativeElement.innerHTML += `${requestedActionCapitalized}ing ${rig.rigName} ${isSuccess ? 'Has Succeeded' : 'Has Failed'}<br />`;

        this.getMiningInfo();
      }
      catch (error) {
        this.notificationArea.nativeElement.innerHTML += JSON.stringify(error) + "<br />";
      }
      this.stopLoading();
    }
  }
  async requestDeviceStateChange(device: MiningRigDevice) {
    var requestedAction = this.miningService.isDeviceOffline(device.state!) || this.miningService.isDeviceDisabled(device.state!) ? "START" : "STOP";
    if (window.confirm(`Are sure you want to ${requestedAction} ${device.deviceName} on ${device.rigName}?`)) {
      const headers = { 'Content-Type': 'application/json' };
      try {
        this.startLoading();
        const response = await this.miningService.requestRigDeviceStateChange(this.parentRef?.user!, device);
        this.stopLoading();

        var requestedActionCapitalized = requestedAction.charAt(0).toUpperCase() + requestedAction.slice(1).toLowerCase();
        requestedActionCapitalized = requestedActionCapitalized.toLowerCase().includes("stop") ? requestedActionCapitalized + "p" : requestedActionCapitalized;
        const isSuccess = response.success;
        this.notificationArea.nativeElement.innerHTML += `${requestedActionCapitalized}ing ${device.deviceName} (${device.rigName}) ${isSuccess ? 'Has Succeeded' : 'Has Failed'}<br />`;

        this.getMiningInfo();
        this.miningRigDevices = undefined;
      }
      catch (error) {
        this.notificationArea.nativeElement.innerHTML += JSON.stringify(error) + "<br />";
      }
    }
  }
  async getDailyEarnings() {
    this.startLoading();
    this.dailyEarnings = await this.miningService.getDailyEarnings(this.parentRef?.user!);
    this.stopLoading();
  }
  async getBTCRate() {
    this.startLoading();
    const data = await this.coinwatchService.getCoinwatchResponse(this.parentRef?.user!);
    this.stopLoading();
    this.rate = data.filter((x: CoinWatchResponse) => x.name == "Bitcoin")[0].rate;
  }
  
  toggleShowAllData() {
    this.showAllData = !this.showAllData;
  }
  computeDeviceCounts(rig: MiningRig): string {
    if (!rig.devices) {
      return '0 / 0';
    }
    const totalDevices = rig.devices.length;
    const onlineDevices = rig.devices.filter(device => device.state === 2).length;
    return `${onlineDevices} / ${totalDevices}`;
  }
  computeMaxDeviceTemperature(rig: MiningRig): number {
    if (!rig.devices) {
      return 0;
    }
    const maxTemperature = Math.max(...rig.devices.map(device => device.temperature ?? 0));
    return maxTemperature;
  }
  calculateWeeklyEarnings(): string {
    let totalWeeklyEarnings = 0;
    let count = 0;
    for (let earnings of this.dailyEarnings) {
      totalWeeklyEarnings += earnings.totalEarnings;
      if (count++ == 6) {
        break;
      }
    }
    return this.rate != 1 ? (this.rate * totalWeeklyEarnings).toFixed(2) + ' CAD' : totalWeeklyEarnings + ' BTC';
  } 
  toggleDeviceDataVisibility(rig: MiningRig): void {
    if (this.miningRigDevices && this.miningRigDevices == rig.devices) {
      this.miningRigDevices = undefined;
    } else if (rig && rig.devices) {
      this.miningRigDevices = rig.devices;
    } else {
      this.miningRigDevices = undefined;
    }
  }
  isDeviceOffline(state: number) {
    return this.miningService.isDeviceOffline(state);
  }
  isDeviceDisabled(state: number) {
    return this.miningService.isDeviceDisabled(state);
  }
  isStopped(state: string) {
    return this.miningService.isStopped(state);
  }
  isOffline(state: string) {
    return this.miningService.isOffline(state);
  }
}
