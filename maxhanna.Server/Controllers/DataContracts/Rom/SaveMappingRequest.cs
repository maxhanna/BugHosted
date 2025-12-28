using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Rom
{
    public class SaveMappingRequest
    {
        public int UserId { get; set; }
        public string Name { get; set; } = string.Empty;
        // mapping: control name -> MappingEntry
        public Dictionary<string, MappingEntry>? Mapping { get; set; }
    }
}
