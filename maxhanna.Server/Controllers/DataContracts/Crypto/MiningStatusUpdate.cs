namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
	public class MiningStatusUpdate
	{
		public MiningStatusUpdate(int userId, string requestedAction)
		{
			this.userId = userId;
			this.requestedAction = requestedAction;
		}
		public int userId { get; set; }
		public string requestedAction { get; set; }
	}
}
