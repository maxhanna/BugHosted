import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient } from '@angular/common/http';
import { MiningRigDevice } from '../mining-rig-device';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-mining',
  templateUrl: './mining.component.html',
  styleUrl: './mining.component.css'
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
  public async requestDeviceStateChange(rigId: string, deviceId: string, state: number) {
    var action = (this.isOffline(state) || this.isDisabled(state)) ? "START" : "STOP";
    const headers = { 'Content-Type': 'application/json' };
    try {
      this.startLoading();
      const response = await lastValueFrom(this.http.post(`/mining/${rigId}/${deviceId}`, '"' + action + '"', { headers }));
      this.stopLoading();
      this.notificationArea.nativeElement.innerHTML += JSON.stringify(response);
      this.getMiningInfo();
    }
    catch (error) {
      this.notificationArea.nativeElement.innerHTML += JSON.stringify(error);
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
