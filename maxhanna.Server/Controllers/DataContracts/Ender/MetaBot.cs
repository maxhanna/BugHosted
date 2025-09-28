namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class MetaBot
    {
        public string? Name { get; set; }
        public int Id { get; set; }
        public int HeroId { get; set; }
        public int Type { get; set; }
        public int Hp { get; set; }
        public int Exp { get; set; }
        public int Level { get; set; }
        public Boolean IsDeployed { get; set; }
        public Vector2? Position { get; set; }
        public MetaBotPart? Head { get; set; }
        public MetaBotPart? Legs { get; set; }
        public MetaBotPart? LeftArm { get; set; }
        public MetaBotPart? RightArm { get; set; }
    }
}
