using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Linq;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class ArtController : ControllerBase
    {
        public class ArtPiece
        {
            public int Id { get; set; }
            public string Title { get; set; } = "";
            public string ImageUrl { get; set; } = "";
            public string Username { get; set; } = "";
        }

        private static List<ArtPiece> ArtDb = new List<ArtPiece>
        {
            new ArtPiece { Id = 1, Title = "Sunset", ImageUrl = "/assets/art/sunset.jpg", Username = "Alice" },
            new ArtPiece { Id = 2, Title = "Mountains", ImageUrl = "/assets/art/mountains.jpg", Username = "Bob" }
        };

        [HttpGet("GetAll")]
        public IActionResult GetAll()
        {
            return Ok(ArtDb);
        }

        [HttpPost("EditSource")]
        public IActionResult EditSource(int id, string username)
        {
            var art = ArtDb.FirstOrDefault(a => a.Id == id);
            if (art == null) return NotFound();
            art.Username = username;
            return Ok(art);
        }
    }
}
