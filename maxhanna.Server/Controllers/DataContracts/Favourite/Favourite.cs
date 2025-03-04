namespace maxhanna.Server.Controllers.DataContracts.Favourite
{
	public class Favourite
	{ 
		public int Id { get; set; }
		public string Url { get; set; }
		public string? Name { get; set; }
		public string? ImageUrl { get; set; }
		public int? CreatedBy { get; set; }
		public DateTime CreationDate { get; set; }
		public int? ModifiedBy { get; set; }
		public DateTime ModificationDate { get; set; }

		public Favourite(int id, string url, string? name, string? imageUrl, int? createdBy, DateTime creationDate, int? modifiedBy, DateTime modificationDate)
		{ 
			Id = id;
			Url = url;
			Name = name;
			ImageUrl = imageUrl;
			CreatedBy = createdBy;
			CreationDate = creationDate;
			ModifiedBy = modifiedBy;
			ModificationDate = modificationDate;
		}
	}
}
