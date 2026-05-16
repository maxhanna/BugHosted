namespace maxhanna.Server.Controllers.DataContracts.Planter
{
    public class PlantPhoto
    {
        public int Id { get; set; }
        public int PlantId { get; set; }
        public int FileId { get; set; }
        public string? FileName { get; set; }
        public string? FilePath { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
