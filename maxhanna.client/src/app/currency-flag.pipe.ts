import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyFlag'
})
export class CurrencyFlagPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';

    const upperValue = value.toUpperCase();
    const flagEmoji = this.getFlagEmoji(upperValue);

    return flagEmoji || '';
  }

  private getFlagEmoji(value: string): string {
    const currencyToCountryMap: { [key: string]: string } = {
      'USD': 'US', 'CAD': 'CA', 'EUR': 'EU', 'GBP': 'GB', 'AUD': 'AU', 'JPY': 'JP',
      'CNY': 'CN', 'INR': 'IN', 'BRL': 'BR', 'MXN': 'MX', 'SKK': 'SK', 'CHF': 'CH',
      'RUB': 'RU', 'KRW': 'KR', 'TRY': 'TR', 'ZAR': 'ZA', 'SGD': 'SG', 'HKD': 'HK',
      'NZD': 'NZ', 'NOK': 'NO', 'SEK': 'SE', 'DKK': 'DK', 'PLN': 'PL', 'HUF': 'HU',
      'CZK': 'CZ', 'THB': 'TH', 'IDR': 'ID', 'PHP': 'PH', 'MYR': 'MY', 'VND': 'VN',
      'ILS': 'IL', 'SAR': 'SA', 'AED': 'AE', 'EGP': 'EG', 'ARS': 'AR', 'CLP': 'CL',
      'COP': 'CO', 'PEN': 'PE', 'PKR': 'PK', 'BDT': 'BD', 'NGN': 'NG', 'UAH': 'UA',
      'KZT': 'KZ', 'QAR': 'QA', 'TWD': 'TW', 'RON': 'RO', 'BGN': 'BG', 'HRK': 'HR',
      'ISK': 'IS', 'LTL': 'LT', 'LVL': 'LV', 'MTL': 'MT', 'EEK': 'EE', 'MDL': 'MD',
      'MKD': 'MK', 'BAM': 'BA', 'GEL': 'GE', 'AMD': 'AM', 'AZN': 'AZ', 'DZD': 'DZ',
      'IQD': 'IQ', 'JOD': 'JO', 'LBP': 'LB', 'LYD': 'LY', 'MAD': 'MA', 'OMR': 'OM',
      'TND': 'TN', 'YER': 'YE', 'AFN': 'AF', 'BHD': 'BH', 'MMK': 'MM', 'KPW': 'KP',
      'MOP': 'MO', 'LAK': 'LA', 'KHR': 'KH', 'MVR': 'MV', 'NPR': 'NP', 'BTN': 'BT',
      'XCD': 'AG', 'XPF': 'PF', 'XOF': 'BF', 'XAF': 'CF', 'XDR': 'IMF', 'ANG': 'CW',
      'AWG': 'AW', 'BSD': 'BS', 'BBD': 'BB', 'BZD': 'BZ', 'BMD': 'BM', 'KYD': 'KY',
      'CRC': 'CR', 'CUP': 'CU', 'DOP': 'DO', 'GTQ': 'GT', 'HTG': 'HT', 'HNL': 'HN',
      'JMD': 'JM', 'NIO': 'NI', 'PAB': 'PA', 'PYG': 'PY', 'SRD': 'SR', 'TTD': 'TT',
      'UYU': 'UY', 'VES': 'VE', 'ZMW': 'ZM', 'ZWL': 'ZW', 'ETB': 'ET', 'GHS': 'GH',
      'KES': 'KE', 'LSL': 'LS', 'LRD': 'LR', 'MWK': 'MW', 'MUR': 'MU', 'SCR': 'SC',
      'SLL': 'SL', 'SOS': 'SO', 'SZL': 'SZ', 'TZS': 'TZ', 'UGX': 'UG', 'AOA': 'AO',
      'CDF': 'CD', 'DJF': 'DJ', 'GNF': 'GN', 'KMF': 'KM', 'MGA': 'MG', 'RWF': 'RW',
      'STN': 'ST', 'TOP': 'TO', 'WST': 'WS',
      'VUV': 'VU', 'SBD': 'SB', 'PGK': 'PG', 'FJD': 'FJ', 'KID': 'KI', 'TVD': 'TV',
      'ERN': 'ER', 'SSP': 'SS', 'CVE': 'CV', 'FKP': 'FK', 'GIP': 'GI', 'SHP': 'SH',
      'IMP': 'IM', 'JEP': 'JE', 'GGP': 'GG', 'KGS': 'KG', 'TJS': 'TJ', 'TMT': 'TM',
      'UZS': 'UZ', 'MNT': 'MN', 'LKR': 'LK', 'IRR': 'IR', 'KWD': 'KW', 'SYP': 'SY',
    };

    const countryToCodeMap: { [key: string]: string } = {
      'UNITED STATES': 'US', 'CANADA': 'CA', 'EUROPEAN UNION': 'EU', 'UNITED KINGDOM': 'GB',
      'AUSTRALIA': 'AU', 'JAPAN': 'JP', 'CHINA': 'CN', 'INDIA': 'IN', 'BRAZIL': 'BR',
      'MEXICO': 'MX', 'SLOVAKIA': 'SK', 'SWITZERLAND': 'CH', 'RUSSIA': 'RU', 'SOUTH KOREA': 'KR',
      'TURKEY': 'TR', 'SOUTH AFRICA': 'ZA', 'SINGAPORE': 'SG', 'HONG KONG': 'HK',
      'NEW ZEALAND': 'NZ', 'NORWAY': 'NO', 'SWEDEN': 'SE', 'DENMARK': 'DK', 'POLAND': 'PL',
      'HUNGARY': 'HU', 'CZECH REPUBLIC': 'CZ', 'THAILAND': 'TH', 'INDONESIA': 'ID',
      'PHILIPPINES': 'PH', 'MALAYSIA': 'MY', 'VIETNAM': 'VN', 'ISRAEL': 'IL', 'SAUDI ARABIA': 'SA',
      'UNITED ARAB EMIRATES': 'AE', 'EGYPT': 'EG', 'ARGENTINA': 'AR', 'CHILE': 'CL',
      'COLOMBIA': 'CO', 'PERU': 'PE', 'PAKISTAN': 'PK', 'BANGLADESH': 'BD', 'NIGERIA': 'NG',
      'UKRAINE': 'UA', 'KAZAKHSTAN': 'KZ', 'QATAR': 'QA', 'TAIWAN': 'TW', 'ROMANIA': 'RO',
      'BULGARIA': 'BG', 'CROATIA': 'HR', 'ICELAND': 'IS', 'LITHUANIA': 'LT', 'LATVIA': 'LV',
      'MALTA': 'MT', 'ESTONIA': 'EE', 'MOLDOVA': 'MD', 'NORTH MACEDONIA': 'MK',
      'BOSNIA AND HERZEGOVINA': 'BA', 'GEORGIA': 'GE', 'ARMENIA': 'AM', 'AZERBAIJAN': 'AZ',
      'ALGERIA': 'DZ', 'IRAQ': 'IQ', 'JORDAN': 'JO', 'LEBANON': 'LB', 'LIBYA': 'LY',
      'MOROCCO': 'MA', 'OMAN': 'OM', 'TUNISIA': 'TN', 'YEMEN': 'YE', 'AFGHANISTAN': 'AF',
      'BAHRAIN': 'BH', 'MYANMAR': 'MM', 'NORTH KOREA': 'KP', 'MACAO': 'MO', 'LAOS': 'LA',
      'CAMBODIA': 'KH', 'MALDIVES': 'MV', 'NEPAL': 'NP', 'BHUTAN': 'BT', 'ANTIGUA AND BARBUDA': 'AG',
      'FRENCH POLYNESIA': 'PF', 'BURKINA FASO': 'BF', 'CENTRAL AFRICAN REPUBLIC': 'CF',
      'CÔTE D\'IVOIRE': 'CI', 'COMOROS': 'KM', 'CAPE VERDE': 'CV', 'COOK ISLANDS': 'CK',
      'CUBA': 'CU', 'DOMINICA': 'DM', 'DOMINICAN REPUBLIC': 'DO', 'ECUADOR': 'EC',
      'EL SALVADOR': 'SV', 'FIJI': 'FJ', 'GABON': 'GA', 'GRENADA': 'GD', 'GUATEMALA': 'GT',
      'GUINEA': 'GN', 'GUINEA-BISSAU': 'GW', 'GUYANA': 'GY', 'HAITI': 'HT', 'HONDURAS': 'HN',
      'KIRIBATI': 'KI', 'LESOTHO': 'LS', 'LIBERIA': 'LR', 'MADAGASCAR': 'MG', 'MALAWI': 'MW',
      'MARSHALL ISLANDS': 'MH', 'MAURITANIA': 'MR', 'MICRONESIA': 'FM', 'MONACO': 'MC',
      'MONGOLIA': 'MN', 'MONTENEGRO': 'ME', 'NAURU': 'NR', 'NICARAGUA': 'NI', 'PALAU': 'PW',
      'PANAMA': 'PA', 'PAPUA NEW GUINEA': 'PG', 'PARAGUAY': 'PY', 'RWANDA': 'RW', 'SAMOA': 'WS',
      'SAN MARINO': 'SM', 'SAO TOME AND PRINCIPE': 'ST', 'SEYCHELLES': 'SC', 'SIERRA LEONE': 'SL',
      'SOLOMON ISLANDS': 'SB', 'SOMALIA': 'SO', 'SOUTH SUDAN': 'SS', 'SURINAME': 'SR',
      'SWAZILAND': 'SZ', 'TAJIKISTAN': 'TJ', 'TIMOR-LESTE': 'TL', 'TONGA': 'TO', 'TUVALU': 'TV',
      'URUGUAY': 'UY', 'VANUATU': 'VU', 'VATICAN CITY': 'VA', 'WALLIS AND FUTUNA': 'WF',
      'ZAMBIA': 'ZM', 'ZIMBABWE': 'ZW'
    };

    let countryCode = currencyToCountryMap[value] || countryToCodeMap[value];

    if (!countryCode) return '';

    return countryCode
      .split('')
      .map(char => String.fromCodePoint(0x1F1E6 - 65 + char.charCodeAt(0)))
      .join('');
  }
}
