namespace maxhanna.Server.Controllers.DataContracts
{
    public class ArrayMoveRequest
    {
        public User? User { get; set; }
        public string Direction { get; set; } = string.Empty;
    }
}
