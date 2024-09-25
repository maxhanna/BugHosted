using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
    public class VectorM
    {
        public int x { get; set; } 
        public int y { get; set; } 

        public VectorM(int x, int y)
        {
            this.x = x;
            this.y = y;
        }
    }
}
