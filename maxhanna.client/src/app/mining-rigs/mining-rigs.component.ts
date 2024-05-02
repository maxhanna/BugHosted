import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { lastValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { MiningRig } from '../mining-rig';
import { CoinWatchResponse } from '../coin-watch-response';
import { DailyMiningEarnings } from '../daily-mining-earnings';

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
  constructor(private http: HttpClient) {
    super();
  }
  ngOnInit() {
    this.rate = 1;
    this.localProfitability = 0;
    this.getMiningInfo();
    this.getBTCRate();
    this.getDailyEarnings();
  }
  async getMiningInfo() {
    this.startLoading();
    await lastValueFrom(this.http.get<Array<MiningRig>>('/mining/')).then(res => this.miningRigs = res);
    this.miningRigs.forEach(x => this.localProfitability += Number(x.localProfitability!));
    this.stopLoading();
  }
  async requestRigStateChange(rig: MiningRig) {
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
  toggleShowAllData() {
    this.showAllData = !this.showAllData;
  }
}
