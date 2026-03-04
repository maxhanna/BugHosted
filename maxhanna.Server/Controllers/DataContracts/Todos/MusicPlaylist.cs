namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	public class MusicPlaylist
	{
		public MusicPlaylist() { }
		public MusicPlaylist(int id, string name, int userId, DateTime? date)
		{
			this.id = id;
			this.name = name;
			this.userId = userId;
			this.date = date;
		}
		public int id { get; set; }
		public string name { get; set; } = "";
		public int userId { get; set; }
		public DateTime? date { get; set; }
	}

	public class CreateMusicPlaylistRequest
	{
		public int userId { get; set; }
		public string name { get; set; } = "";
	}

	public class DeleteMusicPlaylistRequest
	{
		public int userId { get; set; }
		public int playlistId { get; set; }
	}

	public class RenameMusicPlaylistRequest
	{
		public int userId { get; set; }
		public int playlistId { get; set; }
		public string name { get; set; } = "";
	}

	public class SaveMusicPlaylistEntriesRequest
	{
		public int userId { get; set; }
		public int playlistId { get; set; }
		public List<int> todoIds { get; set; } = new();
	}

	public class GetMusicPlaylistEntriesRequest
	{
		public int userId { get; set; }
		public int playlistId { get; set; }
	}
}
