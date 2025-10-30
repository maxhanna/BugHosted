namespace maxhanna.Server.Controllers
{
    // DTO for DeleteTownPortal endpoint
    public class DeleteTownPortalRequest
    {
        // Optional: delete a single portal by id
        public int? PortalId { get; set; }

        // Optional: delete all portals created by this hero
        public int? HeroId { get; set; }

        // Optional user id making the request (for auditing / auth if used)
        public int? UserId { get; set; }
    }
}
