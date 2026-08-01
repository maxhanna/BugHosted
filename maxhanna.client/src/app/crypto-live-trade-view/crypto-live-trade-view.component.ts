import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input } from '@angular/core';
import { AppComponent } from '../app.component';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-crypto-live-trade-view',
  standalone: false,
  templateUrl: './crypto-live-trade-view.component.html',
  styleUrl: './crypto-live-trade-view.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CryptoLiveTradeViewComponent extends ChildComponent {
  constructor(private cdr: ChangeDetectorRef) { super(); }
  // Pill bar collapsed state
  isPillBarCollapsed: boolean = false;

  // Per-currency accordion: which currency sections are expanded
  expandedCurrencies: Set<string> = new Set();

  @Input() inputtedParentRef!: AppComponent;
  @Input() selectedCurrency!: string;
  @Input() latestCurrencyPriceRespectToCAD!: number;
  @Input() hasKrakenApi!: boolean;
  @Input() set activeTradeBots(value: { strategy: string; currency: string; startedSince: string }[]) {
    // The parent binds [activeTradeBots]="getActiveTradeBots()" which can return
    // a NEW array reference on every change-detection cycle. Only rebuild the
    // caches and accordion when the actual set of bots changed — otherwise the
    // user's expand/collapse choices would be wiped constantly.
    const newSig = this.botSignature(value || []);
    if (newSig !== this._lastBotSignature) {
      this._activeTradeBots = value || [];
      this._cachedUniqueCurrencyBots = null;
      this._cachedGroupedBots.clear();
      this.resetExpanded();
      this._lastBotSignature = newSig;
      this.cdr.markForCheck();
    }
  }

  private _activeTradeBots: { strategy: string; currency: string; startedSince: string }[] = [];
  private _cachedUniqueCurrencyBots: { strategy: string; currency: string; startedSince: string }[] | null = null;
  private _cachedGroupedBots: Map<string, { strategy: string; startedSince: string }[]> = new Map();
  private _lastBotSignature = '';

  // Stable fingerprint of the active bots so we can ignore no-op input updates.
  // Signed on currency|strategy only (not startedSince) so a status poll that
  // refreshes the started-since timestamp never resets the user's accordion state.
  private botSignature(bots: { strategy: string; currency: string; startedSince: string }[]): string {
    return bots.map(b => `${b.currency}|${b.strategy}`).sort().join(';');
  }

  get activeTradeBots(): { strategy: string; currency: string; startedSince: string }[] {
    return this._activeTradeBots;
  }

  // Scroll the page to the first group matching the given currency
  scrollToCoin(currency: string) {
    try {
      const normalized = (currency || '').toString();
      // Each grouping wrapper will include the currency as a data attribute
      const selector = `[data-coin='${normalized}']`;
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {
      console.error('scrollToCoin failed', e);
    }
  }

  togglePillBar() {
    this.isPillBarCollapsed = !this.isPillBarCollapsed;
    this.cdr.markForCheck();
  }

  get uniqueCurrencyBots() {
    if (!this._cachedUniqueCurrencyBots) {
      const seen = new Set<string>();
      this._cachedUniqueCurrencyBots = this.activeTradeBots.filter(bot => {
        if (!seen.has(bot.currency)) {
          seen.add(bot.currency);
          return true;
        }
        return false;
      });
    }
    return this._cachedUniqueCurrencyBots;
  }

  groupedBotsByCurrency(currency: string) {
    if (!this._cachedGroupedBots.has(currency)) {
      this._cachedGroupedBots.set(
        currency,
        this.activeTradeBots
          .filter(bot => bot.currency === currency)
          .map(bot => ({ strategy: bot.strategy, startedSince: bot.startedSince }))
      );
    }
    return this._cachedGroupedBots.get(currency) || [];
  }

  getNominalCoinName(coin: string): string {
    const tmpCoin = coin.toUpperCase();
    if (tmpCoin == "XBT" || tmpCoin == "BTC") return "Bitcoin";
    else if (tmpCoin == "XDG") return "Dogecoin";
    else if (tmpCoin == "ETH") return "Ethereum";
    else if (tmpCoin == "SOL") return "Solana";
    else return tmpCoin;
  }

  // ─── Accordion helpers ───

  // Default: only the first currency expanded (the rest collapsed) so the view
  // isn't a wall of tables — especially on mobile. The pill bar lets users jump
  // to any currency, and the chevron header expands/collapses each one.
  private resetExpanded() {
    this.expandedCurrencies.clear();
    const bots = this.uniqueCurrencyBots;
    if (bots.length > 0) {
      this.expandedCurrencies.add(bots[0].currency);
    }
  }

  isCurrencyExpanded(currency: string): boolean {
    return this.expandedCurrencies.has(currency);
  }

  toggleCurrency(currency: string) {
    if (this.expandedCurrencies.has(currency)) {
      this.expandedCurrencies.delete(currency);
    } else {
      this.expandedCurrencies.add(currency);
    }
    this.cdr.markForCheck();
  }

  expandAll() {
    this.uniqueCurrencyBots.forEach(bot => this.expandedCurrencies.add(bot.currency));
    this.cdr.markForCheck();
  }

  collapseAll() {
    this.expandedCurrencies.clear();
    this.cdr.markForCheck();
  }

  allCollapsed(): boolean {
    return this.expandedCurrencies.size === 0;
  }

  // Each currency section renders ONE logs component and ONE history component —
  // their built-in coin + strategy dropdowns do the filtering. We just pick a
  // sensible default strategy (the first active one for that currency).
  firstStrategyFor(currency: string): string {
    const strategies = this.groupedBotsByCurrency(currency);
    return strategies.length > 0 ? strategies[0].strategy : 'DCA';
  }

  strategiesLabel(currency: string): string {
    return this.groupedBotsByCurrency(currency).map(s => s.strategy).join(', ');
  }
}
