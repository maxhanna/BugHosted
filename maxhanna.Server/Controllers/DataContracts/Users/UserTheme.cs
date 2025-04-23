namespace maxhanna.Server.Controllers.DataContracts.Users
{ 
	public class UserTheme
	{
		public int? Id { get; set; }
		public int? UserId { get; set; }
		public string? Name { get; set; }
		public int? BackgroundImage { get; set; }
		public string? BackgroundColor { get; set; } 
		public string? ComponentBackgroundColor { get; set; }
		public string? SecondaryComponentBackgroundColor { get; set; }
		public string? FontColor { get; set; }
		public string? SecondaryFontColor { get; set; }
		public string? ThirdFontColor { get; set; }
		public string? MainHighlightColor { get; set; }
		public string? MainHighlightColorQuarterOpacity { get; set; }
		public string? LinkColor { get; set; }
		public int FontSize { get; set; }
		public string? FontFamily { get; set; }
	}

}
