export interface Total {
  currency?: string;
  totalBalance?: string;
  available?: string;
  debt?: string;
  pending?: string;
  fiatRate?: number;
}

export interface Currency {
  active: boolean;
  currency?: string;
  address?: string;
  totalBalance?: string;
  available?: string;
  debt?: string;
  pending?: string;
  btcRate?: number;
  fiatRate?: number;
  status?: string;
}

export class MiningWalletResponse {
  total?: Total;
  currencies?: Currency[];
}
