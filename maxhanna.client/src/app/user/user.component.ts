import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { User } from '../../services/datacontracts/user';
import { UserService } from '../../services/user.service';
import { MiningService } from '../../services/mining.service';
import { NicehashApiKeys } from '../../services/datacontracts/nicehash-api-keys';

@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrl: './user.component.css'
})
export class UserComponent extends ChildComponent implements OnInit {
  @ViewChild('loginUsername') loginUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('loginPassword') loginPassword!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedUsername') updatedUsername!: ElementRef<HTMLInputElement>;
  @ViewChild('updatedPassword') updatedPassword!: ElementRef<HTMLInputElement>;
  @ViewChild('orgId') orgId!: ElementRef<HTMLInputElement>;
  @ViewChild('apiKey') apiKey!: ElementRef<HTMLInputElement>;
  @ViewChild('apiSecret') apiSecret!: ElementRef<HTMLInputElement>;
  updateUserDivVisible = false;
  notifications: Array<string> = [];
  usersCount: string | null = null;
  isGeneralToggled = true;
  isNicehashApiKeysToggled = false;
  nhApiKeys?: NicehashApiKeys; 
  constructor(private userService: UserService, private miningService: MiningService) { super(); }
  async ngOnInit() {
    this.getLoggedInUser();
    this.usersCount = await this.userService.getUserCount();
  }
  logout() {
    this.parentRef!.user = undefined;
    this.parentRef!.deleteCookie("username");
    this.parentRef!.deleteCookie("userid");
    this.parentRef!.deleteCookie("userpassword");
    this.notifications.push("Logged out successfully");
  }

  async createUser() {
    const tmpUserName = this.loginUsername.nativeElement.value;
    const tmpPassword = this.loginPassword.nativeElement.value;
    if (!confirm(`Create user ${tmpUserName}?`)) { return; }
    if (tmpUserName) {
      const tmpUser = new User(undefined, tmpUserName, tmpPassword);
      try {
        const res = await this.userService.createUser(tmpUser);
        this.notifications.push(res["message"]);
      } catch (error: any) {
        const message = error["message"];
        if (message.includes("409")) {
          this.notifications.push(`User already exists`);
        } else {
          this.notifications.push(`Error: ${message}`);
        }
      }
    }
    else {
      return alert("Username cannot be empty!");
    }
  }
  async getLoggedInUser() {
    console.log("logged in user? " );

    if (this.parentRef!.getCookie("username") && this.parentRef!.getCookie("userid")) {
      this.parentRef!.user = new User(parseInt(this.parentRef!.getCookie("userid")), this.parentRef!.getCookie("username"), this.parentRef!.getCookie("password"));
      console.log("logged in user : "+this.parentRef!.user);
    }
  }
  async getNicehashApiKeys() {
    if (this.isNicehashApiKeysToggled) {
      this.nhApiKeys = await this.miningService.getNicehashApiInfo(this.parentRef?.user!);
    }
  }
  private async updateNHAPIKeys() {
    if (this.isNicehashApiKeysToggled) {
      let keys = new NicehashApiKeys();
      keys.orgId = this.orgId.nativeElement.value;
      keys.apiKey = this.apiKey.nativeElement.value;
      keys.apiSecret = this.apiSecret.nativeElement.value;
      keys.ownership = this.parentRef?.user!.id;

      try {
        await this.miningService.updateNicehashApiInfo(this.parentRef?.user!, keys);
        this.notifications.push("Nicehash API Keys updated successfully");
      } catch {
        this.notifications.push("Error while updating Nicehash API Keys!");
      }
    }
  }
  async updateUser() {
    const tmpUser = new User(parseInt(this.parentRef!.getCookie("userid")), this.updatedUsername.nativeElement.value, this.updatedPassword.nativeElement.value);
    this.startLoading();
    try {
      const res = await this.userService.updateUser(tmpUser);
      await this.updateNHAPIKeys();
      const message = res["message"];
      this.parentRef!.setCookie("username", tmpUser.username!, 10);
      this.parentRef!.setCookie("userpassword", tmpUser.pass ?? '', 10);
      this.notifications.push(message); 
    } catch (error) {
      this.notifications.push(`Error updating user ${this.parentRef!.user?.username}. Error: ${JSON.stringify(error)}`);
    }
    this.parentRef!.user = await this.userService.getUser(tmpUser);
    this.stopLoading();
  }
  async deleteUser() {
    if (this.parentRef!.getCookie("userid") && this.parentRef!.getCookie("userid") != "") {
      if (confirm("Are you sure you wish to delete your account?")) {
        const tmpUser = new User(parseInt(this.parentRef!.getCookie("userid")), this.parentRef!.getCookie("username"), this.parentRef!.getCookie("userpassword"));
        try {
          const res = await this.userService.deleteUser(tmpUser);
          this.notifications.push(res["message"]);
          this.logout();
        } catch (error) {
          this.notifications.push(`Error deleting user ${this.parentRef!.user?.username}`);
        }
      }      
    } else { return alert("You must be logged in first!"); } 
  }


  async login() {
    this.parentRef!.user = undefined;
    this.parentRef!.deleteCookie("username");
    this.parentRef!.deleteCookie("userid");
    this.parentRef!.deleteCookie("userpassword");
    const tmpLoginUser = new User(undefined, this.loginUsername.nativeElement.value, this.loginPassword.nativeElement.value);
    try {
      const tmpUser = await this.userService.getUser(tmpLoginUser);
 
      if (tmpUser && tmpUser.username) {
        this.parentRef!.setCookie("username", tmpUser?.username!, 10);
        this.parentRef!.setCookie("userid", tmpUser?.id! + "", 10);
        this.parentRef!.setCookie("userpassword", tmpUser?.pass!, 10);
        this.parentRef!.user = tmpUser;
        this.notifications.push(`Access granted. Welcome back ${this.parentRef!.user?.username}`);
      } else {
        this.notifications.push("Access denied");
      }

    } catch (e) {
      this.notifications.push("Access denied");
    }
  }
}
