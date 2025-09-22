namespace maxhanna.Server.Controllers.DataContracts.Viral
{
    public class ViralEntity
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string? Name { get; set; }
        public int CoordsX { get; set; }
        public int CoordsY { get; set; }
        public int Size { get; set; }
        public string? Color { get; set; }
        public string? Map { get; set; }
        public int Speed { get; set; }
        public DateTime Created { get; set; }
    }
}