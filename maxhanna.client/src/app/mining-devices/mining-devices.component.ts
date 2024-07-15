import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MiningService } from '../../services/mining.service';
import { MiningRigDevice } from '../../services/datacontracts/crypto/mining-rig-device';

@Component({
  selector: 'app-mining-devices',
  templateUrl: './mining-devices.component.html',
  styleUrl: './mining-devices.component.css'
})
export class MiningDevicesComponent extends ChildComponent implements OnInit {
  miningRigDevices = new Array<MiningRigDevice>();
  notifications: string[] = [];
  constructor(private miningService: MiningService) {
    super();
  }
  ngOnInit() {
    this.getMiningInfo();
  }
  async getMiningInfo() {
    this.startLoading();
    this.miningRigDevices = await this.miningService.getMiningRigDeviceInfo(this.parentRef?.user!);
    this.stopLoading();
  }
  public async requestDeviceStateChange(device: MiningRigDevice) {
    var requestedAction = this.isOffline(device.state!) || this.isDisabled(device.state!) ? "START" : "STOP";
    if (window.confirm(`Are sure you want to ${requestedAction} ${device.deviceName} on ${device.rigName}?`)) {
      try {
        this.startLoading();
        const response = await this.miningService.requestRigDeviceStateChange(this.parentRef?.user!, device);
        this.stopLoading(); 
        var requestedActionCapitalized = requestedAction.charAt(0).toUpperCase() + requestedAction.slice(1).toLowerCase();
        requestedActionCapitalized = requestedActionCapitalized.toLowerCase().includes("stop") ? requestedActionCapitalized + "p" : requestedActionCapitalized;
        const isSuccess = response.success;
        this.notifications.push(`${requestedActionCapitalized}ing ${device.deviceName} (${device.rigName}) ${isSuccess ? 'Has Succeeded' : 'Has Failed'}`);

        this.getMiningInfo();
      }
      catch (error) {
        console.error(error);
        this.notifications.push(JSON.stringify(error));
      }
    }    
  }
  public isOffline(state: number): boolean {
    return this.miningService.isDeviceOffline(state);
  }
  public isDisabled(state: number): boolean {
    return this.miningService.isDeviceDisabled(state);
  }
}
