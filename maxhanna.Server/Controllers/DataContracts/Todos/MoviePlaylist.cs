namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	/// <summary>A movie/TV playlist. Every playlist on the site is public by
	///  design — anyone can open it and play its entries.</summary>
	public class MoviePlaylist
	{
		public MoviePlaylist() { }
		public MoviePlaylist(int id, string name, int userId, DateTime? date, string? ownerName = null)
		{
			this.id = id;
			this.name = name;
			this.userId = userId;
			this.date = date;
			this.ownerName = ownerName;
		}
		public int id { get; set; }
		public string name { get; set; } = "";
		public int userId { get; set; }
		public DateTime? date { get; set; }
		public string? ownerName { get; set; }
	}

	public class CreateMoviePlaylistRequest
	{
		public int userId { get; set; }
		public string name { get; set; } = "";
	}

	public class DeleteMoviePlaylistRequest
	{
		public int userId { get; set; }
		public int playlistId { get; set; }
	}

	public class RenameMoviePlaylistRequest
	{
		public int userId { get; set; }
		public int playlistId { get; set; }
		public string name { get; set; } = "";
	}

	public class SaveMoviePlaylistEntriesRequest
	{
		public int userId { get; set; }
		public int playlistId { get; set; }
		public List<int> todoIds { get; set; } = new();
	}

	public class GetMoviePlaylistEntriesRequest
	{
		public int playlistId { get; set; }
	}
}
