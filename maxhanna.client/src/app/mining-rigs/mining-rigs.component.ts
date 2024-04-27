import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { lastValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { MiningRig } from '../mining-rig';

@Component({
  selector: 'app-mining-rigs',
  templateUrl: './mining-rigs.component.html',
  styleUrl: './mining-rigs.component.css'
})
export class MiningRigsComponent extends ChildComponent {
  @ViewChild('notificationArea') notificationArea!: ElementRef<HTMLElement>;
  miningRigs: Array<MiningRig> = []; 
  constructor(private http: HttpClient) {
    super();
  }
  ngOnInit() {
    this.getMiningInfo();
  }
  async getMiningInfo() {
    this.startLoading();
    await lastValueFrom(this.http.get<Array<MiningRig>>('/mining/')).then(res => this.miningRigs = res);
    this.stopLoading();
  }
  public async requestRigStateChange(rig: MiningRig) {
    var requestedAction = (this.isOffline(rig.minerStatus!) || this.isStopped(rig.minerStatus!)) ? "START" : "STOP";
    if (window.confirm(`Are sure you want to ${requestedAction} ${rig.rigName}?`)) {
      const headers = { 'Content-Type': 'application/json' };
      try {
        this.startLoading();
        const response = await lastValueFrom(this.http.post(`/mining/${rig.rigId}`, '"' + requestedAction + '"', { headers }));
        this.stopLoading();
        this.notificationArea.nativeElement.innerHTML += JSON.stringify(response);
        this.getMiningInfo();
      }
      catch (error) {
        this.notificationArea.nativeElement.innerHTML += JSON.stringify(error);
      }
    }
  }
  public isOffline(state: string): boolean {
    if (state == "OFFLINE")
      return true;
    else return false;
  }
  public isStopped(state: string): boolean {
    if (state == "STOPPED")
      return true;
    else return false;
  }
}
