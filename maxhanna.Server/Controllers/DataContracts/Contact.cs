namespace maxhanna.Server.Controllers.DataContracts
{
    public class Contact
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Phone { get; set; }
        public DateTime? Birthday { get; set; }
        public string Notes { get; set; }
        public string Email { get; set; }
        public string Ownership { get; set; }
    }
}