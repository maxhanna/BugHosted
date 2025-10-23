namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class EncounterPositionUpdate
	{
		[System.Text.Json.Serialization.JsonPropertyName("botId")] public int BotId { get; set; }
		[System.Text.Json.Serialization.JsonPropertyName("heroId")] public int HeroId { get; set; }
		[System.Text.Json.Serialization.JsonPropertyName("destinationX")] public int DestinationX { get; set; }
		[System.Text.Json.Serialization.JsonPropertyName("destinationY")] public int DestinationY { get; set; }
	}
}
