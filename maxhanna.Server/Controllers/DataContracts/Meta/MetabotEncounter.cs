namespace maxhanna.Server.Controllers.DataContracts.Meta
{
    public class MetabotEncounter
    {
        public int HeroId { get; }
        public string Map { get; }
        public int CoordsX { get; }
        public int CoordsY { get; }
        public string BotTypes { get; }
        public int Level { get; }
        public int Hp { get; }
        public int HeadPartType { get; }
        public int LegsPartType { get; }
        public int LeftArmPartType { get; }
        public int RightArmPartType { get; }

        public MetabotEncounter(int heroId, string map, int coordsX, int coordsY, string botTypes,
                                int level, int hp, int headPart, int legsPart, int leftArm, int rightArm)
        {
            HeroId = heroId;
            Map = map;
            CoordsX = coordsX;
            CoordsY = coordsY;
            BotTypes = botTypes;
            Level = level;
            Hp = hp;
            HeadPartType = headPart;
            LegsPartType = legsPart;
            LeftArmPartType = leftArm;
            RightArmPartType = rightArm;
        }
    }
}
