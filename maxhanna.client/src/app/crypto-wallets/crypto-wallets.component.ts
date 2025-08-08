import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';
import { CoinValueService } from '../../services/coin-value.service';
import { Currency, MiningWalletResponse, Total } from '../../services/datacontracts/crypto/mining-wallet-response';
import { CoinValue } from '../../services/datacontracts/crypto/coin-value';

@Component({
  selector: 'app-crypto-wallets',
  standalone: false,
  templateUrl: './crypto-wallets.component.html',
  styleUrl: './crypto-wallets.component.css'
})
export class CryptoWalletsComponent extends ChildComponent implements OnInit {
  wallet?: MiningWalletResponse[];
  currentlySelectedCurrency?: Currency;
  allWalletBalanceData: any;
  isWalletPanelOpen = false;
  isAddCryptoDivVisible = false;
  isWalletGraphFullscreened = false;
  areWalletAddressesHidden = true;

  constructor(private coinValueService: CoinValueService) { super(); }

  @ViewChild('newWalletInput') newWalletInput!: ElementRef<HTMLInputElement>;

  @Input() inputtedParentRef?: AppComponent;
  @Input() selectedCurrency?: string;
  @Input() isDiscreete = false;
  @Input() latestCoinValueData?: CoinValue[];
  @Output() selectCoin = new EventEmitter<string>();
  @Output() gotWallet = new EventEmitter<MiningWalletResponse[]>();

  ngOnInit() { this.getBTCWallets(); }

  saveNewCryptoWallet() {
    const user = this.inputtedParentRef?.user;
    if (!user?.id) return alert("You must be signed in to add a wallet.");
    const walletInfo = this.newWalletInput.nativeElement.value;

    // General Bitcoin address validation regex
    const btcAddressRegex = /^(1|3|bc1)[a-zA-Z0-9]{25,42}$/;
    if (walletInfo) {
      if (btcAddressRegex.test(walletInfo)) {
        this.inputtedParentRef?.getSessionToken().then(sessionToken => {
          this.coinValueService.updateBTCWalletAddresses(user?.id ?? 0, [walletInfo], sessionToken);
        });

      } else {
        alert('Invalid Bitcoin address. Please check for invalid characters.');
      }
    }

    this.isAddCryptoDivVisible = false;
    this.ngOnInit();
  }

  async showWalletData(currency: Currency) {
    if (!this.inputtedParentRef?.user?.id) return alert("You must be logged in to see wallet data.");
    if (!currency.address) { return alert("No BTC Wallet address to look up."); }
    this.showWalletPanel();
    this.currentlySelectedCurrency = currency;

    await this.coinValueService.getWalletBalanceData(currency.address, currency.currency ?? "BTC", this.inputtedParentRef.user.id).then(res => {
      if (res) {
        this.allWalletBalanceData = res;
      }
    });
  }
  getCurrencyValue(currency?: Currency): number {
    if (!currency || !currency.totalBalance) return 0; 
    return parseFloat(currency.totalBalance) * (currency.fiatRate ?? 1); 
  } 

  getTotalCurrencyDisplayValue(wallet?: MiningWalletResponse) {
    if (this.isDiscreete) return '***';
    if (!wallet || !wallet.total || !wallet.total.totalBalance) return 0; 
    const fiatRate = wallet.currencies ? (wallet.currencies[0].fiatRate ?? 1) : 1;
    return parseFloat(wallet.total.totalBalance) * fiatRate;
  }


  fullscreenSelectedInPopup(event?: any) {
    this.isWalletGraphFullscreened = !this.isWalletGraphFullscreened;
  }

  showWalletPanel() {
    if (this.isWalletPanelOpen) {
      this.closeWalletPanel();
      return;
    }
    this.isWalletPanelOpen = true;
    if (this.inputtedParentRef) {
      this.inputtedParentRef.showOverlay();
    }
  }
  closeWalletPanel() {
    this.isWalletPanelOpen = false;
    if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
  }
  showHideAddWalletDiv() {
    if (!this.inputtedParentRef?.user?.id) {
      return alert("Please log in to use this feature and keep track of your crypto wallets.");
    }
    this.isAddCryptoDivVisible = !this.isAddCryptoDivVisible;
  }

  
    private async getBTCWallets() { 
      const user = this.inputtedParentRef?.user;
      const token = await this.inputtedParentRef?.getSessionToken();
      if (user?.id) {
        await this.coinValueService.getWallet(user.id, token ?? "").then(res => {
          if (res && res.length > 0) {
            this.wallet = res;
          }
        });
      }
  
      if (this.wallet) {
        for (let type of this.wallet) {
          console.log(type);
          type.total = {
            currency: "Total " + type?.total?.currency?.toUpperCase(),
            totalBalance: (type.currencies ?? [])
              .filter(x => x.currency?.toUpperCase() === type?.total?.currency?.toUpperCase())
              .reduce((sum, curr) => sum + Number(curr.totalBalance || 0), 0)
              .toString(),
            available: (type.currencies ?? [])
              .filter(x => x.currency?.toUpperCase() === type?.total?.currency?.toUpperCase())
              .reduce((sum, curr) => sum + Number(curr.available || 0), 0)
              .toString(),
            fiatRate: (type.currencies ? type.currencies[0].fiatRate : 1)
          };
        }
      }
       
      this.gotWallet.emit(this.wallet);
    }
    getTotalWalletBalance() {
      return (parseFloat(this.currentlySelectedCurrency?.totalBalance ?? "0")) * (this.currentlySelectedCurrency?.fiatRate ?? 1)
    }
}
