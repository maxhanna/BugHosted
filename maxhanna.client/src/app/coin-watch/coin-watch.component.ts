import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CoinWatchResponse } from '../coin-watch-response';

@Component({
  selector: 'app-coin-watch',
  templateUrl: './coin-watch.component.html',
  styleUrl: './coin-watch.component.css'
})


export class CoinWatchComponent extends ChildComponent implements OnInit {
  data?: CoinWatchResponse[];

  async ngOnInit() {
    this.data =
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
      ).then(response => response.json()) as CoinWatchResponse[];
  }
}
