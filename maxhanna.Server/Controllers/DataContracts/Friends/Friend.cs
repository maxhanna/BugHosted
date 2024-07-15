namespace maxhanna.Server.Controllers.DataContracts.Friends
{
    public class Friend
    {
        public int Id { get; set; }
        public int UserId1 { get; set; }
        public int UserId2 { get; set; }
        public DateTime BecameFriendsAt { get; set; }
    }
}
