namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class UpdateCompactnessRequest
	{
		public int UserId { get; set; }
		public string Compactness { get; set; }

		public UpdateCompactnessRequest(int userId, string compactness)
		{
			UserId = userId;
			Compactness = compactness;
		}
	}
}
