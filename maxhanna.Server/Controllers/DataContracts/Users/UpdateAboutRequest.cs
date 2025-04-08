namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class UpdateNsfwRequest
	{
		public int UserId { get; set; }
		public Boolean IsAllowed { get; set; }

		public UpdateNsfwRequest(int userId, Boolean isAllowed)
		{
			UserId = userId;
			IsAllowed = isAllowed;
		}
	}
}
