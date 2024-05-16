namespace maxhanna.Server.Controllers.DataContracts
{
    public class CreateTodo
    {
        public CreateTodo(User user, Todo todo)
        {
            this.user = user;
            this.todo = todo;
        }
        public User user { get; set; }
        public Todo todo { get; set; } 
    }
}
