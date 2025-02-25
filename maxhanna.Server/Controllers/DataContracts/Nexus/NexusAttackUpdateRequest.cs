using MySqlConnector;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusAttackUpdateRequest
	{
		public MySqlConnection Connection { get; set; } = null!;
		public MySqlTransaction Transaction { get; set; } = null!;
		public NexusBase Nexus { get; set; } = null!;
		public int AttackId { get; set; } = 0;
	}

}
