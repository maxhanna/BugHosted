import { Component } from '@angular/core';
 import { User } from '../services/datacontracts/user';
import { AppComponent } from './app.component';

@Component({
  selector: 'app-child-component',
  template: '',
})
export class ChildComponent {
  public unique_key?: number;
  public parentRef?: AppComponent;
  asc: [string, number][] = [];
  isLoading = false;

  remove_me(componentTitle: string) {
    if (this.parentRef && this.unique_key) {
      this.parentRef.removeComponent(this.unique_key);
    } else {
      console.log("key not found: " + componentTitle);
    }
  }
  startLoading() {
    if (document && document.getElementById("loadingDiv")) {
      document.getElementById("loadingDiv")!.style.display = "block";
    }
    this.isLoading = true;
  }
  stopLoading() {
    if (document && document.getElementById("loadingDiv")) {
      document.getElementById("loadingDiv")!.style.display = "none";
    }
    this.isLoading = false;
  } 
  viewProfile(user?: User) {
    if (user && user.id != 0) {
      this.parentRef?.createComponent("User", { "userId": user.id });
    }
  }
  sortTable(columnIndex: number, tableId: string): void {
    var table, rows, switching, i, x, y, shouldSwitch;
    var id = columnIndex;
    table = document.getElementById(tableId) as HTMLTableElement;
    switching = true;
    while (switching) {
      switching = false;
      rows = table!.rows;
      for (i = 1; i < (rows.length - 1); i++) {
        shouldSwitch = false;
        x = rows[i].getElementsByTagName("TD")[id];
        y = rows[i + 1].getElementsByTagName("TD")[id];
        if (this.asc.some(([table, column]) => table === tableId && column === id)) {
          if (x && x.innerHTML && x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
            shouldSwitch = true;
            break;
          }
        } else {
          if (x && x.innerHTML && x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
            shouldSwitch = true;
            break;
          }
        }
      }
      if (shouldSwitch) {
        rows[i].parentNode!.insertBefore(rows[i + 1], rows[i]);
        switching = true;
      }
    }
    if (this.asc.some(([table, column]) => table === tableId && column === id)) {
      this.asc = this.asc.filter(([table, column]) => !(table === tableId && column === id));
    } else {
      this.asc.push([tableId, id]);
    }
  }
  async promiseWrapper(apromise: any) {
    try {
      this.startLoading();
      let response = await apromise;
      return response;
    } finally {
      this.stopLoading();
    }
  }
  
}
