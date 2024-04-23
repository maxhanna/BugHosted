import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { lastValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-mining-rigs',
  templateUrl: './mining-rigs.component.html',
  styleUrl: './mining-rigs.component.css'
})
export class MiningRigsComponent extends ChildComponent {
  @ViewChild('notificationArea') notificationArea!: ElementRef<HTMLElement>;
  constructor(private http: HttpClient) {
    super();
  }

  public async requestDeviceStateChange(rigId: string, deviceId: string, state: number) {
    var action = (this.isOffline(state) || this.isDisabled(state)) ? "START" : "STOP";
    const headers = { 'Content-Type': 'application/json' };
    try {
      this.startLoading();
      const response = await lastValueFrom(this.http.post(`/mining/${rigId}/${deviceId}`, '"' + action + '"', { headers }));
      this.stopLoading();
      this.notificationArea.nativeElement.innerHTML += JSON.stringify(response);
      //this.getMiningInfo();
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
