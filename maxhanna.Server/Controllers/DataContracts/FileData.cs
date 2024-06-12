using System.Xml.Linq;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace maxhanna.Server.Controllers.DataContracts
{
    public class FileData
    { 
        public FileData() { }
        public FileData(int file_id, string givenFileName, string description, DateTime lastUpdated, User lastUpdatedBy)
        {
            FileId = file_id;
            GivenFileName = givenFileName;
            Description = description;
            LastUpdated = lastUpdated;
            LastUpdatedBy = lastUpdatedBy;
        }
        public int? FileId { get; set; }
        public string? GivenFileName { get; set; }
        public string? Description { get; set; } 
        public DateTime? LastUpdated { get; set; }
        public User? LastUpdatedBy { get; set; }
    }
}
