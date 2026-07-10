using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    [JsonConverter(typeof(EventTitleConverter))]
    public class EventTitle
    {
        public string? English { get; set; }
    }

    public class EventTitleConverter : JsonConverter<EventTitle>
    {
        public override EventTitle? ReadJson(JsonReader reader, Type objectType, EventTitle? existingValue, bool hasExistingValue, JsonSerializer serializer)
        {
            if (reader.TokenType == JsonToken.String)
            {
                return new EventTitle { English = reader.Value?.ToString() };
            }
            if (reader.TokenType == JsonToken.StartObject)
            {
                var obj = JObject.Load(reader);
                return new EventTitle { English = obj["en"]?.ToString() };
            }
            return null;
        }

        public override void WriteJson(JsonWriter writer, EventTitle? value, JsonSerializer serializer)
        {
            if (value?.English != null)
            {
                writer.WriteValue(value.English);
            }
            else
            {
                writer.WriteNull();
            }
        }
    }
}
