namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class Total
    {
        public string? currency { get; set; }
        public string? totalBalance { get; set; }
        public string? available { get; set; }
        public string? debt { get; set; }
        public string? pending { get; set; }
    }

    public class Currency
    {
        public bool active { get; set; }
        public string? currency { get; set; }
        public string? totalBalance { get; set; }
        public string? available { get; set; }
        public string? debt { get; set; }
        public string? pending { get; set; }
        public double? btcRate { get; set; }
        public double? fiatRate { get; set; }
        public string? status { get; set; }
    }

    public class MiningWallet
    {
        public Total? total { get; set; }
        public List<Currency>? currencies { get; set; }
    }
}
