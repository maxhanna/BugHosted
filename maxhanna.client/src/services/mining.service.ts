// user.service.ts
import { Injectable } from '@angular/core'; 
import { NicehashApiKeys } from './datacontracts/crypto/nicehash-api-keys';
import { User } from './datacontracts/user/user';
import { MiningRig } from './datacontracts/crypto/mining-rig';
import { MiningRigDevice } from './datacontracts/crypto/mining-rig-device';

@Injectable({
  providedIn: 'root'
})
export class MiningService {
  async getMiningWallet(userId: number) {
    try {
      const response = await fetch(`/mining/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();  
    } catch (error) {
      return null; 
    }
  }
  async getMiningRigInfo(userId: number) {
    try {
      const response = await fetch(`/mining`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId), 
      });

      return await response.json();
    } catch (error) {
      return null; 
    }
  }
  async getMiningRigDeviceInfo(userId: number) {
    try {
      const response = await fetch(`/mining/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 
        },
        body: JSON.stringify(userId),
      });

      return await response.json(); 
    } catch (error) {
      return null; 
    }
  }
  async getDailyEarnings(userId: number) {
    try {
      const response = await fetch(`/mining/dailyearnings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null; 
    }
  }
  async requestRigStateChange(userId: number, rig: MiningRig) {
    const requestedAction = (this.isOffline(rig.minerStatus!) || this.isStopped(rig.minerStatus!)) ? "START" : "STOP";
    try {
      const response = await fetch(`/mining/${rig.rigId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 
        },
        body: JSON.stringify({ userId, requestedAction }),
      });

      return await response.json(); 
    } catch (error) {
      return null; 
    }
  }
  async requestRigDeviceStateChange(userId: number, device: MiningRigDevice) {
    const requestedAction = this.isDeviceOffline(device.state!) || this.isDeviceDisabled(device.state!) ? "START" : "STOP";
    try {
      const response = await fetch(`/mining/${device.rigId}/${device.deviceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 
        },
        body: JSON.stringify({ userId, requestedAction }),
      });

      return await response.json(); 
    } catch (error) {
      return null; 
    }
  }
  async getNicehashApiInfo(userId: number) {
    try {
      const response = await fetch(`/mining/getnicehashapicredentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }
  async updateNicehashApiInfo(userId: number, keys: NicehashApiKeys) {
    try {
      const response = await fetch(`/mining/updatenicehashapicredentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, keys }),
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
