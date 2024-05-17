// user.service.ts
import { Injectable } from '@angular/core';
import { User } from './datacontracts/user';
import { MiningRig } from './datacontracts/mining-rig';
import { MiningRigDevice } from './datacontracts/mining-rig-device';
import { NicehashApiKeys } from './datacontracts/nicehash-api-keys';

@Injectable({
  providedIn: 'root'
})
export class MiningService {
  async getMiningWallet(user: User) {
    try {
      const response = await fetch(`/mining/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();  
    } catch (error) {
      return null; 
    }
  }
  async getMiningRigInfo(user: User) {
    try {
      const response = await fetch(`/mining`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user), 
      });

      return await response.json();
    } catch (error) {
      return null; 
    }
  }
  async getMiningRigDeviceInfo(user: User) {
    try {
      const response = await fetch(`/mining/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 
        },
        body: JSON.stringify(user),
      });

      return await response.json(); 
    } catch (error) {
      return null; 
    }
  }
  async getDailyEarnings(user: User) {
    try {
      const response = await fetch(`/mining/dailyearnings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null; 
    }
  }
  async requestRigStateChange(user: User, rig: MiningRig) {
    var requestedAction = (this.isOffline(rig.minerStatus!) || this.isStopped(rig.minerStatus!)) ? "START" : "STOP";
    try {
      const response = await fetch(`/mining/${rig.rigId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 
        },
        body: JSON.stringify({ user, requestedAction }),
      });

      return await response.json(); 
    } catch (error) {
      return null; 
    }
  }
  async requestRigDeviceStateChange(user: User, device: MiningRigDevice) {
    var requestedAction = this.isDeviceOffline(device.state!) || this.isDeviceDisabled(device.state!) ? "START" : "STOP";
    try {
      const response = await fetch(`/mining/${device.rigId}/${device.deviceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 
        },
        body: JSON.stringify({ user, requestedAction }),
      });

      return await response.json(); 
    } catch (error) {
      return null; 
    }
  }
  async getNicehashApiInfo(user: User) {
    try {
      const response = await fetch(`/mining/getnicehashapicredentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(user),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async updateNicehashApiInfo(user: User, keys: NicehashApiKeys) {
    try {
      const response = await fetch(`/mining/updatenicehashapicredentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user, keys }),
      });

      return await response.text();
    } catch (error) {
      return null;
    }
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
  isDeviceOffline(state: number): boolean {
    if (state == -1 || state == 1)
      return true;
    else return false;
  }
  isDeviceDisabled(state: number): boolean {
    if (state == 4)
      return true;
    else return false;
  }
}
