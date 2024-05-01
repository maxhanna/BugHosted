namespace maxhanna.Server
{
    public class MiningRigDevice
    {
        public string? rigId { get; set; }
        public string? rigName { get; set; }
        public string? deviceName { get; set; }
        public string? deviceId { get; set; }
        public string? miner { get; set; }
        public int state { get; set; }
        public float temperature { get; set; }
        public float speed { get; set; }
        public float fanSpeed { get; set; }
        public float fanSpeedRPM { get; set; }
        public float power { get; set; }
        public float coreClock { get; set; }
        public float memoryClock { get; set; }
        public float coreVoltage { get; set; }
        public float powerLimitPercentage { get; set; }
        public float powerLimitWatts { get; set; }
    }
}
