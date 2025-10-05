using System;
using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class MetaEvent
    {
        public int Id { get; set; }
        public int HeroId { get; set; }
        public DateTime Timestamp { get; set; }
        public string EventType { get; set; }
        public int Level { get; set; }
        public Dictionary<string, string>? Data { get; set; }

        public MetaEvent(int id, int heroId, DateTime timestamp, string eventType, int level, Dictionary<string, string>? data)
        {
            Id = id;
            HeroId = heroId;
            Timestamp = timestamp;
            EventType = eventType;
            Level = level;
            Data = data;
        }
    }
}
