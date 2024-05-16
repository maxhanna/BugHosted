namespace maxhanna.Server.Controllers.DataContracts
{
    public class MiningStatusUpdate
    {
        public MiningStatusUpdate(User user, string requestedAction)
        {
            this.user = user;
            this.requestedAction = requestedAction;
        }
        public User user { get; set; }
        public string requestedAction { get; set; } 
    }
}
