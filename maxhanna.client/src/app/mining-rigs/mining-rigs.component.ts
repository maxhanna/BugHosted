import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';  
 import { MiningService } from '../../services/mining.service';
import { CoinValueService } from '../../services/coin-value.service'; 
import { DailyMiningEarnings } from '../../services/datacontracts/crypto/daily-mining-earnings';
import { MiningRigDevice } from '../../services/datacontracts/crypto/mining-rig-device';
import { MiningRig } from '../../services/datacontracts/crypto/mining-rig';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';
import { AppComponent } from '../app.component';
 
@Component({
    selector: 'app-mining-rigs',
    templateUrl: './mining-rigs.component.html',
    styleUrl: './mining-rigs.component.css',
    standalone: false
})
export class MiningRigsComponent extends ChildComponent implements OnChanges { 
  @Input() inputtedParentRef?: AppComponent;
  @Input() conversionRate? = 0;
  @Input() currency? = "CAD"; 
  @Input() isDiscreete? = false; 
  @Output() closeMiningEvent = new EventEmitter<void>();
  miningRigs: Array<MiningRig> = [];
  dailyEarnings: Array<DailyMiningEarnings> = [];
  showAllData: boolean = false;
  rate: number = 1;
  localProfitability: number = 0;
  actualProfitability: number = 0;
  miningRigDevices?: MiningRigDevice[] = undefined;
  showLocal = true;
  notifications: string[] = [];

  constructor(private miningService: MiningService, private coinValueService: CoinValueService) {
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
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['conversionRate'] && !changes['conversionRate'].firstChange) {
      this.ngOnInit();
    }
  }
  async getMiningInfo() {
    if (this.inputtedParentRef?.user) { 
      this.startLoading();
      this.miningRigs = await this.miningService.getMiningRigInfo(this.inputtedParentRef.user);
      if (this.miningRigs) {
        this.miningRigs.forEach(x => {
          this.localProfitability += Number(x.localProfitability!);
          this.actualProfitability += Number(x.actualProfitability!);
        });
      }
      this.stopLoading();
    }

    if (!this.miningRigs || this.miningRigs.length == 0) {
      this.closeMiningEvent.emit();
    }
  }
  async requestRigStateChange(rig: MiningRig) {
    const requestedAction = (this.miningService.isOffline(rig.minerStatus!) || this.miningService.isStopped(rig.minerStatus!)) ? "START" : "STOP";
    if (window.confirm(`Are sure you want to ${requestedAction} ${rig.rigName}?`) && this.inputtedParentRef?.user) {
      this.startLoading(); 
      try {
        const response = await this.miningService.requestRigStateChange(this.inputtedParentRef.user, rig);

        let requestedActionCapitalized = requestedAction.charAt(0).toUpperCase() + requestedAction.slice(1).toLowerCase();
        requestedActionCapitalized = requestedActionCapitalized.toLowerCase().includes("stop") ? requestedActionCapitalized + "p" : requestedActionCapitalized;
        const isSuccess = response.success;
        this.showNotification(`${requestedActionCapitalized}ing ${rig.rigName} ${isSuccess ? 'Has Succeeded' : 'Has Failed'}`);

        this.getMiningInfo();
      }
      catch (error) {
        this.showNotification(JSON.stringify(error));
      }
      this.stopLoading();
    }
  }
  async requestDeviceStateChange(device: MiningRigDevice) {
    const requestedAction = this.miningService.isDeviceOffline(device.state!) || this.miningService.isDeviceDisabled(device.state!) ? "START" : "STOP";
    if (window.confirm(`Are sure you want to ${requestedAction} ${device.deviceName} on ${device.rigName}?`) && this.inputtedParentRef?.user) {
      try {
        this.startLoading();
        const response = await this.miningService.requestRigDeviceStateChange(this.inputtedParentRef.user, device);
        this.stopLoading();

        let requestedActionCapitalized = requestedAction.charAt(0).toUpperCase() + requestedAction.slice(1).toLowerCase();
        requestedActionCapitalized = requestedActionCapitalized.toLowerCase().includes("stop") ? requestedActionCapitalized + "p" : requestedActionCapitalized;
        const isSuccess = response.success;
        this.showNotification(`${requestedActionCapitalized}ing ${device.deviceName} (${device.rigName}) ${isSuccess ? 'Has Succeeded' : 'Has Failed'}`);

        this.getMiningInfo();
        this.miningRigDevices = undefined;
      }
      catch (error) {
        this.showNotification(JSON.stringify(error));
      }
    }
  }
  async getDailyEarnings() {
    this.startLoading();
    if (this.inputtedParentRef?.user) {
      this.dailyEarnings = await this.miningService.getDailyEarnings(this.inputtedParentRef.user);
    }
    this.stopLoading();
  }
  async getBTCRate() {
    this.startLoading();
    const data = await this.coinValueService.getLatestCoinValuesByName("Bitcoin") as CoinValue;
    this.stopLoading();
    this.rate = data.valueCAD;
    if (this.conversionRate) {
      this.rate = this.rate * this.conversionRate;
    }
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
    return this.rate != 1 ? this.formatToCanadianCurrency(this.rate * totalWeeklyEarnings) + ' ' + this.currency : totalWeeklyEarnings + ' BTC';
  }
  calculateAverageDailyEarnings(): string {
    let totalDailyEarnings = 0;
    for (let earnings of this.dailyEarnings) {
      totalDailyEarnings += earnings.totalEarnings;
    }
    const averageDailyEarnings = totalDailyEarnings / this.dailyEarnings.length;
    return this.rate != 1 ? this.formatToCanadianCurrency(this.rate * averageDailyEarnings) + ' ' + this.currency : averageDailyEarnings + ' BTC';
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
  formatSpeed(speed?: number): string {
    if (!speed) return '';
    const formatted = speed.toFixed(2); // 2 decimal places
    return formatted.toString().length > 5 ? formatted.toString().slice(0, 5) + '...' : formatted;
  } 

  formatToCanadianCurrency(value: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
    }).format(value);
  }
  showNotification(text: string) { 
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.showNotification(text);
    } 
  }
}
