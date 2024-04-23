import { Component } from '@angular/core';
import { AppComponent } from './app.component';
import { Observable, first, firstValueFrom, lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-child-component',
  template: '',
})
export class ChildComponent {
  public unique_key?: number;
  public parentRef?: AppComponent;
  asc: [string, number][] =[];

  remove_me() {
    if (this.parentRef && this.unique_key) {
      this.parentRef.removeComponent(this.unique_key);
    }
  }
  startLoading() {
    console.log("start loading");
    if (document && document.getElementById("loadingDiv")) {
      console.log("found element");
      document.getElementById("loadingDiv")!.style.display = "block";
    }
  }
  stopLoading() {
    if (document && document.getElementById("loadingDiv")) {
      document.getElementById("loadingDiv")!.style.display = "none";
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
          if (x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
            shouldSwitch = true;
            break;
          }
        } else {
          if (x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
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
