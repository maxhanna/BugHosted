using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts
{
    public class ShareRomRequest
    {
        public int UserId { get; set; } // The user sharing the ROM
        public List<int> SharedWithUserIds { get; set; } = new List<int>(); // The users to share with
        public int? RomId { get; set; } // Optionally, the ROM/file being shared
    }
}
