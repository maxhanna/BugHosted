using maxhanna.Server.Controllers.DataContracts.Array;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
    [Route("[controller]")]
    public class ArrayController : ControllerBase
    {
        private readonly ILogger<ArrayController> _logger;
        private readonly IConfiguration _config;

        public ArrayController(ILogger<ArrayController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("/Array", Name = "GetArrayCharacter")]
        public async Task<IActionResult> Get([FromBody] User? user)
        {
            var heroUser = user ?? new User(0, "Anonymous");
            _logger.LogInformation($"POST /Array ({heroUser.Id})"); 
            return Ok(await GetHeroAsync(user)); 
        }

        [HttpGet("/Array/Players", Name = "GetAllArrayPlayerCharacters")]
        public async Task<IActionResult> GetPlayers()
        {
            _logger.LogInformation("GET /Array/Players");
            const string sql = @"
            SELECT 
                a.user_id, character_class, level, experience, position, monsters_killed, players_killed, items_found,
                u.username, udpfl.id as display_picture_file_id
            FROM 
                maxhanna.array_characters a
            LEFT JOIN 
                maxhanna.users u on u.id = a.user_id 
            LEFT JOIN
                maxhanna.user_display_pictures udp ON udp.user_id = u.id
            LEFT JOIN
                maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id
            ORDER BY 
                level DESC;";

            try
            {
                using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(sql, conn);
                using var rdr = await cmd.ExecuteReaderAsync();
                var characters = new List<ArrayCharacter>();

                while (await rdr.ReadAsync())
                {
                    int? displayPicId = rdr.IsDBNull(rdr.GetOrdinal("display_picture_file_id"))
                        ? null
                        : rdr.GetInt32(rdr.GetOrdinal("display_picture_file_id"));

                    var displayPic = displayPicId.HasValue ? new FileEntry { Id = displayPicId.Value } : null;

                    characters.Add(new ArrayCharacter(
                        user: new User(
                            id: rdr.IsDBNull(rdr.GetOrdinal("user_id")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("user_id")),
                            username: rdr.IsDBNull(rdr.GetOrdinal("username")) ? "Anonymous" : rdr.GetString(rdr.GetOrdinal("username")),
                            null,
                            displayPic,
                            null, null, null
                        ),
                        characterClass: rdr.IsDBNull(rdr.GetOrdinal("character_class")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("character_class")),
                        level: rdr.IsDBNull(rdr.GetOrdinal("level")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("level")),
                        experience: rdr.IsDBNull(rdr.GetOrdinal("experience")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("experience")),
                        position: rdr.IsDBNull(rdr.GetOrdinal("position")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("position")),
                        monstersKilled: rdr.IsDBNull(rdr.GetOrdinal("monsters_killed")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("monsters_killed")),
                        playersKilled: rdr.IsDBNull(rdr.GetOrdinal("players_killed")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("players_killed")),
                        itemsFound: rdr.IsDBNull(rdr.GetOrdinal("items_found")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("items_found"))
                    ));
                }

                return Ok(characters);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while retrieving Array characters.");
                return StatusCode(500, "An error occurred while retrieving Array characters.");
            }
        }

        [HttpPost("/Array/Move", Name = "Move")]
        public async Task<IActionResult> Move([FromBody] ArrayMoveRequest req)
        {
            _logger.LogInformation($"POST /Array/Move ({req.User?.Id ?? 0}, {req.Direction})"); 

            try
            {
                var hero = await GetHeroAsync(req.User);
                //_logger.LogInformation($"Current player level {hero.Level}, position : {hero.Position}");
                if (req.Direction.ToLower() == "left")
                {
                    hero.Position--; 
                } else if (req.Direction.ToLower() == "right")
                {
                    hero.Position++; 
                } 

                var opponents = await GetOpponentsAtPositionAsync(hero.Position, req.User);
                var winningOpponent = await UpdateHeroStats(hero, opponents);


                return Ok(winningOpponent ?? hero);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the move");
                return StatusCode(500, "An internal error occurred");
            }
        }

        [HttpPost("/Array/GetGraveyardHero", Name = "GetGraveyardHero")]
        public async Task<IActionResult> GetGraveyardHero([FromBody] User? user)
        {
            _logger.LogInformation($"POST /Array/GetGraveyardHero ({user?.Id})");
            const string sql = @"
                SELECT 
                    g.user_id as heroId, 
                    uu.username as user_username,
                    killer_id, 
                    uk.username as killer_username,
                    timestamp,
                    uudpfl.id as user_display_pic_id,
                    ukdpfl.id as killer_display_pic_id
                FROM 
                    maxhanna.array_characters_graveyard g
                LEFT JOIN 
                    maxhanna.users uu on uu.id = g.user_id
                LEFT JOIN
                    maxhanna.users uk on uk.id = killer_id  
                LEFT JOIN maxhanna.user_display_pictures uudp ON uu.id = uudp.user_id
                LEFT JOIN maxhanna.file_uploads uudpfl ON uudp.file_id = uudpfl.id
                LEFT JOIN maxhanna.user_display_pictures ukdp ON uk.id = ukdp.user_id
                LEFT JOIN maxhanna.file_uploads ukdpfl ON ukdp.file_id = ukdpfl.id
                WHERE 
                    g.user_id = @UserId;";
            try
            {
                using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", user?.Id ?? 0);

                using var rdr = await cmd.ExecuteReaderAsync();
                if (await rdr.ReadAsync())
                {
                    var user_id = rdr.IsDBNull(rdr.GetOrdinal("heroId")) ? 0 : rdr.GetInt32(rdr.GetOrdinal("heroId"));
                    var killer_id = rdr.IsDBNull(rdr.GetOrdinal("killer_id")) ? 0 : rdr.GetInt32(rdr.GetOrdinal("killer_id"));
                    var user_username = rdr.IsDBNull(rdr.GetOrdinal("user_username")) ? "Anonymous" : rdr.GetString(rdr.GetOrdinal("user_username"));
                    var killer_username = rdr.IsDBNull(rdr.GetOrdinal("killer_username")) ? "Anonymous" : rdr.GetString(rdr.GetOrdinal("killer_username"));
                    var timestamp = rdr.IsDBNull(rdr.GetOrdinal("timestamp")) ? DateTime.Now : rdr.GetDateTime(rdr.GetOrdinal("timestamp"));
                    FileEntry? userDisplayPicture = null;
                    if (!rdr.IsDBNull(rdr.GetOrdinal("user_display_pic_id")))
                    {
                        userDisplayPicture = new FileEntry
                        {
                            Id = rdr.GetInt32(rdr.GetOrdinal("user_display_pic_id"))
                        };
                    }
                    FileEntry? killerDisplayPicture = null;
                    if (!rdr.IsDBNull(rdr.GetOrdinal("killer_display_pic_id")))
                    {
                        killerDisplayPicture = new FileEntry
                        {
                            Id = rdr.GetInt32(rdr.GetOrdinal("killer_display_pic_id"))
                        };
                    }

                    var graveyardHero = new GraveyardHero();
                    graveyardHero.Hero = new User(user_id, user_username, null, userDisplayPicture, null, null, null);
                    graveyardHero.Killer = new User(killer_id, killer_username, null, killerDisplayPicture, null, null, null);
                    graveyardHero.Timestamp = timestamp;
                    return Ok(graveyardHero); 
                }
                return Ok(new GraveyardHero());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while getting graveyard data.");
                return StatusCode(500, "An error occurred while getting graveyard data.");
            }
        }

        [HttpPost("/Array/Resurrect", Name = "ResurrectCharacter")]
        public async Task<IActionResult> Resurect([FromBody] User? user)
        {
            _logger.LogInformation("GET /Array/Resurrect");
            const string sql = @"DELETE FROM maxhanna.array_characters_graveyard WHERE user_id = @UserId;";

            try
            {
                using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", user?.Id ?? 0);

                await cmd.ExecuteReaderAsync();

                return Ok(await GetHeroAsync(user));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while resurecting Array character.");
                return StatusCode(500, "An error occurred while resurecting Array character.");
            }
        }
        [HttpPost("/Array/GetInventory", Name = "GetInventory")]
        public async Task<IActionResult> GetInventory([FromBody] User? user)
        {
            _logger.LogInformation("GET /Array/GetInventory");
            const string sql = @"
                SELECT 
                    i.user_id, 
                    i.file_id, f.file_name, f.folder_path,
                    i.level, 
                    i.experience 
                FROM 
                    maxhanna.array_characters_inventory i
                LEFT JOIN 
                    maxhanna.file_uploads f ON f.id = i.file_id
                WHERE 
                    i.user_id = @UserId;"; 
            try
            {
                using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", user?.Id ?? 0);

                using var rdr = await cmd.ExecuteReaderAsync();
                ArrayCharacterInventory inventory = new ArrayCharacterInventory(user, []);
                while (await rdr.ReadAsync())
                {
                    if (!rdr.IsDBNull(rdr.GetOrdinal("user_id")))
                    {
                        var tmpFile = new FileEntry();
                        tmpFile.Id = rdr.IsDBNull(rdr.GetOrdinal("file_id")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("file_id"));
                        tmpFile.FileName = rdr.IsDBNull(rdr.GetOrdinal("file_name")) ? "" : rdr.GetString(rdr.GetOrdinal("file_name"));
                        tmpFile.Directory = rdr.IsDBNull(rdr.GetOrdinal("folder_path")) ? "" : rdr.GetString(rdr.GetOrdinal("folder_path"));


                        ArrayCharacterItem tmpItem = new ArrayCharacterItem(
                            new User(rdr.IsDBNull(rdr.GetOrdinal("user_id")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("user_id")), ""),
                            tmpFile,
                            rdr.IsDBNull(rdr.GetOrdinal("experience")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("experience")),
                            rdr.IsDBNull(rdr.GetOrdinal("level")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("level"))); 
                        inventory.Items.Add(tmpItem);
                    }
                }
                return Ok(inventory);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while getting Array character's items.");
                return StatusCode(500, "An error occurred while getting Array character's items.");
            }
        }
        private async Task<ArrayCharacter> GetHeroAsync(User? user)
        {
            var heroUser = user ?? new User(0, "Anonymous");
            string sql = @"
            SELECT 
                ac.user_id, 
                ac.character_class, 
                ac.level, 
                ac.experience, 
                ac.position, 
                ac.monsters_killed, 
                ac.players_killed, 
                ac.items_found, 
                u.username,
                udpfl.id as display_picture_file_id,
                udpfl.file_name as display_picture_filename
            FROM maxhanna.array_characters ac
            LEFT JOIN maxhanna.users u ON ac.user_id = u.id
            LEFT JOIN maxhanna.user_display_pictures udp ON u.id = udp.user_id
            LEFT JOIN maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id
            WHERE ac.user_id = @userId";

            using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
            await conn.OpenAsync();
            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@userId", heroUser.Id);
            using var rdr = await cmd.ExecuteReaderAsync();

            if (await rdr.ReadAsync())
            {
                FileEntry? displayPicture = null;
                if (!rdr.IsDBNull(rdr.GetOrdinal("display_picture_file_id")))
                {
                    displayPicture = new FileEntry
                    {
                        Id = rdr.GetInt32(rdr.GetOrdinal("display_picture_file_id")),
                        FileName = rdr.IsDBNull(rdr.GetOrdinal("display_picture_filename"))
                            ? null
                            : rdr.GetString(rdr.GetOrdinal("display_picture_filename"))
                    };
                } 

                return new ArrayCharacter(
                    user: heroUser,
                    characterClass: rdr.IsDBNull(rdr.GetOrdinal("character_class")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("character_class")),
                    level: rdr.IsDBNull(rdr.GetOrdinal("level")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("level")),
                    experience: rdr.IsDBNull(rdr.GetOrdinal("experience")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("experience")),
                    position: rdr.IsDBNull(rdr.GetOrdinal("position")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("position")),
                    monstersKilled: rdr.IsDBNull(rdr.GetOrdinal("monsters_killed")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("monsters_killed")),
                    playersKilled: rdr.IsDBNull(rdr.GetOrdinal("players_killed")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("players_killed")),
                    itemsFound: rdr.IsDBNull(rdr.GetOrdinal("items_found")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("items_found")) 
                );
            }
             
            return new ArrayCharacter(heroUser);
        }

        private async Task<List<ArrayCharacter>> GetOpponentsAtPositionAsync(long position, User? user)
        {
            User heroUser = user ?? new User(0, "Anonymous");
            //_logger.LogInformation($"GetOpponentsAtPositionAsync {position} , {heroUser.Id}");
            var opponents = new List<ArrayCharacter>();
            string sql = @"
            SELECT 
                ac.user_id, ac.character_class, ac.level, ac.experience, ac.position, 
                ac.monsters_killed, ac.players_killed, ac.items_found,
                u.username,
                udpfl.id as display_picture_file_id,
                udpfl.file_name as display_picture_filename
            FROM 
                maxhanna.array_characters ac
            LEFT JOIN 
                maxhanna.users u ON ac.user_id = u.id
            LEFT JOIN 
                maxhanna.user_display_pictures udp ON u.id = udp.user_id
            LEFT JOIN 
                maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id
            WHERE 
                ac.position = @position 
                AND ac.user_id != @userId";

            using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
            await conn.OpenAsync();
            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@position", position);
            cmd.Parameters.AddWithValue("@userId", heroUser.Id);
            //_logger.LogInformation(cmd.CommandText);
            using var rdr = await cmd.ExecuteReaderAsync();

            while (await rdr.ReadAsync())
            {
                FileEntry? displayPicture = null;
                if (!rdr.IsDBNull(rdr.GetOrdinal("display_picture_file_id")))
                {
                    displayPicture = new FileEntry
                    {
                        Id = rdr.GetInt32(rdr.GetOrdinal("display_picture_file_id")),
                        FileName = rdr.IsDBNull(rdr.GetOrdinal("display_picture_filename"))
                            ? null
                            : rdr.GetString(rdr.GetOrdinal("display_picture_filename"))
                    };
                }

                var opponentUser = new User(
                    id: rdr.IsDBNull(rdr.GetOrdinal("user_id")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("user_id")),
                    username: rdr.IsDBNull(rdr.GetOrdinal("username")) ? "Anonymous" : rdr.GetString(rdr.GetOrdinal("username")),
                    null,
                    displayPicture,
                    null, null, null
                );

                opponents.Add(new ArrayCharacter(
                    user: opponentUser,
                    characterClass: rdr.IsDBNull(rdr.GetOrdinal("character_class")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("character_class")),
                    level: rdr.IsDBNull(rdr.GetOrdinal("level")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("level")),
                    experience: rdr.IsDBNull(rdr.GetOrdinal("experience")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("experience")),
                    position: rdr.IsDBNull(rdr.GetOrdinal("position")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("position")),
                    monstersKilled: rdr.IsDBNull(rdr.GetOrdinal("monsters_killed")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("monsters_killed")),
                    playersKilled: rdr.IsDBNull(rdr.GetOrdinal("players_killed")) ? 0 : rdr.GetInt16(rdr.GetOrdinal("players_killed")),
                    itemsFound: rdr.IsDBNull(rdr.GetOrdinal("items_found")) ? 0 : rdr.GetInt64(rdr.GetOrdinal("items_found"))
                ));
            }

            //_logger.LogInformation($"Got {opponents.Count} opponents");
            return opponents;
        }

        private async Task<ArrayCharacter?> UpdateHeroStats(ArrayCharacter hero, List<ArrayCharacter> opponents)
        {
            if (opponents.Count > 0 && hero.Position % 50 != 0 && hero.Position != 0)
            {
                foreach (var opponent in opponents)
                {
                    if (hero.Level < opponent.Level)
                    {
                        _logger.LogInformation($"{hero.User.Id}'s hero has died to player {opponent.User.Id}"); 
                        hero.Experience = 0;
                        hero.Position = 0;
                        hero.MonstersKilled = 0;
                        hero.PlayersKilled = 0;
                        opponent.Level++;
                        opponent.PlayersKilled++;
                        await UpdateHeroInDatabaseAsync(hero);
                        await SendHeroToGraveyard(hero, opponent);
                        await UpdateHeroInDatabaseAsync(opponent);
                        await StealItemsFrom(opponent, hero);
                        return opponent;
                    }
                    else
                    {
                        _logger.LogInformation($"{hero.User.Id}'s hero has killed player {opponent.User.Id}");
                        hero.Experience += (hero.Position < 0 ? -hero.Position : hero.Position);
                        if (hero.Experience >= hero.Level)
                        {
                            hero.Experience = hero.Experience - hero.Level; 
                            hero.Level++;
                        }
                        hero.PlayersKilled++; 
                        opponent.Position = 0;
                        opponent.Experience = 0;
                        opponent.MonstersKilled = 0;
                        opponent.PlayersKilled = 0;
                        await UpdateHeroInDatabaseAsync(opponent);
                        await UpdateHeroInDatabaseAsync(hero);
                        await SendHeroToGraveyard(opponent, hero);
                        await StealItemsFrom(hero, opponent);
                        return opponent; 
                    }
                }
            }
            else
            {
                hero.Experience++;
                hero.Experience += (hero.Position < 0 ? -hero.Position : hero.Position);
                if (hero.Experience >= hero.Level)
                {
                    hero.Experience = hero.Experience - hero.Level;
                    hero.Level++;
                }
                hero.MonstersKilled++;
                await CheckIfItemFound(hero);
            }
            await UpdateHeroInDatabaseAsync(hero);
            return null;
        }

        private async Task CheckIfItemFound(ArrayCharacter hero)
        {
            int regularDropRate = 300;
            int randomNumber = new Random().Next(1, regularDropRate);
            if (randomNumber == (int)(regularDropRate / 2))
            {
                hero.ItemsFound++;
                await RollItem(hero, "Regular");
            }

            int magicDropRate = 2050;
            randomNumber = new Random().Next(1, magicDropRate);
            if (randomNumber == (int)(magicDropRate / 2))
            {
                hero.ItemsFound++;
                await RollItem(hero, "Magic");
            }

            int rareDropRate = 10750;
            randomNumber = new Random().Next(1, rareDropRate);
            if (randomNumber == (int)(rareDropRate / 2))
            {
                hero.ItemsFound++;
                await RollItem(hero, "Rare");
            }
        } 

        private async Task UpdateHeroInDatabaseAsync(ArrayCharacter hero)
        {
            string sql = @"
                INSERT INTO maxhanna.array_characters 
                (user_id, character_class, level, experience, position, monsters_killed, players_killed, items_found)
                VALUES (@UserId, @CharacterClass, @Level, @Experience, @Position, @MonstersKilled, @PlayersKilled, @ItemsFound)
                ON DUPLICATE KEY UPDATE
                character_class = VALUES(character_class),
                level = VALUES(level),
                experience = VALUES(experience),
                position = VALUES(position),
                monsters_killed = VALUES(monsters_killed),
                players_killed = VALUES(players_killed),
                items_found = VALUES(items_found)";

            using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();
            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@UserId", hero.User?.Id ?? 0);
            cmd.Parameters.AddWithValue("@CharacterClass", hero.CharacterClass);
            cmd.Parameters.AddWithValue("@Level", hero.Level);
            cmd.Parameters.AddWithValue("@Experience", hero.Experience);
            cmd.Parameters.AddWithValue("@Position", hero.Position);
            cmd.Parameters.AddWithValue("@MonstersKilled", hero.MonstersKilled);
            cmd.Parameters.AddWithValue("@PlayersKilled", hero.PlayersKilled);
            cmd.Parameters.AddWithValue("@ItemsFound", hero.ItemsFound);

            await cmd.ExecuteNonQueryAsync();
        }
        private async Task RollItem(ArrayCharacter hero, string Rarity)
        {
            _logger.LogInformation($"Rolling a {Rarity} item for {hero.User?.Id ?? 0}");
            List<int> foundItems = new List<int>();
            string sql = $@"
            SELECT 
                f.id 
            FROM 
                maxhanna.file_uploads f 
            WHERE 
                f.folder_path LIKE '%/Array/Items/Helmets/{Rarity}/'";

            using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
            await conn.OpenAsync();
            using var cmd = new MySqlCommand(sql, conn);

            //_logger.LogInformation(cmd.CommandText);
            using var rdr = await cmd.ExecuteReaderAsync();

            while (await rdr.ReadAsync())
            {
                if (!rdr.IsDBNull(rdr.GetOrdinal("id")))
                {
                    foundItems.Add(rdr.GetInt32("id"));
                }
            }
            await conn.CloseAsync();
            await conn.OpenAsync();

            int randomNumber = new Random().Next(1, foundItems.Count); 
            string addSql = @"
                    INSERT INTO maxhanna.array_characters_inventory
                        (user_id, file_id)
                    VALUES 
                        (@UserId, @FileId);";
            using var addCmd = new MySqlCommand(addSql, conn);
            addCmd.Parameters.AddWithValue("@UserId", hero.User?.Id ?? 0);
            addCmd.Parameters.AddWithValue("@FileId", foundItems[randomNumber]);

            await addCmd.ExecuteReaderAsync();
        }
        
        private async Task StealItemsFrom(ArrayCharacter stealer, ArrayCharacter victim)
        {
            string sql = @"
                UPDATE maxhanna.array_characters_inventory 
                SET user_id = @StealerId
                WHERE user_id = @VictimId;";

            using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();
            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@StealerId", stealer.User?.Id ?? 0);
            cmd.Parameters.AddWithValue("@VictimId", victim.User?.Id ?? 0);

            await cmd.ExecuteNonQueryAsync();
        } 

        private async Task SendHeroToGraveyard(ArrayCharacter hero, ArrayCharacter opponent)
        {
            string sql = @"
                INSERT INTO maxhanna.array_characters_graveyard 
                (user_id, killer_id)
                VALUES (@UserId, @KillerId)";

            using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();
            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@UserId", hero.User?.Id ?? 0);
            cmd.Parameters.AddWithValue("@KillerId", opponent.User?.Id ?? 0); 

            await cmd.ExecuteNonQueryAsync();
        }
    }
}
