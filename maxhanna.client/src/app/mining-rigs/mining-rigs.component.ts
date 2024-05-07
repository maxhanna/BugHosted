import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { lastValueFrom } from 'rxjs';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { MiningRig } from '../mining-rig';
import { CoinWatchResponse } from '../coin-watch-response';
import { DailyMiningEarnings } from '../daily-mining-earnings';
import { MiningRigDevice } from '../mining-rig-device';

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

  constructor(private http: HttpClient) {
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
    await lastValueFrom(this.http.get<Array<MiningRig>>('/mining/')).then(res => this.miningRigs = res);
    this.miningRigs.forEach(x => {
      this.localProfitability += Number(x.localProfitability!);
      this.actualProfitability += Number(x.actualProfitability!);
    });
    this.stopLoading();
  }
  async requestRigStateChange(rig: MiningRig) {
    var requestedAction = (this.isOffline(rig.minerStatus!) || this.isStopped(rig.minerStatus!)) ? "START" : "STOP";
    if (window.confirm(`Are sure you want to ${requestedAction} ${rig.rigName}?`)) {
      const headers = { 'Content-Type': 'application/json' };
      this.startLoading();

      try {
        const response = await lastValueFrom(this.http.post(`/mining/${rig.rigId}`, '"' + requestedAction + '"', { headers }));

        var requestedActionCapitalized = requestedAction.charAt(0).toUpperCase() + requestedAction.slice(1).toLowerCase();
        requestedActionCapitalized = requestedActionCapitalized.toLowerCase().includes("stop") ? requestedActionCapitalized + "p" : requestedActionCapitalized;
        const isSuccess = JSON.stringify(response).includes("true");
        this.notificationArea.nativeElement.innerHTML += `${requestedActionCapitalized}ing ${rig.rigName} ${isSuccess ? 'Has Succeeded' : 'Has Failed'}<br />`;

        this.getMiningInfo();
      }
      catch (error) {
        this.notificationArea.nativeElement.innerHTML += JSON.stringify(error) + "<br />";
      }
      this.stopLoading();
    }
  }
  public async requestDeviceStateChange(device: MiningRigDevice) {
    var requestedAction = this.isDeviceOffline(device.state!) || this.isDeviceDisabled(device.state!) ? "START" : "STOP";
    if (window.confirm(`Are sure you want to ${requestedAction} ${device.deviceName} on ${device.rigName}?`)) {
      const headers = { 'Content-Type': 'application/json' };
      try {
        this.startLoading();
        const response = await lastValueFrom(this.http.post(`/mining/${device.rigId}/${device.deviceId}`, '"' + requestedAction + '"', { headers }));
        this.stopLoading();

        var requestedActionCapitalized = requestedAction.charAt(0).toUpperCase() + requestedAction.slice(1).toLowerCase();
        requestedActionCapitalized = requestedActionCapitalized.toLowerCase().includes("stop") ? requestedActionCapitalized + "p" : requestedActionCapitalized;
        const isSuccess = JSON.stringify(response).includes("true");
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
    await lastValueFrom(this.http.get<Array<DailyMiningEarnings>>('/mining/dailyearnings')).then(res => this.dailyEarnings = res);
    this.stopLoading();
  }
  async getBTCRate() {
    this.startLoading();
    const data = await this.promiseWrapper(
      await fetch(
        new Request("https://api.livecoinwatch.com/coins/list"),
        {
          method: "POST",
          headers: new Headers({
            "content-type": "application/json",
            "x-api-key": "49965ff1-ebed-48b2-8ee3-796c390fcde1",
          }),
          body: JSON.stringify(
            {
              currency: "CAD",
              sort: "rank",
              order: "ascending",
              offset: 0,
              limit: 8,
              meta: true,
            }
          ),
        }
      ).then(response => response.json()) as CoinWatchResponse[]
    );
    this.stopLoading();
    this.rate = data.filter((x: CoinWatchResponse) => x.name == "Bitcoin")[0].rate;
  }
  isOffline(state: string): boolean {
    if (state == "OFFLINE")
      return true;
    else return false;
  }
  isStopped(state: string): boolean {
    if (state == "STOPPED")
      return true;
    else return false;
  }
  public isDeviceOffline(state: number): boolean {
    if (state == -1 || state == 1)
      return true;
    else return false;
  }
  public isDeviceDisabled(state: number): boolean {
    if (state == 4)
      return true;
    else return false;
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
  toggleDeviceDataVisibility(rig: MiningRig): void {
    if (this.miningRigDevices && this.miningRigDevices == rig.devices) {
      this.miningRigDevices = undefined;
    } else if (rig && rig.devices) {
      this.miningRigDevices = rig.devices;
    } else {
      this.miningRigDevices = undefined;
    }
  }
}
