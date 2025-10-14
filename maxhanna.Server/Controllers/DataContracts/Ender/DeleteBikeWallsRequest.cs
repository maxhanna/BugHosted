using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class DeleteBikeWallsRequest
    {
        public int HeroId { get; set; }
        public int Level { get; set; }
        public List<DeleteBikeWallDto>? Walls { get; set; }
    }
}
