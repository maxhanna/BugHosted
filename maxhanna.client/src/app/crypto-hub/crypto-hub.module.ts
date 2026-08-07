import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

import { AppModule } from '../app.module';
import { CryptoHubComponent } from './crypto-hub.component';

export { CryptoHubComponent };
import { LineGraphComponent } from '../line-graph/line-graph.component';
import { CryptoGlobalStatsComponent } from '../crypto-global-stats/crypto-global-stats.component';
import { CryptoFearAndGreedComponent } from '../crypto-fear-and-greed/crypto-fear-and-greed.component';
import { CryptoCalendarComponent } from '../crypto-calendar/crypto-calendar.component';
import { CryptoBotConfigurationComponent } from '../crypto-bot-configuration/crypto-bot-configuration.component';
import { CryptoMarketCapsComponent } from '../crypto-market-caps/crypto-market-caps.component';
import { CryptoTradebotInformationComponent } from '../crypto-tradebot-information/crypto-tradebot-information.component';
import { CryptoBitcoinPerformanceComponent } from '../crypto-bitcoin-performance/crypto-bitcoin-performance.component';
import { CryptoWalletsComponent } from '../crypto-wallets/crypto-wallets.component';
import { CryptoTradeHistoryComponent } from '../crypto-trade-history/crypto-trade-history.component';
import { CryptoTradeLogsComponent } from '../crypto-trade-logs/crypto-trade-logs.component';
import { CryptoCoinGraphViewerComponent } from '../crypto-coin-graph-viewer/crypto-coin-graph-viewer.component';
import { CryptoCoinVolumeGraphViewerComponent } from '../crypto-coin-volume-graph-viewer/crypto-coin-volume-graph-viewer.component';
import { CryptoLiveTradeViewComponent } from '../crypto-live-trade-view/crypto-live-trade-view.component';
import { CryptoTopTradersComponent } from '../crypto-top-traders/crypto-top-traders.component';
import { CryptoNewsArticlesComponent } from '../crypto-news-articles/crypto-news-articles.component';
import { MiningRigsComponent } from '../mining-rigs/mining-rigs.component';

/**
 * Lazily-loaded module for the whole crypto subtree (Crypto Hub + all its chart
 * widgets). Because it is only ever loaded via the AppComponent loader, its code
 * — including chart.js/ng2-charts and the crypto components — is split out of the
 * initial main.js bundle.
 */
@NgModule({
  declarations: [
    CryptoHubComponent,
    CryptoCalendarComponent,
    CryptoBotConfigurationComponent,
    CryptoMarketCapsComponent,
    CryptoTradebotInformationComponent,
    CryptoBitcoinPerformanceComponent,
    CryptoWalletsComponent,
    CryptoTradeHistoryComponent,
    CryptoTradeLogsComponent,
    CryptoCoinGraphViewerComponent,
    CryptoCoinVolumeGraphViewerComponent,
    CryptoLiveTradeViewComponent,
    CryptoTopTradersComponent,
    CryptoNewsArticlesComponent,
    MiningRigsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    AppModule,
    LineGraphComponent,
    CryptoGlobalStatsComponent,
    CryptoFearAndGreedComponent,
  ],
  providers: [
    provideCharts(withDefaultRegisterables()),
  ],
})
export class CryptoModule { }
