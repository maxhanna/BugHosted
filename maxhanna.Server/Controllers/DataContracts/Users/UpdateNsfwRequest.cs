namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class UpdateAboutRequest
	{
		public int UserId { get; set; }
		public UserAbout About { get; set; }

		public UpdateAboutRequest(int userId, UserAbout about)
		{
			UserId = userId;
			About = about;
		}
	}
}
