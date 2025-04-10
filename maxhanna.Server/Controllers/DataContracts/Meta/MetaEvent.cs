
namespace maxhanna.Server.Controllers.DataContracts.Meta
{
	public class MetaEvent
	{
		public int Id { get; set; }
		public int HeroId { get; set; }
		public DateTime Timestamp { get; set; }
		public string EventType { get; set; }
		public string Map { get; set; }
		public Dictionary<string, string>? Data { get; set; }

		public MetaEvent(int id, int heroId, DateTime timestamp, string eventType, string map, Dictionary<string, string>? data)
		{
			Id = id;
			HeroId = heroId;
			Timestamp = timestamp;
			EventType = eventType;
			Map = map;
			Data = data;
		}
	}
}
