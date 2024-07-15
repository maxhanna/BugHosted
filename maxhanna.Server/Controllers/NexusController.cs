using maxhanna.Server.Controllers.DataContracts.Users;
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

        [HttpPost("/Nexus", Name = "GetBaseData")]
        public async Task<IActionResult> GetBaseData([FromBody] User? user)
        { 
            _logger.LogInformation($"POST /Nexus ({user?.Id ?? 0})"); 

            return Ok(); 
        } 
    }
}
