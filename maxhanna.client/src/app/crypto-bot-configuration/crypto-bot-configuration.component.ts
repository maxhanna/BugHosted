import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { TradeService } from '../../services/trade.service';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-crypto-bot-configuration',
  standalone: false,
  templateUrl: './crypto-bot-configuration.component.html',
  styleUrl: './crypto-bot-configuration.component.css'
})
export class CryptoBotConfigurationComponent extends ChildComponent {
  constructor(private tradeService: TradeService) { super(); }
  @Input() inputtedParentRef?: AppComponent;
  @Output() updatedTradeConfig = new EventEmitter<string>();

  @ViewChild('tradeFromCoinSelect') tradeFromCoinSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeStrategySelect') tradeStrategySelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeToCoinSelect') tradeToCoinSelect!: ElementRef<HTMLSelectElement>;
  @ViewChild('tradeMaximumFromTradeAmount') tradeMaximumFromTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMaximumToTradeAmount') tradeMaximumToTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumFromTradeAmount') tradeMinimumFromTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumToTradeAmount') tradeMinimumToTradeAmount!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeTradeThreshold') tradeTradeThreshold!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMaximumTradeBalanceRatio') tradeMaximumTradeBalanceRatio!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeValueTradePercentage') tradeValueTradePercentage!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeValueSellPercentage') tradeValueSellPercentage!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeInitialMinimumFromAmountToStart') tradeInitialMinimumFromAmountToStart!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeInitialMinimumUSDCAmountToStart') tradeInitialMinimumUSDCAmountToStart!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeInitialMaximumUSDCAmountToStart') tradeInitialMaximumUSDCAmountToStart!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumFromReserves') tradeMinimumFromReserves!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeMinimumToReserves') tradeMinimumToReserves!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeTradeMaximumTypeOccurances') tradeTradeMaximumTypeOccurances!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeStopLoss') tradeStopLoss!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeStopLossPercentage') tradeStopLossPercentage!: ElementRef<HTMLInputElement>;
  @ViewChild('tradeVolumeSpikeMaxTradeOccurance') tradeVolumeSpikeMaxTradeOccurance!: ElementRef<HTMLInputElement>;

  tradeConfigLastUpdated: Date | undefined = undefined;
  private readonly DEFAULT_USER_ID = 1;

  async updateCoinConfiguration() {
    if (!this.inputtedParentRef?.user?.id) {
      return alert("You must be logged in to save your configuration.");
    }

    const getVal = (el: ElementRef) => el.nativeElement?.value?.toString().trim();
    const parseNum = (val: string | null) => val !== null && val !== '' ? parseFloat(val) : null;

    const fromCoin = getVal(this.tradeFromCoinSelect);
    const toCoin = getVal(this.tradeToCoinSelect);
    const strategy = getVal(this.tradeStrategySelect);

    if (!fromCoin) return alert("Invalid 'From' coin.");
    if (!toCoin) return alert("Invalid 'To' coin.");

    const fields = {
      MaximumFromTradeAmount: parseNum(getVal(this.tradeMaximumFromTradeAmount)),
      MinimumFromTradeAmount: parseNum(getVal(this.tradeMinimumFromTradeAmount)),
      TradeThreshold: parseNum(getVal(this.tradeTradeThreshold)),
      MaximumTradeBalanceRatio: parseNum(getVal(this.tradeMaximumTradeBalanceRatio)),
      MaximumToTradeAmount: parseNum(getVal(this.tradeMaximumToTradeAmount)),
      ValueTradePercentage: parseNum(getVal(this.tradeValueTradePercentage)),
      ValueSellPercentage: parseNum(getVal(this.tradeValueSellPercentage)),
      InitialMinimumFromAmountToStart: parseNum(getVal(this.tradeInitialMinimumFromAmountToStart)),
      InitialMinimumUSDCAmountToStart: parseNum(getVal(this.tradeInitialMinimumUSDCAmountToStart)),
      InitialMaximumUSDCAmountToStart: parseNum(getVal(this.tradeInitialMaximumUSDCAmountToStart)),
      MinimumFromReserves: parseNum(getVal(this.tradeMinimumFromReserves)),
      MinimumToReserves: parseNum(getVal(this.tradeMinimumToReserves)),
      MaxTradeTypeOccurances: parseNum(getVal(this.tradeTradeMaximumTypeOccurances)),
      TradeStopLoss: parseNum(getVal(this.tradeStopLoss)),
      TradeStopLossPercentage: parseNum(getVal(this.tradeStopLossPercentage)),
      VolumeSpikeMaxTradeOccurance: parseNum(getVal(this.tradeVolumeSpikeMaxTradeOccurance)),
    };

    const invalidField = Object.entries(fields).find(([key, val]) => val === null || isNaN(val));
    if (invalidField) {
      return alert(`Invalid value for '${invalidField[0]}'.`);
    }
    if ((fields?.TradeStopLossPercentage ?? 0) <= 0 && strategy == "IND") {
      return alert(`Invalid value for 'TradeStopLossPercentage'. Value must be above 0.`); 
    }

    const config = {
      UserId: this.inputtedParentRef.user.id,
      FromCoin: fromCoin,
      ToCoin: toCoin,
      Strategy: strategy,
      Updated: new Date().toISOString(),
      ...fields
    };

    const sessionToken = await this.inputtedParentRef.getSessionToken();
    this.tradeService.upsertTradeConfiguration(config, sessionToken)
      .then((result: any) => {
        if (result) {
          this.inputtedParentRef?.showNotification(`Updated (${fromCoin}|${toCoin}:${strategy}) configuration: ${result}`);
          this.updatedTradeConfig.emit(fromCoin);
        } else {
          this.inputtedParentRef?.showNotification(`Error updating (${fromCoin}|${toCoin}:${strategy}) configuration.`);
        }
      })
      .catch((err: any) => {
        console.error(err);
        this.inputtedParentRef?.showNotification('Failed to update configuration.');
      });
  }
 
  async getTradeConfiguration() {
    this.tradeConfigLastUpdated = undefined;
    const userId = this.inputtedParentRef?.user?.id;
    const sessionToken = await this.inputtedParentRef?.getSessionToken();
    if (!userId || !sessionToken) { return alert("You must be logged in to get settings."); }
    const fromCoin = this.tradeFromCoinSelect?.nativeElement?.value ?? "BTC";
    const toCoin = this.tradeToCoinSelect?.nativeElement?.value ?? "USDC";
    const dcaOrIndicator = this.tradeStrategySelect?.nativeElement?.value ?? "DCA";
    
    const tv = await this.tradeService.getTradeConfiguration(userId, sessionToken, fromCoin, toCoin, dcaOrIndicator);
    if (tv && tv.length > 0) {
      this.applyTradeConfiguration(tv); 
    } else { 
      // If current user doesn't have a config, try to get default config from user 1
      const defaultSessionToken = ""; 
      const defaultConfig = await this.tradeService.getTradeConfiguration(
        this.DEFAULT_USER_ID,
        defaultSessionToken,
        fromCoin,
        toCoin,
        dcaOrIndicator
      ); 
      if (defaultConfig) {
        this.applyTradeConfiguration(defaultConfig);
      } else { 
        this.setDefaultTradeConfiguration();
      }
  
    }
  }

  private applyTradeConfiguration(config: any) {
    this.tradeMaximumTradeBalanceRatio.nativeElement.valueAsNumber = config.maximumTradeBalanceRatio;
    this.tradeTradeThreshold.nativeElement.valueAsNumber = config.tradeThreshold;
    this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = config.minimumFromTradeAmount;
    this.tradeMaximumFromTradeAmount.nativeElement.valueAsNumber = config.maximumFromTradeAmount;
    this.tradeMaximumToTradeAmount.nativeElement.valueAsNumber = config.maximumToTradeAmount;
    this.tradeValueTradePercentage.nativeElement.valueAsNumber = config.valueTradePercentage;
    this.tradeValueSellPercentage.nativeElement.valueAsNumber = config.valueSellPercentage;
    this.tradeInitialMinimumFromAmountToStart.nativeElement.valueAsNumber = config.initialMinimumFromAmountToStart;
    this.tradeInitialMinimumUSDCAmountToStart.nativeElement.valueAsNumber = config.initialMinimumUSDCAmountToStart;
    this.tradeInitialMaximumUSDCAmountToStart.nativeElement.valueAsNumber = config.initialMaximumUSDCAmountToStart;
    this.tradeMinimumFromReserves.nativeElement.valueAsNumber = config.minimumFromReserves;
    this.tradeMinimumToReserves.nativeElement.valueAsNumber = config.minimumToReserves;
    this.tradeTradeMaximumTypeOccurances.nativeElement.valueAsNumber = config.maxTradeTypeOccurances;
    this.tradeVolumeSpikeMaxTradeOccurance.nativeElement.valueAsNumber = config.volumeSpikeMaxTradeOccurance;
    this.tradeStopLoss.nativeElement.valueAsNumber = config.tradeStopLoss;
    this.tradeStopLossPercentage.nativeElement.valueAsNumber = config.tradeStopLossPercentage;
    this.tradeConfigLastUpdated = config.updated;
  }

  setDefaultTradeConfiguration() {
    this.tradeConfigLastUpdated = undefined;

    // Set common defaults
    this.tradeTradeMaximumTypeOccurances.nativeElement.valueAsNumber = 5;
    this.tradeStopLoss.nativeElement.valueAsNumber = 0;
    this.tradeStopLossPercentage.nativeElement.valueAsNumber = 0.5;
    this.tradeVolumeSpikeMaxTradeOccurance.nativeElement.valueAsNumber = 1;
    this.tradeMinimumToReserves.nativeElement.valueAsNumber = 20;
    this.tradeMaximumToTradeAmount.nativeElement.valueAsNumber = 2000;
    this.tradeValueTradePercentage.nativeElement.valueAsNumber = 0.15;
    this.tradeValueSellPercentage.nativeElement.valueAsNumber = 0.075;
    this.tradeInitialMaximumUSDCAmountToStart.nativeElement.valueAsNumber = 0;
    this.tradeTradeThreshold.nativeElement.valueAsNumber = 0.0085;
    this.tradeMaximumTradeBalanceRatio.nativeElement.valueAsNumber = 0.9;

    // Set coin-specific defaults
    const fromCoin = this.tradeFromCoinSelect.nativeElement.value;
    const toCoin = this.tradeToCoinSelect.nativeElement.value;

    if (fromCoin === "XBT" && toCoin === "USDC") {
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 0.00005;
      this.tradeMaximumFromTradeAmount.nativeElement.valueAsNumber = 0.005;
      this.tradeInitialMinimumFromAmountToStart.nativeElement.valueAsNumber = 0.001999;
      this.tradeInitialMinimumUSDCAmountToStart.nativeElement.valueAsNumber = 200;
      this.tradeMinimumFromReserves.nativeElement.valueAsNumber = 0.0004;
    } else if (fromCoin === "XRP" && toCoin === "USDC") {
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 2;
      this.tradeMaximumFromTradeAmount.nativeElement.valueAsNumber = 50;
      this.tradeInitialMinimumFromAmountToStart.nativeElement.valueAsNumber = 20;
      this.tradeInitialMinimumUSDCAmountToStart.nativeElement.valueAsNumber = 25;
      this.tradeInitialMaximumUSDCAmountToStart.nativeElement.valueAsNumber = 50;
      this.tradeMinimumFromReserves.nativeElement.valueAsNumber = 20;
    } else if (fromCoin === "SOL" && toCoin === "USDC") {
      this.tradeMaximumFromTradeAmount.nativeElement.valueAsNumber = 0.5;
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 0.02;
      this.tradeInitialMinimumFromAmountToStart.nativeElement.valueAsNumber = 0.05;
      this.tradeInitialMinimumUSDCAmountToStart.nativeElement.valueAsNumber = 50;
      this.tradeInitialMaximumUSDCAmountToStart.nativeElement.valueAsNumber = 150;
      this.tradeMinimumFromReserves.nativeElement.valueAsNumber = 0.00004;
    } else if (fromCoin === "XDG" && toCoin === "USDC") {
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 25;
      this.tradeMaximumFromTradeAmount.nativeElement.valueAsNumber = 100;
      this.tradeInitialMinimumFromAmountToStart.nativeElement.valueAsNumber = 50;
      this.tradeInitialMinimumUSDCAmountToStart.nativeElement.valueAsNumber = 25;
      this.tradeInitialMaximumUSDCAmountToStart.nativeElement.valueAsNumber = 50;
      this.tradeMinimumFromReserves.nativeElement.valueAsNumber = 20;
    } else if (fromCoin === "ETH" && toCoin === "USDC") {
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 0.00005;
      this.tradeMaximumFromTradeAmount.nativeElement.valueAsNumber = 0.005;
      this.tradeInitialMinimumFromAmountToStart.nativeElement.valueAsNumber = 0.001999;
      this.tradeInitialMinimumUSDCAmountToStart.nativeElement.valueAsNumber = 200;
      this.tradeMinimumFromReserves.nativeElement.valueAsNumber = 0.0004;
    } else {
      // Default fallback values
      this.tradeMinimumFromTradeAmount.nativeElement.valueAsNumber = 0.00005;
      this.tradeMaximumFromTradeAmount.nativeElement.valueAsNumber = 0.005;
      this.tradeInitialMinimumFromAmountToStart.nativeElement.valueAsNumber = 0.001999;
      this.tradeInitialMinimumUSDCAmountToStart.nativeElement.valueAsNumber = 200;
      this.tradeMinimumFromReserves.nativeElement.valueAsNumber = 0.0004;
    }
  }

  tradeFromCoinSelectChange() {
    this.getTradeConfiguration();
  }

  tradeStrategySelectChange() {
    this.getTradeConfiguration();
  } 
  toggleExplanation(event: Event) {
    const target = event.currentTarget as HTMLElement;
    target.classList.toggle('expanded');
  } 
  multiplyBy100(value: string) {
    if (!value) return 0;
    return parseFloat(value) * 100;
  }
}
