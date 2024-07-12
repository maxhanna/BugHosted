namespace maxhanna.Server.Controllers.DataContracts
{
    public class ArrayCharacter
    {
        public User User { get; set; }
        public int CharacterClass { get; set; }
        public long Level { get; set; }
        public long Experience { get; set; }
        public long Position { get; set; }
        public long MonstersKilled { get; set; }
        public int PlayersKilled { get; set; }
        public long ItemsFound { get; set; }

        public ArrayCharacter(User user, int characterClass, long level, long experience, long position, long monstersKilled, int playersKilled, long itemsFound)
        {
            User = user;
            CharacterClass = characterClass;
            Level = level;
            Experience = experience;
            Position = position;
            MonstersKilled = monstersKilled;
            PlayersKilled = playersKilled;
            ItemsFound = itemsFound;
        }
        public ArrayCharacter(User user)
        {
            User = user;
        }
    }
}