namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class VerifySecurityQuestionsRequest
    {
        public int UserId { get; set; }
        public AnswerEntry[]? Answers { get; set; }
    }
}