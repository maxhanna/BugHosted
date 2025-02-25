namespace maxhanna.Server.Controllers.DataContracts.News
{

	public class NewsResponse
	{
		public int Status { get; set; }
		public int NumResults { get; set; }
		public List<NewsItem>? Articles { get; set; }
	}

	public class NewsItem
	{
		public string? Url { get; set; }
		public string? AuthorsByline { get; set; }
		public string? ArticleId { get; set; }
		public string? ClusterId { get; set; }
		public Source? Source { get; set; }
		public string? ImageUrl { get; set; }
		public string? Country { get; set; }
		public string? Language { get; set; }
		public DateTime PubDate { get; set; }
		public DateTime AddDate { get; set; }
		public DateTime RefreshDate { get; set; }
		public float Score { get; set; }
		public string? Title { get; set; }
		public string? Description { get; set; }
		public string? Content { get; set; }
		public string? Medium { get; set; }
		public List<string>? Links { get; set; }
		public List<Label>? Labels { get; set; }
		public List<MatchedAuthor>? MatchedAuthors { get; set; }
		public string? Claim { get; set; }
		public string? Verdict { get; set; }
		public List<Keyword>? Keywords { get; set; }
		public List<NewsTopic>? Topics { get; set; }
		public List<object>? Categories { get; set; }
		public List<Entity>? Entities { get; set; }
		public List<Company>? Companies { get; set; }
		public Sentiment? Sentiment { get; set; }
		public string? Summary { get; set; }
		public string? Translation { get; set; }
		public string? TranslatedTitle { get; set; }
		public string? TranslatedDescription { get; set; }
		public string? TranslatedSummary { get; set; }
		public List<NewsLocation>? Locations { get; set; }
		public bool Reprint { get; set; }
		public string? ReprintGroupId { get; set; }
		public List<Place>? Places { get; set; }
		public List<Person>? People { get; set; }
	}

	public class Source
	{
		public string? Domain { get; set; }
		public object? Location { get; set; }
	}

	public class Label
	{
		public string? Name { get; set; }
	}

	public class MatchedAuthor
	{
		public string? Id { get; set; }
		public string? Name { get; set; }
	}

	public class Keyword
	{
		public string? Name { get; set; }
		public double Weight { get; set; }
	}

	public class NewsTopic
	{
		// Define properties as needed
	}

	public class Entity
	{
		public string? Data { get; set; }
		public string? Type { get; set; }
		public int Mentions { get; set; }
	}

	public class Company
	{
		public string? Id { get; set; }
		public string? Name { get; set; }
		public List<string>? Domains { get; set; }
		public List<string>? Symbols { get; set; }
	}

	public class Sentiment
	{
		public double Positive { get; set; }
		public double Negative { get; set; }
		public double Neutral { get; set; }
	}

	public class NewsLocation
	{
		public string? Country { get; set; }
		public string? State { get; set; }
		public string? County { get; set; }
		public string? City { get; set; }
		public Coordinates? Coordinates { get; set; }
	}

	public class Coordinates
	{
		public double Lat { get; set; }
		public double Lon { get; set; }
	}

	public class Place
	{
		public string? OsmId { get; set; }
		public string? Town { get; set; }
		public string? County { get; set; }
		public string? State { get; set; }
		public string? Country { get; set; }
		public string? CountryCode { get; set; }
		public Coordinates? Coordinates { get; set; }
	}

	public class Person
	{
		public string? WikidataId { get; set; }
		public string? Name { get; set; }
	}

}
