using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.ComponentModel;
using System.Data;
using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.PortableExecutable;
using Xabe.FFmpeg;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class NexusController : ControllerBase
    {
        private readonly ILogger<NexusController> _logger;
        private readonly IConfiguration _config;

        public NexusController(ILogger<NexusController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("/Nexus", Name = "GetNexusData")]
        public async Task<IActionResult> Get([FromBody] User? user)
        {
            var heroUser = user ?? new User(0, "Anonymous");
            _logger.LogInformation($"POST /Array ({heroUser.Id})"); 
            return Ok(); 
        } 
    }
}
