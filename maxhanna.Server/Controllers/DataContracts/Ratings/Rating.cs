using System;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Ratings
{
    public class Rating
    {
        public int Id { get; set; }
        public int Value { get; set; }
        public DateTime Timestamp { get; set; }
        public int? FileId { get; set; }
        public int? SearchId { get; set; }
        public User? User { get; set; }
    }
}