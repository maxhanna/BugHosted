namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class UpdateShowFavouritesOnlyRequest
    {
        public int UserId { get; set; }
        public bool ShowFavouritesOnly { get; set; }

        public UpdateShowFavouritesOnlyRequest() { }
        public UpdateShowFavouritesOnlyRequest(int userId, bool showFavouritesOnly)
        {
            UserId = userId;
            ShowFavouritesOnly = showFavouritesOnly;
        }
    }
}