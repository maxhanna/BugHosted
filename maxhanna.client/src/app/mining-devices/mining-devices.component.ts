import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient } from '@angular/common/http';
import { MiningRigDevice } from '../mining-rig-device';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-mining-devices',
  templateUrl: './mining-devices.component.html',
  styleUrl: './mining-devices.component.css'
})
export class MiningDevicesComponent extends ChildComponent implements OnInit {
  miningRigDevices = new Array<MiningRigDevice>();
  @ViewChild('notificationArea') notificationArea!: ElementRef<HTMLElement>;

  constructor(private http: HttpClient) {
    super();
  }
  ngOnInit() {
    this.getMiningInfo();
  }
  async getMiningInfo() {
    this.startLoading();
    await lastValueFrom(this.http.get<Array<MiningRigDevice>>('/mining/devices')).then(res => this.miningRigDevices = res);
    this.stopLoading();
  }
  public async requestDeviceStateChange(device: MiningRigDevice) {
    var requestedAction = this.isOffline(device.state!) || this.isDisabled(device.state!) ? "START" : "STOP";
    if (window.confirm(`Are sure you want to ${requestedAction} ${device.deviceName} on ${device.rigName}?`)) {
      const headers = { 'Content-Type': 'application/json' };
      try {
        this.startLoading();
        const response = await lastValueFrom(this.http.post(`/mining/${device.rigId}/${device.deviceId}`, '"' + requestedAction + '"', { headers }));
        this.stopLoading();
        this.notificationArea.nativeElement.innerHTML += JSON.stringify(response);
        this.getMiningInfo();
      }
      catch (error) {
        this.notificationArea.nativeElement.innerHTML += JSON.stringify(error);
      }
    }    
  }
  public isOffline(state: number): boolean {
    if (state == 1)
      return true;
    else return false;
  }
  public isDisabled(state: number): boolean {
    if (state == 4)
      return true;
    else return false;
  }
}
