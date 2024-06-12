namespace maxhanna.Server.Controllers.DataContracts
{
    public class Topic
    {
        public int Id { get; set; }
        public string? TopicText { get; set; } 
        public Topic() {  }
        public Topic(int id, string topic)
        {
            Id = id;
            TopicText = topic; 
        } 
    }
}
