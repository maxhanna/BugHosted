using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.ObjectModel;
using System;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;
using System.Net;
using static System.Runtime.InteropServices.JavaScript.JSType;
using System.Net.Mime;
using System.Text;
using maxhanna.Server.Controllers.Helpers;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using static maxhanna.Server.Controllers.Helpers.MiningApi;
using static System.Collections.Specialized.BitVector32;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class MiningController : ControllerBase
    {
        private readonly ILogger<MiningController> _logger;
        private readonly HttpClient _client;

        public MiningController(ILogger<MiningController> logger)
        {
            _logger = logger;
            HttpClientHandler handler = new HttpClientHandler
            {
                AutomaticDecompression = DecompressionMethods.All
            };

            _client = new HttpClient();
        }

        [HttpGet("/Mining/", Name = "GetMiningRigInfo")]
        public async Task<Collection<MiningRig>> GetRigs()
        {
            _logger.LogInformation("GET /Mining/");
            Collection<MiningRig> rigs = new Collection<MiningRig>();

            try
            {
                var res = new MiningApi().get("/main/api/v2/mining/rigs2", true);
                JsonDocument jsonDoc = JsonDocument.Parse(res);
                JsonElement miningRigs;
                _logger.LogInformation("Connected to Nicehash :");
                if (jsonDoc.RootElement.TryGetProperty("miningRigs", out miningRigs) && miningRigs.ValueKind == JsonValueKind.Array)
                {
                    foreach (JsonElement rigElement in miningRigs.EnumerateArray())
                    {
                        MiningRig tmpRig = new MiningRig();
                        tmpRig.rigId = rigElement.GetProperty("rigId").GetString()!;
                        tmpRig.minerStatus = rigElement.GetProperty("minerStatus").GetString()!;
                        tmpRig.unpaidAmount = float.Parse(rigElement.GetProperty("unpaidAmount").GetString()!);


                        if (rigElement.TryGetProperty("v4", out JsonElement v4Element) && v4Element.ValueKind == JsonValueKind.Object)
                        {
                            tmpRig.rigName = v4Element.GetProperty("mmv").GetProperty("workerName").GetString()!;
                        }
                        if (rigElement.TryGetProperty("stats", out JsonElement statsElement) && statsElement.ValueKind == JsonValueKind.Object)
                        {
                            if (float.Parse(statsElement.GetProperty("speedRejectedTotal").GetString()!) > 0)
                            {
                                tmpRig.speedRejected = float.Parse(statsElement.GetProperty("speedRejectedTotal").GetString()!);
                            }
                        }
                        rigs.Add(tmpRig);
                    }
                    _logger.LogInformation("Found mining rig data");
                }
                return rigs;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred");

                // Return an error response
                return rigs;
            }
        }

        [HttpGet("/Mining/Devices", Name = "GetMiningDeviceInfo")]
        public async Task<Collection<MiningRigDevice>> GetDevices()
        {
            _logger.LogInformation("GET /Mining/devices");
            Collection<MiningRigDevice> devices = new Collection<MiningRigDevice>();

            try
            {
                var res = new MiningApi().get("/main/api/v2/mining/rigs2", true);
                JsonDocument jsonDoc = JsonDocument.Parse(res);
                JsonElement miningRigs;
                _logger.LogInformation("Connected to Nicehash :");
                if (jsonDoc.RootElement.TryGetProperty("miningRigs", out miningRigs) && miningRigs.ValueKind == JsonValueKind.Array)
                {
                    foreach (JsonElement rigElement in miningRigs.EnumerateArray())
                    {
                        string rigId = rigElement.GetProperty("rigId").GetString()!;

                        if (rigElement.TryGetProperty("v4", out JsonElement v4Element) && v4Element.ValueKind == JsonValueKind.Object)
                        {
                            string rigName = v4Element.GetProperty("mmv").GetProperty("workerName").GetString()!;
                            if (v4Element.TryGetProperty("devices", out JsonElement devicesElement) && devicesElement.ValueKind == JsonValueKind.Array)
                            {
                                foreach (JsonElement deviceElement in devicesElement.EnumerateArray())
                                {
                                    MiningRigDevice tmpDevice = new MiningRigDevice();
                                    tmpDevice.rigId = rigId;
                                    tmpDevice.rigName = rigName;
                                    tmpDevice.deviceName = deviceElement.GetProperty("dsv").GetProperty("name").GetString()!;
                                    tmpDevice.deviceId = deviceElement.GetProperty("dsv").GetProperty("id").GetString()!;
                                    JsonElement mdvElement = deviceElement.GetProperty("mdv");
                                    tmpDevice.state = mdvElement.GetProperty("state").GetInt32();
                                    JsonElement tmpAlgorithmSpeedElements = mdvElement.GetProperty("algorithmsSpeed");
                                    foreach (JsonElement tmpAlgorithmSpeedElement in tmpAlgorithmSpeedElements.EnumerateArray())
                                    {
                                        tmpDevice.speed = tmpAlgorithmSpeedElement.GetProperty("speed").GetSingle();
                                        break;
                                    }
                                    JsonElement odvElement = deviceElement.GetProperty("odv");
                                    foreach (JsonElement odvItem in odvElement.EnumerateArray())
                                    {
                                        string key = odvItem.GetProperty("key").GetString()!;
                                        switch (key)
                                        {
                                            case "Temperature":
                                                tmpDevice.temperature = float.Parse(odvItem.GetProperty("value").GetString()!);
                                                break;
                                            case "Fan speed":
                                                if (odvItem.GetProperty("unit").GetString() == "%")
                                                {
                                                    tmpDevice.fanSpeed = float.Parse(odvItem.GetProperty("value").GetString()!);
                                                }
                                                else if (odvItem.GetProperty("unit").GetString() == "RPM")
                                                {
                                                    tmpDevice.fanSpeedRPM = float.Parse(odvItem.GetProperty("value").GetString()!);
                                                }
                                                break;
                                            case "Power usage":
                                                tmpDevice.power = float.Parse(odvItem.GetProperty("value").GetString()!);
                                                break;
                                            case "Core clock":
                                                tmpDevice.coreClock = float.Parse(odvItem.GetProperty("value").GetString()!);
                                                break;
                                            case "Memory clock":
                                                tmpDevice.memoryClock = float.Parse(odvItem.GetProperty("value").GetString()!);
                                                break;
                                            case "Core voltage":
                                                tmpDevice.coreVoltage = float.Parse(odvItem.GetProperty("value").GetString()!);
                                                break;
                                            case "Power Limit":
                                                if (odvItem.GetProperty("unit").GetString() == "%")
                                                {
                                                    tmpDevice.powerLimitPercentage = float.Parse(odvItem.GetProperty("value").GetString()!);
                                                }
                                                else if (odvItem.GetProperty("unit").GetString() == "W")
                                                {
                                                    tmpDevice.powerLimitWatts = float.Parse(odvItem.GetProperty("value").GetString()!);
                                                }
                                                break;
                                            case "Miner":
                                                tmpDevice.miner = odvItem.GetProperty("value").GetString();
                                                break;
                                            default:
                                                // Handle other keys if necessary
                                                break;
                                        }
                                    }

                                    devices.Add(tmpDevice);
                                }
                            }
                        }
                    }
                    _logger.LogInformation("Found mining rig device data");
                }
                return devices;

            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred");

                // Return an error response
                return devices;
            }
        }

        [HttpPost("/Mining/{rigId}/{deviceId?}", Name = "PostStatusUpdate")]
        public IActionResult PostStatusUpdate(string rigId, string? deviceId, [FromBody] string status)
        {
            _logger.LogInformation($"POST /Mining/{rigId}/{deviceId}");
            try
            {
                JObject payload = new JObject();
                payload.Add(new JProperty("rigId", rigId));
                if (!string.IsNullOrEmpty(deviceId))
                {
                    payload.Add(new JProperty("deviceId", deviceId));
                }
                payload.Add(new JProperty("action", status));

                var res = new MiningApi().post("/main/api/v2/mining/rigs/status2", JsonConvert.SerializeObject(payload), true);
                return Ok(res);
            }
            catch (Exception e)
            {
                return BadRequest(e);
            }
        }
    }
}
