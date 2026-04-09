namespace maxhanna.Server.Controllers.DataContracts
{
    public class DeleteShareRequestPayload
    {
        public int SharerUserId { get; set; }
        public int TargetUserId { get; set; }
        public int RomFileId { get; set; }
    }
}
