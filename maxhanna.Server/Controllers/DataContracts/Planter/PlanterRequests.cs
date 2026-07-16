namespace maxhanna.Server.Controllers.DataContracts.Planter
{
    public class AddPlantRequest
    {
        public int UserId { get; set; }
        public string? Name { get; set; }
        public string? Species { get; set; }
        public string? Notes { get; set; }
        public string? Location { get; set; }
        public int? PhotoFileId { get; set; }
        public int? SuggestedWaterHours { get; set; }
    }

    public class UpdatePlantRequest
    {
        public int PlantId { get; set; }
        public string? Name { get; set; }
        public string? Species { get; set; }
        public string? Notes { get; set; }
        public string? Location { get; set; }
        public DateTime? LastWatered { get; set; }
        public int? SuggestedWaterHours { get; set; }
    }

    public class PlantAnalysisRequest
    {
        public int UserId { get; set; }
        public int PlantId { get; set; }
        public int PhotoFileId { get; set; }
        public string? AnalysisType { get; set; }
        public bool Regenerate { get; set; }
    }

    public class PlantChatRequest
    {
        public int UserId { get; set; }
        public int PlantId { get; set; }
        public string? Message { get; set; }
        public int? PhotoFileId { get; set; }
    }

    public class IdentifyPlantRequest
    {
        public int UserId { get; set; }
        public int PhotoFileId { get; set; }
    }

    public class PlantSuggestion
    {
        public string? Name { get; set; }
        public string? Species { get; set; }
        public string? Reason { get; set; }
    }

    public class IdentifyPlantResponse
    {
        public List<PlantSuggestion>? Suggestions { get; set; }
        public PlantSuggestion? TopPick { get; set; }
        public int? SuggestedWaterHours { get; set; }
    }
}
