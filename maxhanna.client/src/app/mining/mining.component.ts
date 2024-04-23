import { Component } from '@angular/core';
import { ChildComponent } from '../child.component';
import * as CryptoJS from 'crypto-js';
import qs from 'qs';
import { HttpClient } from '@angular/common/http';
import { MiningRigDevice } from '../mining-rig-device';

@Component({
  selector: 'app-mining',
  templateUrl: './mining.component.html',
  styleUrl: './mining.component.css'
})
export class MiningComponent extends ChildComponent {
  miningRigDevices = new Array<MiningRigDevice>();

  constructor(private http: HttpClient) {
    super();
    this.getMiningInfo();
  }
  async getMiningInfo() {
    this.http.get<Array<MiningRigDevice>>('/mining/devices').subscribe(
      (result: Array<MiningRigDevice>) => {
        this.miningRigDevices = result;
      },
      (error) => {
        console.error(error);
      }
    );
  }
}
