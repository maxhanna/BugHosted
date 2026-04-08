namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class SaveSecurityQuestionsRequest
    {
        public int UserId { get; set; }
        public QuestionAnswer[]? Questions { get; set; }
    }
}