namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class UpdateNsfwRequest
	{
		public User User { get; set; }
		public Boolean IsAllowed { get; set; }

		public UpdateNsfwRequest(User user, Boolean isAllowed)
		{
			User = user;
			IsAllowed = isAllowed;
		}
	}
}
