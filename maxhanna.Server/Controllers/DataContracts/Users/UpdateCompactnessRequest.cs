namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class UpdateCompactnessRequest
	{
		public int UserId { get; set; }
		public Compactness Compactness { get; set; }

		public UpdateCompactnessRequest(int userId, Compactness compactness)
		{
			UserId = userId;
			Compactness = compactness;
		}
	}

	
		[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
		public enum Compactness
		{
			no,
			yes,
			yess
		} 
}
