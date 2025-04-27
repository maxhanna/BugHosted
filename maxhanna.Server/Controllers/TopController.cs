using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Topics;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using SixLabors.ImageSharp;
using System.Data;
using System.Diagnostics;
using System.Net;
using System.Xml.Linq;
using Xabe.FFmpeg;
using static maxhanna.Server.Controllers.AiController;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class TopController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly string _connectionString;
	 
		public TopController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";  
		}
 
		[HttpPost("/Top/GetTop/", Name = "GetTop")]
		public IActionResult GetTop([FromBody] User user, [FromQuery] string? inputFile)
		{
			string result = "";
			try
			{
				Process p = new Process();
				p.StartInfo.UseShellExecute = false;
				p.StartInfo.RedirectStandardOutput = true; 
				p.Start();
				result = p.StandardOutput.ReadToEnd();
				p.WaitForExit();
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while executing BAT file. " + ex.Message, null, "FILE", true);
				return StatusCode(500, "An error occurred while executing BAT file.");
			}
			return Ok(result);
		}
		    
	}
}
