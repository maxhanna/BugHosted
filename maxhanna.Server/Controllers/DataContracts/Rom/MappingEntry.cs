namespace maxhanna.Server.Controllers.DataContracts.Rom
{
    public class MappingEntry
    {
        // 'button' or 'axis'
        public string? Type { get; set; }
        public int Index { get; set; }
        // optional: -1 or 1 for axis direction
        public int? AxisDir { get; set; }
        // gamepad index (gp.index)
        public int? GpIndex { get; set; }
    }
}
