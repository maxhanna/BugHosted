public class UpdateApiKeyRequest
{
	public required int UserId { get; set; } 
	public required string ApiKey { get; set; } 
	public required string PrivateKey { get; set; } 
} 