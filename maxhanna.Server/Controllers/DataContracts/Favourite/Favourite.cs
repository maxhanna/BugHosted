namespace maxhanna.Server.Controllers.DataContracts.Favourite
{
	public class Favourite
	{ 
		public int Id { get; set; }
		public string Url { get; set; }
		public string? Name { get; set; }
		public string? ImageUrl { get; set; }
		public int? UserCount { get; set; }
		public int? CreatedBy { get; set; }
		public DateTime CreationDate { get; set; }
		public int? ModifiedBy { get; set; }
		public DateTime ModificationDate { get; set; }
		public DateTime LastAddedDate { get; set; }
		public int? AccessCount { get; set; }

		public Favourite(int id, string url, string? name, string? imageUrl, int? userCount, 
		int? createdBy, DateTime creationDate, int? modifiedBy, DateTime modificationDate, DateTime lastAddedDate, int? accessCount)
		{ 
			Id = id;
			Url = url;
			Name = name;
			ImageUrl = imageUrl;
			UserCount = userCount;
			CreatedBy = createdBy;
			CreationDate = creationDate;
			ModifiedBy = modifiedBy;
			ModificationDate = modificationDate;
			LastAddedDate = lastAddedDate;
			AccessCount = accessCount;
		}
	}
}
