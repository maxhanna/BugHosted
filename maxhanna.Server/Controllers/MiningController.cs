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

        [HttpGet("", Name = "GetMiningRigInfo")]
        public async Task<string> Get()
        {
            _logger.LogInformation("GET /Mining/");
            try
            {
                return new MiningApi().get("/main/api/v2/mining/rigs2", true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred");

                // Return an error response
                return "Internal server error";
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
    }
}
