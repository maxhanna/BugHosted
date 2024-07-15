namespace maxhanna.Server.Controllers.DataContracts.Array
{
    public class ArrayCharacterItem
    {
        public User? User { get; set; }
        public FileEntry File { get; set; }
        public long Level { get; set; }
        public long Experience { get; set; }

        public ArrayCharacterItem(User user, FileEntry file, long level, long experience)
        {
            User = user;
            File = file;
            Level = level;
            Experience = experience;
        }

    }
}