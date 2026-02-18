using FirebaseAdmin.Messaging;
using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Topics;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Social; // Polls
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using SixLabors.ImageSharp;
using System.Data;
using System.Diagnostics;
using System.Net;
using System.Xml.Linq;
using Xabe.FFmpeg;
using System.Text.RegularExpressions;

namespace maxhanna.Server.Controllers
{
  [ApiController]
  [Route("[controller]")]
  public class FileController : ControllerBase
  {
    private readonly Log _log;
    private readonly IConfiguration _config;
    private readonly string _connectionString;
    private readonly string _baseTarget = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/";
    private readonly string _logo = "https://www.bughosted.com/assets/logo.jpg";
    private readonly HashSet<string> romExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "sgx", "vb", "ws", "wsc", "gba", "gbc", "gb",
        "gen", "md", "smd", "32x", "sms", "gg",
        "nes", "fds", "sfc", "smc", "snes", "nds",
        "z64", "n64", "v64", "bin", "zip"
    };

    public FileController(Log log, IConfiguration config)
    {
      _log = log;
      _config = config;
      _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      FFmpeg.SetExecutablesPath("E:\\ffmpeg-latest-win64-static\\bin");
    }

    [HttpPost("/File/GetDirectory/", Name = "GetDirectory")]
    public async Task<DirectoryResults?> GetDirectory(
    [FromBody] User? user,
    [FromQuery] string? directory,
    [FromQuery] string? visibility,
    [FromQuery] string? ownership,
    [FromQuery] string? search,
    [FromQuery] int page = 1,
    [FromQuery] int pageSize = 10,
    [FromQuery] int? fileId = null,
    [FromQuery] List<string>? fileType = null,
    [FromQuery] bool showHidden = false,
    [FromQuery] string sortOption = "Latest",
    [FromQuery] bool showFavouritesOnly = false)
    {
      if (string.IsNullOrEmpty(directory))
      {
        directory = _baseTarget;
      }
      else
      {
        directory = Path.Combine(_baseTarget, WebUtility.UrlDecode(directory));
        if (!directory.EndsWith("/"))
        {
          directory += "/";
        }
      }
      if (!ValidatePath(directory!))
      {
        _ = _log.Db($"Directory invalid : {directory}", null, "FILE", true);
        return null;
      }
      int totalCount = 0;
      try
      {
        List<FileEntry> fileEntries = new List<FileEntry>();
        // Normalize fileType query values: callers may pass repeated fileType=params or a single comma-separated value.
        var normalizedFileTypes = new List<string>();
        if (fileType != null && fileType.Any())
        {
          foreach (var ft in fileType)
          {
            if (string.IsNullOrWhiteSpace(ft)) continue;
            var parts = ft.Split(',', StringSplitOptions.RemoveEmptyEntries);
            foreach (var p in parts)
            {
              var v = p.Trim();
              if (!string.IsNullOrEmpty(v)) normalizedFileTypes.Add(v);
            }
          }
        }

        string fileTypeCondition = string.Empty;
        if (normalizedFileTypes.Any())
        {
          // sanitize and lower the file type values for SQL IN clause
          var sanitized = normalizedFileTypes.Select(ft => "'" + (ft ?? string.Empty).ToLower().Replace("'", "''") + "'").ToArray();
          var replaced = string.Join(",", sanitized);
          fileTypeCondition = " AND LOWER(f.file_type) IN (" + replaced + ") ";
        }
        string fileIdCondition = fileId.HasValue ? " AND f.id = @fileId" : "";
        bool isRomSearch = DetermineIfRomSearch(normalizedFileTypes);
        string visibilityCondition = string.IsNullOrEmpty(visibility) || visibility.ToLower() == "all" ? "" : visibility.ToLower() == "public" ? " AND f.is_public = 1 " : " AND f.is_public = 0 ";
        string ownershipCondition = string.IsNullOrEmpty(ownership) || ownership.ToLower() == "all" ? "" : ownership.ToLower() == "others" ? " AND f.user_id != @userId " : " AND f.user_id = @userId ";
        // Unified hidden condition: allow all if explicit showHidden or user setting show_hidden_files = 1, else filter out hidden
        string hiddenCondition = @"
          AND (
            @showHidden = 1
            OR EXISTS (SELECT 1 FROM maxhanna.user_settings us WHERE us.user_id = @userId AND us.show_hidden_files = 1)
            OR f.id NOT IN (SELECT file_id FROM maxhanna.hidden_files WHERE user_id = @userId)
          )";
        string favouritesCondition = showFavouritesOnly
          ? " AND f.id IN (SELECT file_id FROM file_favourites WHERE user_id = @userId) "
          : "";
        string orderBy = "";
        switch (sortOption)
        {
          case "Latest":
            orderBy = "ORDER BY date DESC";
            break;
          case "Oldest":
            orderBy = "ORDER BY date ASC";
            break;
          case "Random":
            orderBy = "ORDER BY RAND()";
            break;
          case "Most Views":
            orderBy = "ORDER BY access_count DESC";
            break;
          case "Filesize ASC":
            orderBy = "ORDER BY file_size ASC";
            break;
          case "Filesize DESC":
            orderBy = "ORDER BY file_size DESC";
            break;
          case "Last Updated ASC":
            orderBy = "ORDER BY f.last_updated ASC";
            break;
          case "Last Updated DESC":
            orderBy = "ORDER BY f.last_updated DESC";
            break;
          case "Most Comments":
            orderBy = "ORDER BY comment_count DESC";
            break;
          case "A-Z":
            orderBy = "ORDER BY given_file_name ASC, file_name ASC";
            break;
          case "Z-A":
            orderBy = "ORDER BY given_file_name DESC, file_name DESC";
            break;

        }
        int offset = (page - 1) * pageSize;
        using (var connection = new MySqlConnection(_connectionString))
        {
          connection.Open();
          int filePosition = 0;
          if (fileId.HasValue && page == 1)
          {
            // Get the directory path for the file
            var directoryCommand = new MySqlCommand(
                 "SELECT folder_path FROM maxhanna.file_uploads WHERE id = @fileId",
                 connection);
            directoryCommand.Parameters.AddWithValue("@fileId", fileId.Value);
            var directoryReader = directoryCommand.ExecuteReader();

            if (directoryReader.Read())
            {
              directory = directoryReader.GetString("folder_path");
            }
            directoryReader.Close();
            (string where, List<MySqlParameter> list) = await GetWhereCondition(search, user);

            // Get the exact position of the file in the sorted results
            var positionCommand = new MySqlCommand(
          $@"SELECT COUNT(*) FROM (
            SELECT f.id, ROW_NUMBER() OVER (
              {(isRomSearch ? "ORDER BY f.last_access DESC" : (!string.IsNullOrEmpty(search) ? "ORDER BY MATCH(f.file_name, f.description, f.given_file_name) AGAINST(@FullTextSearch IN NATURAL LANGUAGE MODE) DESC" : "ORDER BY f.id DESC"))}
            ) as pos
          FROM maxhanna.file_uploads f
          LEFT JOIN maxhanna.users u ON f.user_id = u.id
          LEFT JOIN maxhanna.users uu ON f.last_updated_by_user_id = uu.id
          LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
          LEFT JOIN maxhanna.user_display_pictures luudp ON luudp.user_id = uu.id
          LEFT JOIN maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id
          WHERE 
              {(!string.IsNullOrEmpty(search) ? "" : "f.folder_path = @folderPath AND ")}
              (
                  f.is_public = 1
                  OR f.user_id = @userId
                  OR FIND_IN_SET(@userId, f.shared_with) > 0
              )
              {fileTypeCondition} 
              {visibilityCondition} 
              {ownershipCondition} 
              {hiddenCondition}
							{favouritesCondition}
							{fileIdCondition}
                            {where}
							) AS numbered_results
							WHERE id >= @fileId",  // For DESC order we use >=
                connection);

            positionCommand.Parameters.AddWithValue("@folderPath", directory);
            positionCommand.Parameters.AddWithValue("@fileId", fileId.Value);
            positionCommand.Parameters.AddWithValue("@userId", user?.Id ?? 0);
            positionCommand.Parameters.AddWithValue("@showHidden", showHidden ? 1 : 0);
            foreach (var param in list)
            {
              positionCommand.Parameters.Add(param);
            }

            filePosition = Convert.ToInt32(positionCommand.ExecuteScalar());

            // Calculate page with the file centered when possible
            page = (int)Math.Ceiling((double)filePosition / pageSize);

            // Calculate offset to center the file in the page
            int desiredPositionInPage = pageSize / 2;
            offset = Math.Max(0, filePosition - desiredPositionInPage - 1);

            // Ensure we don't go past the total count
            // When fileId is specified, include the fileId condition/parameter in the count so totalCount reflects the filtered result
            var whereTupleForCount = await GetWhereCondition(search, user);
            var searchCondForCount = whereTupleForCount.Item1;
            var extraParamsForCount = whereTupleForCount.Item2;
            if (fileId.HasValue)
            {
              extraParamsForCount.Add(new MySqlParameter("@fileId", fileId.Value));
              totalCount = GetResultCount(user, directory, search, favouritesCondition, fileTypeCondition + fileIdCondition,
                visibilityCondition, ownershipCondition, hiddenCondition,
                connection, searchCondForCount, extraParamsForCount);
            }
            else
            {
              totalCount = GetResultCount(user, directory, search, favouritesCondition, fileTypeCondition,
                visibilityCondition, ownershipCondition, hiddenCondition,
                connection, searchCondForCount, extraParamsForCount);
            }

            if (offset + pageSize > totalCount)
            {
              offset = Math.Max(0, totalCount - pageSize);
            }
          }

          // When searching, prefer ordering by relevance (MATCH...AGAINST) so nearest matches appear first
          if (!string.IsNullOrWhiteSpace(search))
          {
            orderBy = "ORDER BY MATCH(f.file_name, f.description, f.given_file_name) AGAINST(@FullTextSearch IN NATURAL LANGUAGE MODE) DESC, date DESC";
          }
          else
          {
            orderBy = isRomSearch ? " ORDER BY f.last_access DESC " : orderBy;
          }
          (string searchCondition, List<MySqlParameter> extraParameters) = await GetWhereCondition(search, user);

          var command = new MySqlCommand($@"
          SELECT 
            f.id AS fileId,
            f.file_name,
            f.folder_path,
            f.is_public,
            f.is_folder,
            f.user_id AS fileUserId,
            u.username AS fileUsername,
            udpfl.id AS fileUserDisplayPictureFileId,
            udpfl.file_name AS fileUserDisplayPictureFileName,
            udpfl.folder_path AS fileUserDisplayPictureFolderPath,
            f.shared_with,
            f.upload_date AS date,
            f.given_file_name,
            f.description,
            f.last_updated AS file_data_updated,
            f.last_updated_by_user_id AS last_updated_by_user_id,
            uu.username AS last_updated_by_user_name,
            luudp.file_id AS last_updated_by_user_name_display_picture_file_id,
            f.file_type AS file_type,
            f.file_size AS file_size,
            f.width AS width,
            f.height AS height,
            f.last_access AS last_access,
          f.access_count AS access_count,
          (SELECT COUNT(*) FROM file_favourites ff WHERE ff.file_id = f.id) AS favourite_count,
          (EXISTS(SELECT 1 FROM file_favourites ff2 WHERE ff2.file_id = f.id AND ff2.user_id = @userId)) AS is_favourited,
            COUNT(c.id) AS comment_count
        FROM
            maxhanna.file_uploads f 
        LEFT JOIN
            maxhanna.users u ON f.user_id = u.id
        LEFT JOIN
            maxhanna.users uu ON f.last_updated_by_user_id = uu.id
        LEFT JOIN
            maxhanna.user_display_pictures udp ON udp.user_id = u.id
        LEFT JOIN
            maxhanna.user_display_pictures luudp ON luudp.user_id = uu.id
        LEFT JOIN
            maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id 
        LEFT JOIN
            maxhanna.comments c ON f.id = c.file_id
        WHERE
            {(!string.IsNullOrEmpty(search) ? "" : "f.folder_path = @folderPath AND ")}
            (
                f.is_public = 1
                OR f.user_id = @userId
                OR FIND_IN_SET(@userId, f.shared_with) > 0
            )
            {searchCondition} 
            {fileTypeCondition} 
            {visibilityCondition} 
            {ownershipCondition} 
            {hiddenCondition} 
            {favouritesCondition}
            {fileIdCondition} 
        GROUP BY
            f.id,
            f.file_name,
            f.folder_path,
            f.is_public,
            f.is_folder,
            f.user_id,
            u.username,
            udpfl.id,
            udpfl.file_name,
            udpfl.folder_path,
            f.shared_with,
            f.upload_date,
            f.given_file_name,
            f.description,
            f.last_updated,
            f.last_updated_by_user_id,
            uu.username,
            luudp.file_id,
            f.file_type,
            f.file_size,
            f.width,
            f.height,
            f.last_access,
          f.access_count
        {orderBy}
        LIMIT
    @pageSize OFFSET @offset;"
          , connection);

          foreach (var param in extraParameters)
          {
            command.Parameters.Add(param);
          }
          command.Parameters.AddWithValue("@folderPath", directory);
          command.Parameters.AddWithValue("@userId", user?.Id ?? 0);
          command.Parameters.AddWithValue("@showHidden", showHidden ? 1 : 0);
          command.Parameters.AddWithValue("@pageSize", pageSize);
          command.Parameters.AddWithValue("@offset", offset);
          if (fileId.HasValue)
          {
            command.Parameters.AddWithValue("@fileId", fileId.Value);
          }
          if (!string.IsNullOrEmpty(search))
          {
            command.Parameters.AddWithValue("@search", "%" + search + "%");
          }

          // Console.WriteLine($"fileId {fileId}, offset {offset}, pageSize {pageSize}, page {page}, folder path {directory}. command: " + command.CommandText);

          // 	var diag = $"GetDirectory: fileId={fileId}, filePosition={filePosition}, offset={offset}, pageSize={pageSize}, page={page}, folderPath={directory}, totalCount={totalCount}, search={(string.IsNullOrEmpty(search) ? "" : search)}, visibility={(string.IsNullOrEmpty(visibility) ? "" : visibility)}, ownership={(string.IsNullOrEmpty(ownership) ? "" : ownership)}, fileTypeCondition={fileTypeCondition}, visibilityCondition={visibilityCondition}, ownershipCondition={ownershipCondition}, hiddenCondition={hiddenCondition}, favouritesCondition={favouritesCondition}";
          // 	_ = _log.Db(diag, null, "FILE", true);

          using (var reader = command.ExecuteReader())
          {
            while (reader.Read())
            {
              var fileIdValue = reader.IsDBNull("fileId") ? 0 : reader.GetInt32("fileId");

              var fileEntry = new FileEntry
              {
                Id = fileIdValue,
                FileName = reader.IsDBNull("file_name") ? "" : reader.GetString("file_name"),
                Directory = reader.IsDBNull("folder_path") ? "" : reader.GetString("folder_path"),
                Visibility = (reader.IsDBNull("is_public") ? true : reader.GetBoolean("is_public")) ? "Public" : "Private",
                IsFolder = reader.IsDBNull("is_folder") ? false : reader.GetBoolean("is_folder"),
                User = new User(
                  reader.IsDBNull("fileUserId") ? 0 : reader.GetInt32("fileUserId"),
                  reader.IsDBNull("fileUsername") ? "" : reader.GetString("fileUsername"),
                  new FileEntry
                  {
                    Id = reader.IsDBNull("fileUserDisplayPictureFileId") ? 0 : reader.GetInt32("fileUserDisplayPictureFileId"),
                    FileName = reader.IsDBNull("fileUserDisplayPictureFileName") ? null : reader.GetString("fileUserDisplayPictureFileName"),
                    Directory = reader.IsDBNull("fileUserDisplayPictureFolderPath") ? null : reader.GetString("fileUserDisplayPictureFolderPath")
                  }
                ),
                SharedWith = reader.IsDBNull("shared_with") ? "" : reader.GetString("shared_with"),
                Date = reader.IsDBNull("date") ? DateTime.Now : reader.GetDateTime("date"),
                GivenFileName = reader.IsDBNull("given_file_name") ? null : reader.GetString("given_file_name"),
                LastUpdated = reader.IsDBNull("file_data_updated") ? (DateTime?)null : reader.GetDateTime("file_data_updated"),
                LastUpdatedUserId = reader.IsDBNull("last_updated_by_user_id") ? 0 : reader.GetInt32("last_updated_by_user_id"),
                Description = reader.IsDBNull("description") ? null : reader.GetString("description"),
                LastUpdatedBy = new User(
                      reader.IsDBNull("last_updated_by_user_id") ? 0 : reader.GetInt32("last_updated_by_user_id"),
                      reader.IsDBNull("last_updated_by_user_name") ? "Anonymous" : reader.GetString("last_updated_by_user_name"),
                      new FileEntry
                      {
                        Id = reader.IsDBNull("last_updated_by_user_name_display_picture_file_id") ? 0 : reader.GetInt32("last_updated_by_user_name_display_picture_file_id")
                      }),
                FileType = reader.IsDBNull("file_type") ? "" : reader.GetString("file_type"),
                FileSize = reader.IsDBNull("file_size") ? 0 : reader.GetInt32("file_size"),
                Width = reader.IsDBNull("width") ? null : reader.GetInt32("width"),
                Height = reader.IsDBNull("height") ? null : reader.GetInt32("height"),
                LastAccess = reader.IsDBNull("last_access") ? null : reader.GetDateTime("last_access"),
                AccessCount = reader.IsDBNull("access_count") ? 0 : reader.GetInt32("access_count"),
                FavouriteCount = reader.IsDBNull("favourite_count") ? 0 : reader.GetInt32("favourite_count"),
                IsFavourited = reader.IsDBNull("is_favourited") ? false : reader.GetBoolean("is_favourited"),
              };

              fileEntries.Add(fileEntry);
            }
          }

          // Rest of the method remains the same...
          var fileIds = fileEntries.Select(f => f.Id).ToList();
          var commentIds = new List<int>();
          var fileIdsParameters = new List<string>();
          for (int i = 0; i < fileIds.Count; i++)
          {
            fileIdsParameters.Add($"@fileId{i}");
          }

          GetFileComments(fileEntries, connection, fileIds, commentIds, fileIdsParameters);

          // Attach polls to file entry comments (mirrors SocialController poll attachment)
          await FetchAndAttachPollVotesToFileComments(fileEntries);

          var commentIdsParameters = new List<string>();
          for (int i = 0; i < commentIds.Count; i++)
          {
            commentIdsParameters.Add($"@commentId{i}");
          }

          GetFileReactions(fileEntries, connection, fileIds, commentIds, fileIdsParameters, commentIdsParameters);
          GetFileTopics(fileEntries, connection, fileIds);

          var fileTypeCondForCount = fileId.HasValue
              ? fileTypeCondition + fileIdCondition   // append ' AND f.id = @fileId '
              : fileTypeCondition;

          DirectoryResults result = GetDirectoryResults(
              user, directory, search, page, pageSize, fileEntries,
              favouritesCondition, fileTypeCondForCount, // <-- use the combined condition
              visibilityCondition, ownershipCondition, hiddenCondition,
              connection, searchCondition, extraParameters, fileId);

          return result;
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"error:{ex}", null, "FILE", true);
        return null;
      }
    }

    [HttpPost("/File/GetFavouritedBy", Name = "GetFavouritedBy")]
    public IActionResult GetFavouritedBy([FromBody] int fileId)
    {
      try
      {
        using var connection = new MySqlConnection(_connectionString);
        connection.Open();
        var cmd = new MySqlCommand(@"SELECT u.id, u.username, udp.file_id AS displayPictureFileId
					FROM file_favourites ff
					JOIN users u ON ff.user_id = u.id
					LEFT JOIN user_display_pictures udp ON udp.user_id = u.id
					WHERE ff.file_id = @fileId", connection);
        cmd.Parameters.AddWithValue("@fileId", fileId);
        var list = new List<object>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
          list.Add(
            new User(
              reader.GetInt32("id"),
              reader.IsDBNull("username") ? "" : reader.GetString("username"),
              reader.IsDBNull("displayPictureFileId") ? null : new FileEntry(reader.GetInt32("displayPictureFileId")
            )
          ));
        }
        return Ok(list);
      }
      catch (Exception ex)
      {
        _ = _log.Db($"error:{ex}", null, "FILE", true);
        return StatusCode(500, ex.Message);
      }
    }
    private static void GetFileComments(List<FileEntry> fileEntries, MySqlConnection connection, List<int> fileIds, List<int> commentIds, List<string> fileIdsParameters)
    {
      if (!fileIdsParameters.Any())
        return;

      var commentsCommand = new MySqlCommand($@"
				WITH RECURSIVE comment_tree (id) AS (
				SELECT id
				FROM maxhanna.comments
				WHERE file_id IN ({string.Join(", ", fileIdsParameters)})
				UNION ALL
				SELECT c.id
				FROM maxhanna.comments c
				JOIN comment_tree ct ON c.comment_id = ct.id
				)
				SELECT 
					fc.id AS commentId,
					fc.file_id AS commentFileId,
					fc.user_id AS commentUserId,
					fc.date AS commentDate,
					fc.city AS commentCity,
					fc.country AS commentCountry,
					fc.ip AS commentIp,
					fc.comment_id as comment_parent_id,
					uc.username AS commentUsername,
					ucudp.tag_background_file_id AS commentUserProfileBackgroundPicId,
					ucudpfu.id AS commentUserDisplayPicId,
					ucudpfu.file_name AS commentUserDisplayPicFileName,
					ucudpfu.folder_path AS commentUserDisplayPicFolderPath,
					fc.comment AS commentText,
					cf.file_id AS commentFileEntryId,
					cf2.file_name AS commentFileEntryName,
					cf2.folder_path AS commentFileEntryFolderPath,
					cf2.is_public AS commentFileEntryIsPublic,
					cf2.is_folder AS commentFileEntryIsFolder,
					cf2.user_id AS commentFileEntryUserId,
					cfu2.username AS commentFileEntryUserName,
					cf2.file_type AS commentFileEntryType,
					cf2.file_size AS commentFileEntrySize,
					cf2.upload_date AS commentFileEntryDate
				FROM
					maxhanna.comments fc
				LEFT JOIN maxhanna.users uc ON fc.user_id = uc.id
				LEFT JOIN maxhanna.user_display_pictures ucudp ON ucudp.user_id = uc.id
				LEFT JOIN maxhanna.file_uploads ucudpfu ON ucudp.file_id = ucudpfu.id
				LEFT JOIN maxhanna.comment_files cf ON fc.id = cf.comment_id
				LEFT JOIN maxhanna.file_uploads cf2 ON cf.file_id = cf2.id
				LEFT JOIN maxhanna.users cfu2 ON cfu2.id = cf2.user_id
				WHERE fc.id IN (SELECT id FROM comment_tree);", connection);

      for (int i = 0; i < fileIds.Count; i++)
      {
        commentsCommand.Parameters.AddWithValue($"@fileId{i}", fileIds[i]);
      }

      using var reader = commentsCommand.ExecuteReader();

      Dictionary<int, FileComment> allCommentsById = new();
      List<(FileComment comment, int parentId)> childComments = new();

      while (reader.Read())
      {
        var commentId = reader.IsDBNull(reader.GetOrdinal("commentId")) ? 0 : reader.GetInt32("commentId");
        var fileIdValue = reader.IsDBNull(reader.GetOrdinal("commentFileId")) ? 0 : reader.GetInt32("commentFileId");
        var commentCity = reader.IsDBNull(reader.GetOrdinal("commentCity")) ? null : reader.GetString("commentCity");
        var commentCountry = reader.IsDBNull(reader.GetOrdinal("commentCountry")) ? null : reader.GetString("commentCountry");
        var commentIp = reader.IsDBNull(reader.GetOrdinal("commentIp")) ? null : reader.GetString("commentIp");
        int? commentParentId = reader.IsDBNull(reader.GetOrdinal("comment_parent_id")) ? null : reader.GetInt32("comment_parent_id");

        var commentUserProfileBackgroundPicId = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundPicId")) ? (int?)null : reader.GetInt32("commentUserProfileBackgroundPicId");

        var commentUserDisplayPicId = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicId")) ? (int?)null : reader.GetInt32("commentUserDisplayPicId");
        var commentUserDisplayPicFileName = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicFileName")) ? null : reader.GetString("commentUserDisplayPicFileName");
        var commentUserDisplayPicFolderPath = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicFolderPath")) ? null : reader.GetString("commentUserDisplayPicFolderPath");

        FileComment? comment;
        if (!allCommentsById.TryGetValue(commentId, out comment))
        {
          comment = new FileComment
          {
            Id = commentId,
            FileId = fileIdValue,
            CommentId = commentParentId,
            User = new User(
              reader.GetInt32("commentUserId"),
              reader.GetString("commentUsername"),
              null,
              new FileEntry
              {
                Id = commentUserDisplayPicId ?? 0,
                FileName = commentUserDisplayPicFileName,
                Directory = commentUserDisplayPicFolderPath
              },
              new FileEntry
              {
                Id = commentUserProfileBackgroundPicId ?? 0,
              },
              null, null, null
            ),
            CommentText = reader.GetString("commentText"),
            Date = reader.GetDateTime("commentDate"),
            City = commentCity,
            Country = commentCountry,
            Ip = commentIp
          };

          allCommentsById[comment.Id] = comment;
          commentIds.Add(commentId);

          if (commentParentId.HasValue)
          {
            childComments.Add((comment, commentParentId.Value));
          }

          var fileEntryMatch = fileEntries.FirstOrDefault(f => f.Id == fileIdValue);
          if (fileEntryMatch != null && !commentParentId.HasValue) // only add root comments to top-level collection
          {
            if (fileEntryMatch.FileComments == null)
            {
              fileEntryMatch.FileComments = new List<FileComment>();
            }
            fileEntryMatch.FileComments!.Add(comment);
          }
        }
        var fileEntryId = reader.IsDBNull(reader.GetOrdinal("commentFileEntryId")) ? (int?)null : reader.GetInt32("commentFileEntryId");

        if (fileEntryId.HasValue)
        {
          var fileEntry = new FileEntry
          {
            Id = fileEntryId.Value,
            FileName = reader.IsDBNull(reader.GetOrdinal("commentFileEntryName")) ? null : reader.GetString("commentFileEntryName"),
            GivenFileName = reader.IsDBNull(reader.GetOrdinal("commentFileEntryGivenFileName")) ? (reader.IsDBNull(reader.GetOrdinal("commentFileEntryName")) ? null : reader.GetString("commentFileEntryName")) : reader.GetString("commentFileEntryGivenFileName"),
            Description = reader.IsDBNull(reader.GetOrdinal("commentFileEntryDescription")) ? null : reader.GetString("commentFileEntryDescription"),
            Directory = reader.IsDBNull(reader.GetOrdinal("commentFileEntryFolderPath")) ? null : reader.GetString("commentFileEntryFolderPath"),
            Visibility = (reader.IsDBNull(reader.GetOrdinal("commentFileEntryIsPublic")) ? true : reader.GetBoolean("commentFileEntryIsPublic")) ? "Public" : "Private",
            IsFolder = reader.IsDBNull(reader.GetOrdinal("commentFileEntryIsFolder")) ? false : reader.GetBoolean("commentFileEntryIsFolder"),
            User = new User(
              reader.IsDBNull(reader.GetOrdinal("commentFileEntryUserId")) ? 0 : reader.GetInt32("commentFileEntryUserId"),
              reader.IsDBNull(reader.GetOrdinal("commentFileEntryUserName")) ? "" : reader.GetString("commentFileEntryUserName")
            ),
            Date = reader.IsDBNull(reader.GetOrdinal("commentFileEntryDate")) ? DateTime.Now : reader.GetDateTime("commentFileEntryDate"),
            LastUpdated = reader.IsDBNull(reader.GetOrdinal("commentFileEntryLastUpdated")) ? (DateTime?)null : reader.GetDateTime("commentFileEntryLastUpdated"),
            LastUpdatedUserId = reader.IsDBNull(reader.GetOrdinal("commentFileEntryLastUpdatedByUserId")) ? 0 : reader.GetInt32("commentFileEntryLastUpdatedByUserId"),
            FileType = reader.IsDBNull(reader.GetOrdinal("commentFileEntryType")) ? null : reader.GetString("commentFileEntryType"),
            FileSize = reader.IsDBNull(reader.GetOrdinal("commentFileEntrySize")) ? 0 : reader.GetInt32("commentFileEntrySize"),
            Width = reader.IsDBNull(reader.GetOrdinal("commentFileEntryWidth")) ? (int?)null : reader.GetInt32("commentFileEntryWidth"),
            Height = reader.IsDBNull(reader.GetOrdinal("commentFileEntryHeight")) ? (int?)null : reader.GetInt32("commentFileEntryHeight"),
            Duration = reader.IsDBNull(reader.GetOrdinal("commentFileEntryDuration")) ? (int?)null : reader.GetInt32("commentFileEntryDuration"),
            LastAccess = reader.IsDBNull(reader.GetOrdinal("commentFileEntryLastAccess")) ? (DateTime?)null : reader.GetDateTime("commentFileEntryLastAccess"),
            AccessCount = reader.IsDBNull(reader.GetOrdinal("commentFileEntryAccessCount")) ? 0 : reader.GetInt32("commentFileEntryAccessCount"),
            FavouriteCount = reader.IsDBNull(reader.GetOrdinal("commentFileEntryFavouriteCount")) ? 0 : reader.GetInt32("commentFileEntryFavouriteCount"),
            IsFavourited = reader.IsDBNull(reader.GetOrdinal("commentFileEntryIsFavourited")) ? false : reader.GetBoolean("commentFileEntryIsFavourited"),
          };

          comment.CommentFiles ??= new List<FileEntry>();
          comment.CommentFiles.Add(fileEntry);
        }
      }

      // Second pass: assign child comments to their parent
      foreach (var (comment, parentId) in childComments)
      {
        if (allCommentsById.TryGetValue(parentId, out var parent))
        {
          parent.Comments ??= new List<FileComment>();
          if (!parent.Comments.Any(c => c.Id == comment.Id))
          {
            parent.Comments.Add(comment);
          }
        }
      }
    }

    private DirectoryResults GetDirectoryResults(User? user, string directory,
     string? search, int page, int pageSize, List<FileEntry> fileEntries,
     string favouritesCondition, string fileTypeCondition, string visibilityCondition,
     string ownershipCondition, string hiddenCondition, MySqlConnection connection,
     string searchCondition, List<MySqlParameter> extraParameters, int? fileId)
    {

      if (fileId.HasValue)
      {
        extraParameters.Add(new MySqlParameter("@fileId", fileId.Value));
      }
      int totalCount = GetResultCount(user,
        directory, search, favouritesCondition, fileTypeCondition, visibilityCondition,
        ownershipCondition, hiddenCondition, connection, searchCondition,
        extraParameters);
      var result = new DirectoryResults
      {
        TotalCount = totalCount,
        CurrentDirectory = directory.Replace(_baseTarget, ""),
        Page = page,
        PageSize = pageSize,
        Data = fileEntries
      };
      return result;
    }

    private static void GetFileTopics(List<FileEntry> fileEntries, MySqlConnection connection, List<int> fileIds)
    {
      var topicsCommand = new MySqlCommand();
      topicsCommand.Connection = connection;

      string whereClause = string.Empty;

      if (fileIds.Count > 0)
      {
        var parameterNames = new List<string>();
        for (int i = 0; i < fileIds.Count; i++)
        {
          string paramName = $"@fileId{i}";
          parameterNames.Add(paramName);
          topicsCommand.Parameters.AddWithValue(paramName, fileIds[i]);
        }

        whereClause = "AND ft.file_id IN (" + string.Join(", ", parameterNames) + ")";
      }

      topicsCommand.CommandText = $@"
				SELECT
					ft.file_id,
					ft.topic_id,
					t.topic 
				FROM
					maxhanna.file_topics ft
				LEFT JOIN topics t ON t.id = ft.topic_id 
				WHERE 1=1
				{whereClause};";

      using (var reader = topicsCommand.ExecuteReader())
      {
        while (reader.Read())
        {
          int fileIdV = reader.GetInt32("file_id");
          int topicIdV = reader.GetInt32("topic_id");
          string topicTextV = reader.GetString("topic");

          var fileEntry = fileEntries.FirstOrDefault(f => f.Id == fileIdV);
          if (fileEntry != null)
          {
            fileEntry.Topics ??= new List<Topic>();
            fileEntry.Topics.Add(new Topic(topicIdV, topicTextV));
          }
        }
      }
    }


    private static void GetFileReactions(List<FileEntry> fileEntries, MySqlConnection connection, List<int> fileIds, List<int> commentIds, List<string> fileIdsParameters, List<string> commentIdsParameters)
    {
      //_ = _log.Db("Getting reactions");
      // Fetch reactions separately
      var reactionsCommand = new MySqlCommand($@"
                        SELECT
                            r.id AS reaction_id,
                            r.file_id AS reactionFileId,
                            r.comment_id AS reactionCommentId,
                            r.type AS reaction_type,
                            r.user_id AS reaction_user_id,
                            ru.username AS reaction_username,
							udp.file_id as reaction_user_display_picture_id,
							udp.tag_background_file_id as reaction_user_background_picture_id,
							r.timestamp as reaction_date
                        FROM
                            maxhanna.reactions r
                        LEFT JOIN
                            maxhanna.users ru ON r.user_id = ru.id
                        LEFT JOIN
                            maxhanna.user_display_pictures udp ON udp.user_id = ru.id 
                        WHERE 1=1
                        {(fileIds.Count > 0 ? "AND r.file_id IN (" + string.Join(", ", fileIdsParameters) + ')' : string.Empty)} 
                        {(commentIds.Count > 0 ? " OR r.comment_id IN (" + string.Join(", ", commentIdsParameters) + ')' : string.Empty)};"
      , connection);

      for (int i = 0; i < commentIds.Count; i++)
      {
        reactionsCommand.Parameters.AddWithValue($"@commentId{i}", commentIds[i]);
      }
      for (int i = 0; i < fileIds.Count; i++)
      {
        reactionsCommand.Parameters.AddWithValue($"@fileId{i}", fileIds[i]);
      }
      //_ = _log.Db(reactionsCommand.CommandText);
      using (var reader = reactionsCommand.ExecuteReader())
      {
        while (reader.Read())
        {
          var reactionId = reader.GetInt32("reaction_id");
          var fileIdValue = reader.IsDBNull(reader.GetOrdinal("reactionFileId")) ? 0 : reader.GetInt32("reactionFileId");
          var commentIdValue = reader.IsDBNull(reader.GetOrdinal("reactionCommentId")) ? 0 : reader.GetInt32("reactionCommentId");
          var udpFileEntry = reader.IsDBNull(reader.GetOrdinal("reaction_user_display_picture_id")) ? null : new FileEntry(reader.GetInt32("reaction_user_display_picture_id"));
          var udpBgFileEntry = reader.IsDBNull(reader.GetOrdinal("reaction_user_background_picture_id")) ? null : new FileEntry(reader.GetInt32("reaction_user_background_picture_id"));
          var reaction = new Reaction
          {
            Id = reactionId,
            FileId = fileIdValue != 0 ? fileIdValue : null,
            CommentId = commentIdValue != 0 ? commentIdValue : null,
            Type = reader.GetString("reaction_type"),
            Timestamp = reader.GetDateTime("reaction_date"),
            User = new User(reader.GetInt32("reaction_user_id"), reader.GetString("reaction_username"), udpFileEntry, udpBgFileEntry)
          };

          var fileEntry = fileEntries.FirstOrDefault(f => f.Id == fileIdValue);
          if (fileEntry != null)
          {
            if (fileEntry.Reactions == null)
            {
              fileEntry.Reactions = new List<Reaction>();
            }
            fileEntry.Reactions.Add(reaction);
          }

          var commentEntry = new FileComment();
          commentEntry.Id = 0;
          for (var x = 0; x < fileEntries.Count; x++)
          {
            if (fileEntries[x].FileComments != null)
            {
              if (fileEntries[x].FileComments!.Find(x => x.Id == commentIdValue) != null)
              {
                commentEntry = fileEntries[x].FileComments!.Find(x => x.Id == commentIdValue)!;
                break;
              }
            }
          }

          if (commentEntry.Id != 0)
          {
            if (commentEntry.Reactions == null)
            {
              commentEntry.Reactions = new List<Reaction>();
            }
            commentEntry.Reactions.Add(reaction);
          }
        }
      }
    }

    // Poll attachment for file comments (adapted from SocialController.FetchAndAttachPollVotesAsync)
    private async Task FetchAndAttachPollVotesToFileComments(List<FileEntry> fileEntries)
    {
      try
      {
        // Flatten all comments across all file entries
        IEnumerable<FileComment> FlattenComments(IEnumerable<FileComment> roots)
        {
          foreach (var c in roots)
          {
            yield return c;
            if (c.Comments != null && c.Comments.Count > 0)
            {
              foreach (var nested in FlattenComments(c.Comments)) yield return nested;
            }
          }
        }

        var allComments = fileEntries
          .Where(f => f.FileComments != null && f.FileComments.Count > 0)
          .SelectMany(f => FlattenComments(f.FileComments!))
          .ToList();

        if (allComments.Count == 0) return;

        // Build component IDs for comments (commentText{commentId})
        var componentIds = allComments.Select(c => $"commentText{c.Id}").Distinct().ToList();
        if (componentIds.Count == 0) return;

        // Prepare SQL with dynamic parameters
        var parameterPlaceholders = componentIds.Select((_, i) => $"@compId{i}");
        string pollSql = $@"SELECT 
					pv.id, pv.user_id, pv.component_id, pv.value, pv.timestamp,
					u.username,
					udpfu.folder_path AS display_picture_folder,
					udpfu.file_name AS display_picture_filename
				FROM poll_votes pv
				JOIN users u ON pv.user_id = u.id
				LEFT JOIN user_display_pictures udp ON udp.user_id = u.id
				LEFT JOIN file_uploads udpfu ON udp.file_id = udpfu.id
				WHERE pv.component_id IN ({string.Join(",", parameterPlaceholders)})
				ORDER BY pv.timestamp DESC;";

        var pollData = new Dictionary<string, List<PollVote>>(StringComparer.OrdinalIgnoreCase);

        using (var conn = new MySqlConnector.MySqlConnection(_connectionString))
        {
          await conn.OpenAsync();
          using (var cmd = new MySqlConnector.MySqlCommand(pollSql, conn))
          {
            for (int i = 0; i < componentIds.Count; i++)
            {
              cmd.Parameters.AddWithValue($"@compId{i}", componentIds[i]);
            }
            using (var rdr = await cmd.ExecuteReaderAsync())
            {
              while (await rdr.ReadAsync())
              {
                string componentId = rdr.IsDBNull(rdr.GetOrdinal("component_id")) ? string.Empty : rdr.GetString("component_id");
                if (string.IsNullOrEmpty(componentId)) continue;
                if (!pollData.ContainsKey(componentId)) pollData[componentId] = new List<PollVote>();
                var vote = new PollVote
                {
                  Id = rdr.IsDBNull(rdr.GetOrdinal("id")) ? 0 : rdr.GetInt32("id"),
                  UserId = rdr.IsDBNull(rdr.GetOrdinal("user_id")) ? 0 : rdr.GetInt32("user_id"),
                  ComponentId = componentId,
                  Value = rdr.IsDBNull(rdr.GetOrdinal("value")) ? string.Empty : rdr.GetString("value"),
                  Timestamp = rdr.IsDBNull(rdr.GetOrdinal("timestamp")) ? DateTime.MinValue : rdr.GetDateTime("timestamp"),
                  Username = rdr.IsDBNull(rdr.GetOrdinal("username")) ? string.Empty : rdr.GetString("username"),
                  DisplayPicture = (rdr.IsDBNull(rdr.GetOrdinal("display_picture_folder")) || rdr.IsDBNull(rdr.GetOrdinal("display_picture_filename")))
                    ? null
                    : $"/assets/Uploads/{rdr.GetString("display_picture_folder")}{rdr.GetString("display_picture_filename")}"
                };
                pollData[componentId].Add(vote);
              }
            }
          }
        }

        // Even if there are no votes yet, still attempt to parse poll markup so client can render poll questions/options.
        foreach (var comment in allComments)
        {
          try
          {
            string decrypted = _log.DecryptContent(comment.CommentText ?? string.Empty, ((comment.User?.Id ?? 0) + ""));
            string question = ExtractPollQuestion(decrypted);
            var options = ExtractPollOptions(decrypted);
            string componentId = $"commentText{comment.Id}";

            // If we have options but no explicit 'Question:' line, derive a question from first non-option line inside the block.
            if (string.IsNullOrEmpty(question) && options.Any())
            {
              var derived = DeriveQuestionFallback(decrypted);
              if (!string.IsNullOrWhiteSpace(derived)) question = derived;
            }

            if (options.Any())
            {
              if (string.IsNullOrWhiteSpace(question))
              {
                // Provide a default label but still preserve all options
                question = "Poll";
              }
              pollData.TryGetValue(componentId, out var votesForComponent);
              votesForComponent ??= new List<PollVote>();
              var poll = new Poll
              {
                ComponentId = componentId,
                Question = question,
                Options = options,
                UserVotes = votesForComponent,
                TotalVotes = votesForComponent.Count,
                CreatedAt = comment.Date
              };
              // Normalize and aggregate votes by cleaned token
              var voteCounts = poll.UserVotes
                .GroupBy(v => NormalizePollToken(v.Value))
                .ToDictionary(g => g.Key, g => g.Count());
              foreach (var opt in poll.Options)
              {
                var key = NormalizePollToken(opt.Text);
                int vc = voteCounts.TryGetValue(key, out var c) ? c : 0;
                opt.Text = key; // store cleaned text for consistent client display
                opt.VoteCount = vc;
                opt.Percentage = poll.TotalVotes > 0 ? (int)Math.Round((double)vc / poll.TotalVotes * 100) : 0;
              }
              comment.Polls ??= new List<Poll>();
              comment.Polls.Add(poll);
            }
            else if (!options.Any() && pollData.TryGetValue(componentId, out var recordedVotes) && recordedVotes.Count > 0)
            {
              // Synthesize poll from votes when no markup present
              var optionGroups = recordedVotes
                .GroupBy(v => NormalizePollToken(v.Value))
                .Select(g => new PollOption { Id = g.Key, Text = g.Key, VoteCount = g.Count() })
                .ToList();
              int total = recordedVotes.Count;
              foreach (var o in optionGroups)
                o.Percentage = total > 0 ? (int)Math.Round((double)o.VoteCount / total * 100) : 0;
              var synthesized = new Poll
              {
                ComponentId = componentId,
                Question = string.IsNullOrEmpty(question) ? "Poll" : question, // keep derived question if we found one
                Options = optionGroups,
                UserVotes = recordedVotes,
                TotalVotes = total,
                CreatedAt = comment.Date
              };
              comment.Polls ??= new List<Poll>();
              comment.Polls.Add(synthesized);
            }
          }
          catch (Exception innerEx)
          {
            _ = _log.Db($"Error processing file comment {comment.Id}: {innerEx.Message}", null, "FILE", true);
            continue;
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error in FetchAndAttachPollVotesToFileComments: {ex.Message}\nStack: {ex.StackTrace}", null, "FILE", true);
      }
    }

    // Reuse SocialController poll parsing helpers (duplicated for isolation)
    private string ExtractPollQuestion(string text)
    {
      if (string.IsNullOrEmpty(text) || !text.Contains("[Poll]") || !text.Contains("[/Poll]")) return string.Empty;
      try
      {
        int startIndex = text.IndexOf("[Poll]") + 6;
        int endIndex = text.IndexOf("[/Poll]");
        if (endIndex < startIndex) return string.Empty;
        string pollContent = text.Substring(startIndex, endIndex - startIndex).Trim();
        var lines = pollContent.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
        foreach (var line in lines)
        {
          if (line.Trim().StartsWith("Question:", StringComparison.OrdinalIgnoreCase))
          {
            return line.Substring("Question:".Length).Trim();
          }
        }
        return string.Empty;
      }
      catch { return string.Empty; }
    }

    private List<PollOption> ExtractPollOptions(string text)
    {
      var options = new List<PollOption>();
      if (string.IsNullOrEmpty(text) || !text.Contains("[Poll]") || !text.Contains("[/Poll]")) return options;
      try
      {
        int startIndex = text.IndexOf("[Poll]") + 6;
        int endIndex = text.IndexOf("[/Poll]");
        if (endIndex < startIndex) return options;
        string pollContent = text.Substring(startIndex, endIndex - startIndex).Trim();
        // Normalize CRLF and split
        pollContent = pollContent.Replace("\r\n", "\n").Replace("\r", "\n");
        var rawLines = pollContent.Split('\n');
        bool hasExplicitQuestion = rawLines.Any(l => l.Trim().StartsWith("Question:", StringComparison.OrdinalIgnoreCase));
        string? derivedQuestionLine = null;
        if (!hasExplicitQuestion)
        {
          // Use same heuristic as DeriveQuestionFallback to avoid counting the first non-option line as an option
          foreach (var rl in rawLines)
          {
            var t = rl.Trim();
            if (string.IsNullOrEmpty(t)) continue;
            if (t.StartsWith("Option:", StringComparison.OrdinalIgnoreCase)) continue;
            derivedQuestionLine = t;
            break;
          }
        }
        var dedupe = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var rl in rawLines)
        {
          var line = rl.Trim();
          if (string.IsNullOrEmpty(line)) continue;
          if (line.Equals(derivedQuestionLine, StringComparison.OrdinalIgnoreCase)) continue; // skip derived question
          if (line.StartsWith("Question:", StringComparison.OrdinalIgnoreCase)) continue; // skip explicit question directive
          string optionText;
          if (line.StartsWith("Option:", StringComparison.OrdinalIgnoreCase))
          {
            optionText = line.Substring("Option:".Length).Trim();
            if (string.IsNullOrEmpty(optionText)) continue;
          }
          else
          {
            // Treat any remaining non-question, non-empty line as an option
            optionText = line;
          }
          if (!dedupe.Add(optionText)) continue;
          options.Add(new PollOption { Id = optionText, Text = optionText });
        }
        return options;
      }
      catch { return options; }
    }

    // Fallback: derive a question when [Poll] block lacks an explicit Question: line.
    private string DeriveQuestionFallback(string text)
    {
      if (string.IsNullOrEmpty(text) || !text.Contains("[Poll]") || !text.Contains("[/Poll]")) return string.Empty;
      try
      {
        int startIndex = text.IndexOf("[Poll]") + 6;
        int endIndex = text.IndexOf("[/Poll]");
        if (endIndex < startIndex) return string.Empty;
        string pollContent = text.Substring(startIndex, endIndex - startIndex).Trim();
        var lines = pollContent.Split('\n');
        foreach (var raw in lines)
        {
          var line = raw.Trim();
          if (string.IsNullOrEmpty(line)) continue;
          if (line.StartsWith("Option:", StringComparison.OrdinalIgnoreCase)) continue;
          if (line.StartsWith("Question:", StringComparison.OrdinalIgnoreCase)) continue; // already handled elsewhere
                                                                                          // Use this as a derived question.
          return line.Length > 140 ? line.Substring(0, 140).Trim() : line;
        }
      }
      catch { }
      return string.Empty;
    }

    // Normalize poll option / vote strings (remove leading labels like 'Option 1:' or numeric bullets)
    private static string NormalizePollToken(string raw)
    {
      if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
      var cleaned = raw.Trim();
      // Patterns:
      // Option 1: Text
      // Option: Text
      // 1) Text / 1. Text / 1 - Text
      cleaned = Regex.Replace(cleaned, @"^Option\s+\d+\s*:\s*", string.Empty, RegexOptions.IgnoreCase);
      cleaned = Regex.Replace(cleaned, @"^Option\s*:\s*", string.Empty, RegexOptions.IgnoreCase);
      cleaned = Regex.Replace(cleaned, @"^\d+\s*([).:-])\s*", string.Empty); // numeric bullet variants
      return cleaned.Trim();
    }

    private static int GetResultCount(User? user, string directory, string? search, string favouritesCondition, string fileTypeCondition, string visibilityCondition, string ownershipCondition, string hiddenCondition, MySqlConnection connection, string searchCondition, List<MySqlParameter> extraParameters)
    {
      var totalCountCommand = new MySqlCommand(
          $@"SELECT COUNT(*) 
            FROM 
                maxhanna.file_uploads f  
            LEFT JOIN
                maxhanna.users u ON f.user_id = u.id 
            WHERE 
                {(!string.IsNullOrEmpty(search) ? "" : "f.folder_path = @folderPath AND ")}
                ( 
                    f.is_public = 1 OR 
                    f.user_id = @userId OR 
                    FIND_IN_SET(@userId, f.shared_with) > 0
                ) 
            {searchCondition}
            {fileTypeCondition}
            {visibilityCondition}
            {ownershipCondition}
            {hiddenCondition}
						{favouritesCondition};"
       , connection);
      foreach (var param in extraParameters)
      {
        totalCountCommand.Parameters.Add(param);
      }
      if (fileTypeCondition.Contains("@fileId") || favouritesCondition.Contains("@fileId") || visibilityCondition.Contains("@fileId"))
      {
        if (!totalCountCommand.Parameters.Contains("@fileId"))
          totalCountCommand.Parameters.AddWithValue("@fileId", extraParameters.FirstOrDefault(p => p.ParameterName == "@fileId")?.Value ?? DBNull.Value);
      }
      totalCountCommand.Parameters.AddWithValue("@folderPath", directory);
      totalCountCommand.Parameters.AddWithValue("@userId", user?.Id ?? 0);
      totalCountCommand.Parameters.AddWithValue("@showHidden", 0); // result count always evaluates condition; explicit toggle handled earlier
      if (!string.IsNullOrEmpty(search))
      {
        totalCountCommand.Parameters.AddWithValue("@search", "%" + search + "%"); // Add search parameter
      }
      //_ = _log.Db("total count sql : " + totalCountCommand.CommandText);
      int totalCount = Convert.ToInt32(totalCountCommand.ExecuteScalar());
      return totalCount;
    }

    private async Task<bool> GetNsfwForUser(User? user)
    {
      bool nsfwEnabled = false;
      if (user?.Id != null)
      {
        string nsfwSql = @"SELECT nsfw_enabled FROM user_settings WHERE user_id = @userId;";
        using (var conn = new MySqlConnection(_connectionString))
        {
          await conn.OpenAsync();
          using (var cmd = new MySqlCommand(nsfwSql, conn))
          {
            cmd.Parameters.AddWithValue("@userId", user.Id);
            var result = await cmd.ExecuteScalarAsync();

            if (result != null && result != DBNull.Value)
            {
              nsfwEnabled = Convert.ToBoolean(result);
            }
          }
        }
      }
      return nsfwEnabled;
    }
    private async Task<(string, List<MySqlParameter>)> GetWhereCondition(string? search, User? user)
    {
      string searchCondition = "";
      if (!await GetNsfwForUser(user))
      {
        searchCondition += $@"
            AND NOT EXISTS (
                SELECT 1 FROM maxhanna.file_topics ft
                JOIN maxhanna.topics t ON t.id = ft.topic_id
                WHERE t.topic = 'NSFW' AND ft.file_id = f.id
            )";
      }
      if (user != null)
      {
        int userId = user.Id ?? 0;
        searchCondition += $@" 
				AND NOT EXISTS (
					SELECT 1 FROM user_blocks ub 
					WHERE (ub.user_id = {userId} AND ub.blocked_user_id = f.user_id)
					OR (ub.user_id = f.user_id AND ub.blocked_user_id = {userId})
				) ";
      }

      if (string.IsNullOrWhiteSpace(search))
        return (searchCondition, new List<MySqlParameter>());

      List<MySqlParameter> parameters = new();

      // Use FULLTEXT search for better ranking 
      searchCondition += $@"
      AND 
			( 
				(
					MATCH(f.file_name, f.description, f.given_file_name) 
					AGAINST (@FullTextSearch IN NATURAL LANGUAGE MODE)
				)
				OR
				(
					LOWER(f.file_name) LIKE CONCAT('%', @FullTextSearch, '%')
          OR LOWER(f.given_file_name) LIKE CONCAT('%', @FullTextSearch, '%')
          OR LOWER(f.description) LIKE CONCAT('%', @FullTextSearch, '%')
          OR LOWER(u.username) LIKE CONCAT('%', @FullTextSearch, '%')
          OR f.id IN (
              SELECT ft.file_id 
              FROM maxhanna.file_topics ft
              JOIN maxhanna.topics t ON ft.topic_id = t.id
              WHERE LOWER(t.topic) LIKE CONCAT('%', @FullTextSearch, '%')
          )
				)
			)";

      parameters.Add(new MySqlParameter("@FullTextSearch", search));


      // Special rules for keywords like "sega", "nintendo", "gameboy"
      if (search.Contains("sega", StringComparison.OrdinalIgnoreCase))
      {
        searchCondition += " AND f.file_name LIKE '%.md'";
      }
      else if (search.Contains("nintendo", StringComparison.OrdinalIgnoreCase))
      {
        searchCondition += " AND f.file_name LIKE '%.nes'";
      }
      else if (search.Contains("gameboy", StringComparison.OrdinalIgnoreCase))
      {
        searchCondition += " AND (f.file_name LIKE '%.gbc' OR f.file_name LIKE '%.gba')";
      }

      return (searchCondition, parameters);
    }


    [HttpPost("/File/UpdateFileData", Name = "UpdateFileData")]
    public async Task<IActionResult> UpdateFileData([FromBody] FileDataRequest request)
    {
      //	_ = _log.Db($"POST /File/UpdateFileData (Updating data for file: {request.FileData.FileId}  user: {request.UserId})", request.UserId, "FILE", true);

      try
      {
        using (var connection = new MySqlConnection(_connectionString))
        {
          await connection.OpenAsync();

          var command = new MySqlCommand($@"
                        UPDATE file_uploads
                        SET given_file_name = @given_file_name,
                            description = @description,
                            last_updated_by_user_id = @last_updated_by_user_id,
                            last_updated = UTC_TIMESTAMP()
                        WHERE id = @file_id"
          , connection);
          command.Parameters.AddWithValue("@given_file_name", string.IsNullOrWhiteSpace(request.FileData.GivenFileName) ? (object)DBNull.Value : request.FileData.GivenFileName);
          command.Parameters.AddWithValue("@last_updated_by_user_id", request.UserId);
          command.Parameters.AddWithValue("@file_id", request.FileData.FileId);
          command.Parameters.AddWithValue("@description", string.IsNullOrWhiteSpace(request.FileData.Description) ? (object)DBNull.Value : request.FileData.Description);

          await command.ExecuteNonQueryAsync();
        }

        await UpdateSitemapEntry(request.FileData.FileId, request.FileData.GivenFileName, request.FileData.Description);
        return Ok("Filedata added successfully.");
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while updating the Filedata. " + ex.Message, request.UserId, "FILE", true);
        return StatusCode(500, "An error occurred while updating the Filedata.");
      }
    }


    [HttpPost("/File/UpdateFileVisibility", Name = "UpdateFileVisibility")]
    public async Task<IActionResult> UpdateFileVisibility([FromBody] UpdateFileVisibilityRequest request)
    {
      _ = _log.Db($"POST /File/UpdateFileVisibility (Updating visivility for file: {request.FileId}  user: {request.UserId})", request.UserId, "FILE", true);

      try
      {
        using (var connection = new MySqlConnection(_connectionString))
        {
          await connection.OpenAsync();

          var command = new MySqlCommand($@"
                        UPDATE file_uploads
                        SET is_public = @is_public,
                            last_updated_by_user_id = @last_updated_by_user_id,
                            last_updated = CURRENT_TIMESTAMP
                        WHERE id = @file_id"
          , connection);
          command.Parameters.AddWithValue("@is_public", request.IsVisible);
          command.Parameters.AddWithValue("@last_updated_by_user_id", request.UserId);
          command.Parameters.AddWithValue("@file_id", request.FileId);

          await command.ExecuteNonQueryAsync();
        }

        return Ok("File visibility updated successfully.");
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while updating the Filedata. " + ex.Message, request.UserId, "FILE", true);
        return StatusCode(500, "An error occurred while updating the Filedata.");
      }
    }

    [HttpPost("/File/GetFile/{filePath}", Name = "GetFile")]
    public async Task<IActionResult> GetFile(string filePath, [FromBody] int? userId)
    {
      try
      {
        Console.WriteLine($"Request received for file: {filePath} by user: {userId}");

        // Validate and process file path
        filePath = Path.Combine(_baseTarget, WebUtility.UrlDecode(filePath) ?? "");
        if (!ValidatePath(filePath))
        {
          Console.WriteLine($"Invalid path: {filePath} (must be within {_baseTarget})");
          return StatusCode(500, $"Must be within {_baseTarget}");
        }

        if (string.IsNullOrEmpty(filePath))
        {
          Console.WriteLine("Empty file path received");
          await _log.Db("File path is missing.", null, "FILE", true);
          return BadRequest("File path is missing.");
        }

        if (!System.IO.File.Exists(filePath))
        {
          Console.WriteLine($"File not found: {filePath}");
          await _log.Db($"File not found at {filePath}", null, "FILE", true);
          return NotFound();
        }

        // Database operations
        var relativePath = filePath.Replace(_baseTarget, "").TrimStart(Path.DirectorySeparatorChar);
        var fileName = Path.GetFileName(filePath);
        var folderPath = filePath.Replace(fileName, "");
        using (var connection = new MySqlConnection(_connectionString))
        {
          await connection.OpenAsync();
          Console.WriteLine("Database connection opened successfully");

          using (var transaction = await connection.BeginTransactionAsync())
          {
            try
            {
              var updateCmd = new MySqlCommand(@"
									UPDATE file_uploads 
									SET last_access = UTC_TIMESTAMP(), 
										access_count = access_count + 1 
									WHERE file_name = @FileName 
									AND folder_path = @FolderPath",
                connection, transaction);

              updateCmd.Parameters.AddWithValue("@FileName", fileName);
              updateCmd.Parameters.AddWithValue("@FolderPath", folderPath);

              int rowsUpdated = await updateCmd.ExecuteNonQueryAsync();
              Console.WriteLine($"Updated {rowsUpdated} rows in file_uploads");

              if (rowsUpdated == 0)
              {
                Console.WriteLine("No records updated in file_uploads - file not registered?");
              }

              if (userId.HasValue)
              {
                var insertCmd = new MySqlCommand(@"
									INSERT INTO file_access (file_id, user_id)
									SELECT id, @UserId 
									FROM file_uploads 
									WHERE file_name = @FileName 
									AND folder_path = @FolderPath
									ON DUPLICATE KEY UPDATE file_id = VALUES(file_id)",
                  connection, transaction);

                insertCmd.Parameters.AddWithValue("@FileName", fileName);
                insertCmd.Parameters.AddWithValue("@FolderPath", folderPath);
                insertCmd.Parameters.AddWithValue("@UserId", userId.Value);

                int rowsInserted = await insertCmd.ExecuteNonQueryAsync();
              }

              await transaction.CommitAsync();
            }
            catch (Exception dbEx)
            {
              await transaction.RollbackAsync();
              await _log.Db($"Database error: {dbEx.Message}", null, "FILE", true);
            }
          }
        }

        // Stream the file
        try
        {
          var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous);
          string contentType = GetContentType(Path.GetExtension(filePath));
          return File(fileStream, contentType, Path.GetFileName(filePath));
        }
        catch (IOException ioEx)
        {
          await _log.Db($"File streaming error: {ioEx.Message}", null, "FILE", true);
          return StatusCode(500, "Error accessing the file");
        }
      }
      catch (Exception ex)
      {
        await _log.Db($"Global error: {ex.Message}", null, "FILE", true);
        return StatusCode(500, "An unexpected error occurred");
      }
    }

    [HttpPost("/File/GetFileById/{fileId}", Name = "GetFileById")]
    public async Task<IActionResult> GetFileById([FromBody] int? userId, int fileId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      try
      {
        if (fileId == 0)
        {
          await _log.Db($"File id is missing.", userId, "FILE", true);
          return BadRequest("File id is missing.");
        }

        using (var connection = new MySqlConnection(_connectionString))
        {
          await connection.OpenAsync();

          // Start transaction for atomic operations
          using (var transaction = await connection.BeginTransactionAsync())
          {
            try
            {
              // First query: Update access stats and get file info
              string sql = @"
								UPDATE maxhanna.file_uploads
								SET last_access = UTC_TIMESTAMP(), 
									access_count = access_count + 1
								WHERE id = @fileId LIMIT 1;

								SELECT user_id, file_name, folder_path, is_public
								FROM maxhanna.file_uploads
								WHERE id = @fileId LIMIT 1;";

              var command = new MySqlCommand(sql, connection, transaction);
              command.Parameters.AddWithValue("@fileId", fileId);

              using (var reader = await command.ExecuteReaderAsync())
              {
                if (!await reader.ReadAsync())
                {
                  await _log.Db($"File with id {fileId} not found in database.", userId, "FILE", true);
                  return NotFound();
                }

                int userIdDb = reader.GetInt32("user_id");
                string fileName = reader.GetString("file_name");
                string folderPath = reader.GetString("folder_path");
                bool isPublic = reader.GetBoolean("is_public");

                // Check permissions
                if (!isPublic && (userId == null || userIdDb != userId))
                {
                  await _log.Db($"User does not have permission to access file with id {fileId}.", userId, "FILE", true);
                  return Forbid();
                }

                if (!isPublic && (userId == null || (!await _log.ValidateUserLoggedIn(userId.Value, encryptedUserIdHeader))))
                {
                  await _log.Db($"User does not have permission to access file with id {fileId}.", userId, "FILE", true);
                  return Forbid();
                }

                // Close the first reader before executing next command
                await reader.CloseAsync();

                // Record user access if userId is provided
                if (userId != null)
                {
                  var accessCommand = new MySqlCommand(@"
										INSERT INTO maxhanna.file_access (file_id, user_id)
										VALUES (@fileId, @userId)
										ON DUPLICATE KEY UPDATE file_id = @fileId",
                    connection, transaction);

                  accessCommand.Parameters.AddWithValue("@fileId", fileId);
                  accessCommand.Parameters.AddWithValue("@userId", userId.Value);

                  await accessCommand.ExecuteNonQueryAsync();
                }

                // Commit transaction if everything succeeded
                await transaction.CommitAsync();

                // Construct the full file path
                string filePath = Path.Combine(folderPath, fileName);

                if (!System.IO.File.Exists(filePath))
                {
                  await _log.Db($"File not found at {filePath}", userId, "FILE", true);
                  return NotFound();
                }

                var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
                string contentType = GetContentType(Path.GetExtension(filePath));

                return File(fileStream, contentType, fileName);
              }
            }
            catch (Exception ex)
            {
              await transaction.RollbackAsync();
              await _log.Db("Transaction rolled back. Error: " + ex.Message, userId, "FILE", true);
              return StatusCode(500, "An error occurred while processing your request.");
            }
          }
        }
      }
      catch (Exception ex)
      {
        await _log.Db("An error occurred while retrieving or streaming the file: " + ex.Message, userId, "FILE", true);
        return StatusCode(500, "An error occurred while retrieving or streaming the file.");
      }
    }

    [HttpPost("/File/RecordSelection", Name = "RecordSelection")]
    public async Task<IActionResult> RecordSelection([FromBody] RecordSelectionRequest? request)
    {
      if (request == null || request.FileId == 0)
      {
        return BadRequest("FileId is required");
      }

      try
      {
        using (var connection = new MySqlConnection(_connectionString))
        {
          await connection.OpenAsync();
          using (var transaction = await connection.BeginTransactionAsync())
          {
            // Update access stats
            var updateCmd = new MySqlCommand(@"
							UPDATE maxhanna.file_uploads
							SET last_access = UTC_TIMESTAMP(),
								access_count = access_count + 1
							WHERE id = @fileId LIMIT 1;", connection, transaction);

            updateCmd.Parameters.AddWithValue("@fileId", request.FileId);
            await updateCmd.ExecuteNonQueryAsync();

            // Record per-user access if provided
            if (request.UserId.HasValue)
            {
              var insertCmd = new MySqlCommand(@"
								INSERT INTO maxhanna.file_access (file_id, user_id)
								VALUES (@fileId, @userId)
								ON DUPLICATE KEY UPDATE file_id = VALUES(file_id);", connection, transaction);

              insertCmd.Parameters.AddWithValue("@fileId", request.FileId);
              insertCmd.Parameters.AddWithValue("@userId", request.UserId.Value);
              await insertCmd.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
          }
        }

        return Ok();
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error in RecordSelection: {ex.Message}", request?.UserId ?? 0, "FILE", true);
        return StatusCode(500, "An error occurred while recording file selection.");
      }
    }

    [HttpPost("/File/MakeDirectory", Name = "MakeDirectory")]
    public async Task<IActionResult> MakeDirectory([FromBody] CreateDirectory request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (!await _log.ValidateUserLoggedIn(request.userId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

      if (request.directory == null)
      {
        _ = _log.Db("POST /File/MakeDirectory ERROR: directoryPath cannot be empty!", request.userId, "FILE", true);
        return StatusCode(500, "POST /File/MakeDirectory ERROR: directoryPath cannot be empty!");
      }

      request.directory = Path.Combine(_baseTarget, WebUtility.UrlDecode(request.directory) ?? "");
      _ = _log.Db($"POST /File/MakeDirectory/ (directoryPath: {request.directory})", request.userId, "FILE", true);
      if (!ValidatePath(request.directory))
      {
        return StatusCode(500, $"Must be within {_baseTarget}");
      }

      try
      {
        if (Directory.Exists(request.directory))
        {
          _ = _log.Db($"Directory already exists at {request.directory}", request.userId, "FILE", true);
          return Conflict("Directory already exists.");
        }

        Directory.CreateDirectory(request.directory);

        DateTime uploadDate = DateTime.UtcNow;
        string fileName = Path.GetFileName(request.directory);
        string directoryName = (Path.GetDirectoryName(request.directory) ?? "").Replace("\\", "/");

        string connectionString = _connectionString ?? "";

        using (var connection = new MySqlConnection(connectionString))
        {
          await connection.OpenAsync();
          using (var transaction = await connection.BeginTransactionAsync())
          {
            if (!directoryName.EndsWith("/"))
            {
              directoryName += "/";
            }

            var insertCommand = new MySqlCommand(
               "INSERT INTO maxhanna.file_uploads " +
               "(user_id, upload_date, file_name, folder_path, is_public, is_folder) " +
               "VALUES (@user_id, @uploadDate, @fileName, @folderPath, @isPublic, @isFolder);" +
               "SELECT LAST_INSERT_ID();",
               connection,
               transaction);

            insertCommand.Parameters.AddWithValue("@user_id", request.userId);
            insertCommand.Parameters.AddWithValue("@uploadDate", uploadDate);
            insertCommand.Parameters.AddWithValue("@fileName", fileName);
            insertCommand.Parameters.AddWithValue("@folderPath", directoryName);
            insertCommand.Parameters.AddWithValue("@isPublic", request.isPublic);
            insertCommand.Parameters.AddWithValue("@isFolder", 1);

            int id = 0;
            object? result = await insertCommand.ExecuteScalarAsync();
            if (result != null)
            {
              id = Convert.ToInt32(result);
            }

            await transaction.CommitAsync();
            return Ok(id);
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while creating directory. " + ex.Message, request.userId, "FILE", true);
        return StatusCode(500, "An error occurred while creating directory.");
      }
    }

    [HttpGet("/File/GetLatestMeme", Name = "GetLatestMeme")]
    public async Task<IActionResult> GetLatestMeme()
    {
      try
      {
        using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await connection.OpenAsync();

          // Select the latest meme and include common fields to assemble a FileEntry without delegating to GetDirectory.
          string query = @"
						SELECT
							f.id,
							f.user_id,
							u.username,
							f.file_name,
							f.folder_path,
							f.is_public,
							f.is_folder,
							f.upload_date,
							f.file_type,
							f.file_size,
							f.given_file_name,
							f.description,
							f.access_count,
							udp.file_id AS display_picture_id,
							udp.tag_background_file_id AS background_picture_id
						FROM file_uploads f
						LEFT JOIN users u ON u.id = f.user_id
						LEFT JOIN user_display_pictures udp ON udp.user_id = u.id
						LEFT JOIN file_topics ft ON f.id = ft.file_id
						LEFT JOIN topics t ON ft.topic_id = t.id AND t.topic = 'NSFW'
						WHERE f.folder_path = 'E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Meme/'
						AND f.is_folder = 0
						AND t.id IS NULL
						ORDER BY f.id DESC
						LIMIT 1;";

          using (var command = new MySqlCommand(query, connection))
          using (var reader = await command.ExecuteReaderAsync())
          {
            if (await reader.ReadAsync())
            {
              var id = reader.GetInt32("id");
              var userId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32("user_id");
              var username = reader.IsDBNull(reader.GetOrdinal("username")) ? "Anonymous" : reader.GetString("username");
              var fileName = reader.IsDBNull(reader.GetOrdinal("file_name")) ? null : reader.GetString("file_name");
              var folderPath = reader.IsDBNull(reader.GetOrdinal("folder_path")) ? null : reader.GetString("folder_path");
              var isPublic = !reader.IsDBNull(reader.GetOrdinal("is_public")) && reader.GetBoolean("is_public");
              var isFolder = !reader.IsDBNull(reader.GetOrdinal("is_folder")) && reader.GetBoolean("is_folder");
              var uploadDate = reader.IsDBNull(reader.GetOrdinal("upload_date")) ? (DateTime?)null : reader.GetDateTime("upload_date");
              var fileType = reader.IsDBNull(reader.GetOrdinal("file_type")) ? null : reader.GetString("file_type");
              var fileSize = reader.IsDBNull(reader.GetOrdinal("file_size")) ? (int?)null : reader.GetInt32("file_size");
              var givenFileName = reader.IsDBNull(reader.GetOrdinal("given_file_name")) ? null : reader.GetString("given_file_name");
              var description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description");
              var displayPicId = reader.IsDBNull(reader.GetOrdinal("display_picture_id")) ? (int?)null : reader.GetInt32("display_picture_id");
              var bgPicId = reader.IsDBNull(reader.GetOrdinal("background_picture_id")) ? (int?)null : reader.GetInt32("background_picture_id");

              var displayPic = displayPicId.HasValue ? new FileEntry(displayPicId.Value) : null;
              var bgPic = bgPicId.HasValue ? new FileEntry(bgPicId.Value) : null;

              var fileEntry = new FileEntry
              {
                Id = id,
                FileName = fileName,
                Directory = folderPath,
                Visibility = isPublic ? "Public" : "Private",
                IsFolder = isFolder,
                Date = uploadDate ?? DateTime.MinValue,
                FileType = fileType,
                FileSize = fileSize ?? 0,
                GivenFileName = givenFileName,
                Description = description,
                User = new User(userId, username, displayPic, bgPic)
              };

              return Ok(fileEntry);
            }
            return NotFound("No memes found");
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"An error occurred while getting latest meme: {ex.Message}", 0, "FILE", true);
        return StatusCode(500, "An error occurred while getting latest meme");
      }
    }


    [HttpPost("/File/GetFileViewers", Name = "GetFileViewers")]
    public async Task<IActionResult> GetFileViewers([FromBody] int fileId)
    {
      List<User> users = new List<User>();
      try
      {
        using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await connection.OpenAsync();

          // Query to get the latest meme ID
          string query = @"
						SELECT fa.user_id, u.username, udp.file_id as display_picture_id, udp.tag_background_file_id as background_picture_id
						FROM file_access AS fa
						LEFT JOIN users AS u ON u.id = fa.user_id
						LEFT JOIN user_display_pictures AS udp ON udp.user_id = fa.user_id
						WHERE fa.file_id = @FileId;";

          using (var command = new MySqlCommand(query, connection))
          {
            command.Parameters.AddWithValue("@FileId", fileId);
            using (var reader = await command.ExecuteReaderAsync())
            {
              while (await reader.ReadAsync())
              {
                users.Add(new User
                {
                  Id = reader.GetInt32("user_id"),
                  Username = reader.GetString("username"),
                  DisplayPictureFile = reader.IsDBNull("display_picture_id") ? null : new FileEntry(reader.GetInt32("display_picture_id")),
                  ProfileBackgroundPictureFile = reader.IsDBNull("background_picture_id") ? null : new FileEntry(reader.GetInt32("background_picture_id"))
                });
              }
            }
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"An error occurred while getting file viewers for FileID {fileId}: {ex.Message}", 0, "FILE", true);
        return StatusCode(500, "An error occurred while getting file viewers for FileID {fileId}");
      }
      return Ok(users);
    }

    [HttpPost("/File/Upload", Name = "Upload")]
    public async Task<IActionResult> UploadFiles([FromQuery] string? folderPath, [FromQuery] Boolean? compress)
    {
      List<FileEntry> uploaded = new List<FileEntry>();
      try
      {
        if (Request.Form["userId"].Count <= 0)
        {
          _ = _log.Db($"Invalid user! Returning null.", null, "FILE", true);
          return BadRequest("No user logged in.");
        }

        var userId = JsonConvert.DeserializeObject<int?>(Request.Form["userId"]!);
        var isPublic = JsonConvert.DeserializeObject<bool>(Request.Form["isPublic"]!);
        var files = Request.Form.Files;
        int conflicts = 0;
        _ = _log.Db($"POST /File/Upload (user: {userId} folderPath = {folderPath})", userId, "FILE", true);

        if (files == null || files.Count == 0)
          return BadRequest("No files uploaded.");

        foreach (var file in files)
        {
          if (file.Length == 0)
            continue; // Skip empty files

          var uploadDirectory = string.IsNullOrEmpty(folderPath) ? _baseTarget : Path.Combine(_baseTarget, WebUtility.UrlDecode(folderPath));
          if (!uploadDirectory.EndsWith("/"))
          {
            uploadDirectory += "/";
          }
          var filePath = Path.Combine(uploadDirectory, file.FileName); // Combine upload directory with file name

          var conflictingFile = await GetConflictingFile(userId ?? 0, file, uploadDirectory, isPublic);
          if (conflictingFile != null)
          {
            conflictingFile.IsDuplicate = true; // flag for frontend UI
            _ = _log.Db($"Cannot upload duplicate files. {conflictingFile.FileName}", userId, "FILE", true);
            uploaded.Add(conflictingFile);
            conflicts++;
          }
          else
          {
            if (!Directory.Exists(uploadDirectory))
            {
              Directory.CreateDirectory(uploadDirectory);
              await InsertDirectoryMetadata(userId ?? 0, filePath, isPublic);
            }

            // Check file type and convert if necessary
            var convertedFilePath = filePath;
            int? width = null;
            int? height = null;
            int? duration = null;
            if (compress != null && compress == false)
            {
              using (var stream = new FileStream(filePath, FileMode.Create))
              {
                await file.CopyToAsync(stream);
              }
              // Attempt rich media probe; fall back gracefully if FFmpeg / System.Text.Json assembly load fails
              try
              {
                (width, height, duration) = await GetMediaInfo(filePath);
              }
              catch (Exception exProbe)
              {
                _ = _log.Db($"GetMediaInfo failed (non-fatal) for '{file.FileName}': {exProbe.Message}", userId, "FILE", true);
                // Minimal fallback: if it's an image, read basic dimensions; otherwise leave metadata null
                try
                {
                  if (IsImageFile(file))
                  {
                    (width, height) = GetBasicImageDimensions(filePath);
                  }
                }
                catch (Exception exBasic)
                {
                  _ = _log.Db($"Basic dimension fallback failed for '{file.FileName}': {exBasic.Message}", userId, "FILE", true);
                }
              }
            }
            else
            {
              if (IsGifFile(file))
              {
                // (convertedFilePath, width, height, duration) = await ConvertGifToWebp(file, uploadDirectory);
                if (!System.IO.File.Exists(filePath))
                {
                  using (var stream = new FileStream(filePath, FileMode.Create))
                  {
                    await file.CopyToAsync(stream);
                  }
                }
              }
              else if (IsImageFile(file) && !IsWebPFile(file))
              {
                (convertedFilePath, width, height) = await ConvertImageToWebp(file, uploadDirectory);
              }
              else if (IsVideoFile(file) && !IsWebMFile(file))
              {
                (convertedFilePath, width, height, duration) = await ConvertVideoToWebm(file, uploadDirectory);
              }
              else if (IsAudioFile(file) && !file.FileName.EndsWith(".opus"))
              {
                convertedFilePath = await ConvertAudioToOpusMP4(file, uploadDirectory);
              }
              else
              {
                if (!System.IO.File.Exists(filePath))
                {
                  using (var stream = new FileStream(filePath, FileMode.Create))
                  {
                    await file.CopyToAsync(stream);
                  }
                }
              }
            }

            var fileId = await InsertFileIntoDB(userId ?? 0, file, uploadDirectory, isPublic, convertedFilePath, width, height, duration);
            var fileEntry = CreateFileEntry(file, userId ?? 0, isPublic, fileId, convertedFilePath, uploadDirectory, width, height, duration);
            uploaded.Add(fileEntry);

            await AppendToSitemapAsync(fileEntry);
          }
        }
        string message = $"Uploaded {uploaded.Count} files. Conflicts: {conflicts}.";
        return Ok(uploaded);
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while uploading files. " + ex.Message, null, "FILE", true);
        return StatusCode(500, "An error occurred while uploading files.");
      }
    }

    [HttpPost("/File/GetFileEntryById", Name = "GetFileEntryById")]
    public async Task<IActionResult> GetFileEntryById([FromBody] int fileId, [FromQuery] int? userId = null, [FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
    {
      // Reuse GetDirectory to assemble file, comments, reactions, polls and topics. Ask GetDirectory to filter by fileId and return the first file.
      try
      {
        User caller = new User(userId ?? 0);
        // Call GetDirectory with fileId set; pageSize 1 to narrow results
        DirectoryResults? dir = await GetDirectory(caller, null, null, null, null, 1, 1, fileId, null, false, "Latest", false);
        if (dir != null && dir.Data != null && dir.Data.Count > 0)
        {
          return Ok(dir.Data[0]);
        }
        // If nothing returned, preserve previous behaviour but give clearer logging
        _ = _log.Db($"GetFileEntryById: File {fileId} not found or access denied (caller: {(caller != null ? caller.Id.ToString() : "Anonymous")})", userId ?? 0, "FILE", true);
        return NotFound("File not found or access denied.");
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error in GetFileEntryById (delegating to GetDirectory): {ex.Message}", userId ?? 0, "FILE", true);
        return StatusCode(500, "An error occurred while retrieving file entry.");
      }
    }


    [HttpGet("/File/GetNumberOfFiles", Name = "GetNumberOfFiles")]
    public async Task<IActionResult> GetNumberOfFiles([FromQuery] int userId)
    {
      try
      {
        using (var conn = new MySqlConnection(_connectionString))
        {
          await conn.OpenAsync();
          string sql = "SELECT COUNT(*) FROM file_uploads WHERE user_id = @UserId;";
          using (var cmd = new MySqlCommand(sql, conn))
          {
            cmd.Parameters.AddWithValue("@UserId", userId);
            var result = await cmd.ExecuteScalarAsync();
            int count = 0;
            if (result != null && int.TryParse(result.ToString(), out int tmp)) count = tmp;
            return Ok(count);
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error fetching file count: " + ex.Message, null, "FILE", true);
        return StatusCode(500, 0);
      }
    }

    [HttpGet("/File/GetNumberOfMemes", Name = "GetNumberOfMemes")]
    public async Task<IActionResult> GetNumberOfMemes([FromQuery] int userId)
    {
      try
      {
        using (var conn = new MySqlConnection(_connectionString))
        {
          await conn.OpenAsync();
          string sql = "SELECT COUNT(*) FROM file_uploads WHERE user_id = @UserId AND folder_path = 'E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Meme/';";
          using (var cmd = new MySqlCommand(sql, conn))
          {
            cmd.Parameters.AddWithValue("@UserId", userId);
            var result = await cmd.ExecuteScalarAsync();
            int count = 0;
            if (result != null && int.TryParse(result.ToString(), out int tmp)) count = tmp;
            return Ok(count);
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error fetching meme count: " + ex.Message, null, "FILE", true);
        return StatusCode(500, 0);
      }
    }

    [HttpGet("/File/GetNumberOfArt", Name = "GetNumberOfArt")]
    public async Task<IActionResult> GetNumberOfArt([FromQuery] int? userId)
    {
      try
      {
        using (var conn = new MySqlConnection(_connectionString))
        {
          await conn.OpenAsync();
          string sql;
          if (userId.HasValue)
          {
            sql = "SELECT COUNT(*) FROM file_uploads WHERE user_id = @UserId AND folder_path = 'E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Art/';";
          }
          else
          {
            sql = "SELECT COUNT(*) FROM file_uploads WHERE folder_path = 'E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Art/';";
          }

          using (var cmd = new MySqlCommand(sql, conn))
          {
            if (userId.HasValue)
            {
              cmd.Parameters.AddWithValue("@UserId", userId.Value);
            }
            var result = await cmd.ExecuteScalarAsync();
            int count = 0;
            if (result != null && int.TryParse(result.ToString(), out int tmp)) count = tmp;
            return Ok(count);
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error fetching art count: " + ex.Message, null, "FILE", true);
        return StatusCode(500, 0);
      }
    }


    [HttpPost("/File/Edit-Topics", Name = "EditFileTopics")]
    public async Task<IActionResult> EditFileTopics([FromBody] maxhanna.Server.Controllers.DataContracts.Files.EditTopicRequest request)
    {
      try
      {
        string deleteSql = "DELETE FROM maxhanna.file_topics WHERE file_id = @FileId;";
        string insertSql = @"INSERT INTO maxhanna.file_topics (file_id, topic_id) VALUES (@FileId, @TopicId);
									UPDATE maxhanna.file_uploads SET last_updated = UTC_TIMESTAMP(), last_updated_by_user_id = @UserId WHERE id = @FileId LIMIT 1;";

        using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await conn.OpenAsync();

          using (var transaction = await conn.BeginTransactionAsync())
          {
            try
            {
              // Delete existing topics for the story
              using (var deleteCmd = new MySqlCommand(deleteSql, conn, transaction))
              {
                deleteCmd.Parameters.AddWithValue("@FileId", request.File.Id);
                await deleteCmd.ExecuteNonQueryAsync();
              }

              // Insert new topics
              if (request.Topics != null && request.Topics.Any())
              {
                foreach (var topic in request.Topics)
                {
                  using (var insertCmd = new MySqlCommand(insertSql, conn, transaction))
                  {
                    insertCmd.Parameters.AddWithValue("@FileId", request.File.Id);
                    insertCmd.Parameters.AddWithValue("@TopicId", topic.Id);
                    insertCmd.Parameters.AddWithValue("@UserId", request.UserId);
                    await insertCmd.ExecuteNonQueryAsync();
                  }
                }
              }

              // Commit the transaction
              await transaction.CommitAsync();
              return Ok("File topics updated successfully.");
            }
            catch (Exception ex)
            {
              _ = _log.Db("An error occurred while editing file topics." + ex.Message, null, "FILE", true);
              await transaction.RollbackAsync();
              throw;
            }
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while editing file topics." + ex.Message, null, "FILE", true);
        return StatusCode(500, "An error occurred while editing file topics.");
      }
    }

    [HttpPost("/File/NotifyFollowersFileUploaded/", Name = "NotifyFollowersFileUploaded")]
    public async Task<bool> NotifyFollowersFileUploaded(NotifyFollowersRequest req)
    {
      if (req.UserId == 0) return false;

      try
      {
        using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await conn.OpenAsync();

          // Get all followers (friends + pending requests)
          string sql = @"
						-- Users who are friends with the poster
						SELECT friend_id AS follower_id FROM friends WHERE user_id = @userId
						UNION
						-- Users who have pending friend requests from the poster
						-- SELECT receiver_id AS follower_id FROM friend_requests 
						-- WHERE sender_id = @userId AND (status = 'pending' OR status = 'deleted')
						-- UNION
						-- Users who the poster has pending friend requests from
						SELECT sender_id AS follower_id FROM friend_requests 
						WHERE receiver_id = @userId AND (status = 'pending' OR status = 'deleted')";

          var followerIds = new List<int>();

          using (var cmd = new MySqlCommand(sql, conn))
          {
            cmd.Parameters.AddWithValue("@userId", req.UserId);

            using (var rdr = await cmd.ExecuteReaderAsync())
            {
              while (await rdr.ReadAsync())
              {
                followerIds.Add(rdr.GetInt32("follower_id"));
              }
            }
          }

          // Filter out followers who have blocked notifications
          var validFollowerIds = new List<int>();
          foreach (var followerId in followerIds)
          {
            if (await CanUserNotifyAsync(req.UserId, followerId))
            {
              //Console.WriteLine("Notifying user : " + followerId);
              validFollowerIds.Add(followerId);
            }
            else
            {
              _ = _log.Db($"Skipping notification to {followerId} - notifications blocked", req.UserId, "FILE");
            }
          }

          // Insert notifications for each valid follower
          if (validFollowerIds.Count > 0)
          {
            string notificationText = $"New {(req.FileCount > 0 ? $"({req.FileCount})" : "")} file{(req.FileCount > 1 ? "s" : "")} uploaded.";
            string insertSql = @"
                    INSERT INTO notifications 
                    (user_id, from_user_id, file_id, text, date, is_read) 
                    VALUES (@userId, @fromUserId, @fileId, @text, UTC_TIMESTAMP(), 0)";

            foreach (var followerId in validFollowerIds)
            {
              using (var insertCmd = new MySqlCommand(insertSql, conn))
              {
                insertCmd.Parameters.AddWithValue("@userId", followerId);
                insertCmd.Parameters.AddWithValue("@fromUserId", req.UserId);
                insertCmd.Parameters.AddWithValue("@fileId", req.FileId);
                insertCmd.Parameters.AddWithValue("@text", notificationText);

                await insertCmd.ExecuteNonQueryAsync();
              }
            }

            // Send push notifications (if implemented)
            await SendFileUploadPushNotifications(req.UserId, validFollowerIds, req.FileId, notificationText);
          }

          Console.WriteLine($"Notified {validFollowerIds.Count} followers");
          return true;
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error in NotifyFollowersFileUploaded: {ex.Message}", req.UserId, "FILE", true);
        return false;
      }
    }

    private async Task SendFileUploadPushNotifications(int fromUserId, List<int> followerIds, int fileId, string message)
    {
      foreach (var followerId in followerIds)
      {
        try
        {
          var firebaseMessage = new Message()
          {
            Notification = new FirebaseAdmin.Messaging.Notification()
            {
              Title = $"New File Uploaded by UserId: {fromUserId}",
              Body = message,
              ImageUrl = "https://www.bughosted.com/assets/logo.jpg"
            },
            Data = new Dictionary<string, string>
            {
              { "fileId", fileId.ToString() },
              { "fromUserId", fromUserId.ToString() },
              { "type", "file_upload" }
            },
            Topic = $"notification{followerId}"
          };

          string response = await FirebaseMessaging.DefaultInstance.SendAsync(firebaseMessage);
          Console.WriteLine($"Sent push notification to user {followerId}, topic: {firebaseMessage.Topic}.");
        }
        catch (Exception ex)
        {
          _ = _log.Db($"Failed to send push notification to {followerId}: {ex.Message}", fromUserId, "FILE");
        }
      }
    }
    public async Task<bool> CanUserNotifyAsync(int senderId, int recipientId)
    {
      MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      try
      {
        await conn.OpenAsync();

        string sql = @"
					SELECT COUNT(*) 
					FROM maxhanna.user_prevent_notification 
					WHERE user_id = @RecipientId 
					AND from_user_id = @SenderId
					LIMIT 1";

        MySqlCommand cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@RecipientId", recipientId);
        cmd.Parameters.AddWithValue("@SenderId", senderId);

        long? count = (long?)await cmd.ExecuteScalarAsync();
        return count == 0; // Returns true if no blocking record exists (can notify)
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error checking notification permission: {ex.Message}", recipientId, "NOTIFICATION");
        return true; // Default to allowing notifications if there's an error
      }
      finally
      {
        await conn.CloseAsync();
      }
    }
    private bool IsWebPFile(IFormFile file)
    {
      var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
      return fileExtension.ToLower() == ".webp";
    }
    private bool IsWebMFile(IFormFile file)
    {
      var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
      return fileExtension.ToLower() == ".webm";
    }
    private bool IsImageFile(IFormFile file)
    {
      var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".bmp", ".gif" };
      var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
      return allowedExtensions.Contains(fileExtension);
    }
    private bool IsGifFile(IFormFile file)
    {
      var allowedExtensions = new[] { ".gif" };
      var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
      return allowedExtensions.Contains(fileExtension);
    }
    private bool IsAudioFile(IFormFile file)
    {
      var allowedExtensions = new[] { ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus" };
      var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
      return allowedExtensions.Contains(fileExtension);
    }
    private bool IsVideoFileFromExtensionString(string? fileExtension)
    {
      if (string.IsNullOrWhiteSpace(fileExtension)) return false;
      string[] videoExtensions = { "mp4", "webm", "avi", "mov", "mkv", "flv" };
      return videoExtensions.Contains(fileExtension.ToLower());
    }
    private bool IsVideoFile(IFormFile file)
    {
      var allowedExtensions = new[] { ".mp4", ".avi", ".mov", ".wmv", ".flv", ".mkv" };
      var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
      return allowedExtensions.Contains(fileExtension);
    }
    // Basic fallback dimension reader (used when FFmpeg probing fails and we only need width/height)
    private (int? width, int? height) GetBasicImageDimensions(string path)
    {
      try
      {
        var info = SixLabors.ImageSharp.Image.Identify(path);
        if (info != null)
        {
          return (info.Width, info.Height);
        }
      }
      catch { }
      return (null, null);
    }
    private async Task<string> ConvertAudioToOpusMP4(IFormFile file, string uploadDirectory)
    {
      var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
      var opusConvertedFileName = $"{fileNameWithoutExtension}.opus";
      var opusConvertedFilePath = Path.Combine(uploadDirectory, opusConvertedFileName);
      var mp4ConvertedFileName = $"{fileNameWithoutExtension}.mp4";
      var mp4ConvertedFilePath = Path.Combine(uploadDirectory, mp4ConvertedFileName);
      var inputFilePath = Path.Combine(uploadDirectory, file.FileName);

      try
      {
        // Save the input file temporarily
        using (var stream = new FileStream(inputFilePath, FileMode.Create))
        {
          await file.CopyToAsync(stream);
        }

        var beforeFileSize = new FileInfo(inputFilePath).Length;

        // Convert to Opus
        var opusConversion = FFmpeg.Conversions.New()
            .AddParameter($"-i \"{inputFilePath}\"")
            .AddParameter("-c:a libopus")
            .AddParameter("-b:a 128k")
            .SetOutput(opusConvertedFilePath);
        await opusConversion.Start();

        // Verify Opus conversion success
        if (!System.IO.File.Exists(opusConvertedFilePath))
        {
          throw new FileNotFoundException("Opus conversion failed or output file not found.");
        }

        // Convert Opus to MP4
        var mp4Conversion = FFmpeg.Conversions.New()
            .AddParameter($"-i \"{opusConvertedFilePath}\"")
            .SetOutput(mp4ConvertedFilePath);
        await mp4Conversion.Start();

        var afterFileSize = new FileInfo(mp4ConvertedFilePath).Length;
        _ = _log.Db($"Audio conversion completed: before [fileName={file.FileName}, fileSize={beforeFileSize} bytes] after [fileName={mp4ConvertedFileName}, fileSize={afterFileSize} bytes]", null, "FILE", true);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error occurred during audio conversion. " + ex.Message, null, "FILE", true);
      }
      finally
      {
        var beforeFileSize = new FileInfo(inputFilePath).Length;
        var afterFileSize = new FileInfo(mp4ConvertedFilePath).Length;

        if (System.IO.File.Exists(opusConvertedFilePath))
        {
          System.IO.File.Delete(opusConvertedFilePath);
        }
        if (beforeFileSize > afterFileSize)
        {
          System.IO.File.Delete(inputFilePath);
        }
        else
        {
          System.IO.File.Delete(mp4ConvertedFilePath);
          mp4ConvertedFilePath = inputFilePath;
        }
      }
      return mp4ConvertedFilePath;

    }

    private async Task<(string FilePath, int Width, int Height, int Duration)> ConvertGifToWebp(IFormFile file, string uploadDirectory)
    {
      var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
      var convertedFileName = $"{fileNameWithoutExtension}.webp";
      var convertedFilePath = Path.Combine(uploadDirectory, convertedFileName);
      var inputFilePath = Path.Combine(uploadDirectory, file.FileName);
      int width = 0;
      int height = 0;
      int duration = 0;

      try
      {
        using (var stream = new FileStream(inputFilePath, FileMode.Create))
        {
          await file.CopyToAsync(stream);
        }

        var beforeFileSize = new FileInfo(inputFilePath).Length;

        var ffmpegCommand = await FFmpeg.GetMediaInfo(inputFilePath);
        duration = (int)ffmpegCommand.Duration.TotalSeconds;

        var conversion = FFmpeg.Conversions.New()
            .AddParameter($"-i \"{inputFilePath}\"")
            .AddParameter("-c:v libwebp")
            .AddParameter("-lossless 0")
            .AddParameter("-q:v 75")
            .AddParameter("-loop 0")
            .SetOutput(convertedFilePath);

        await conversion.Start();

        var afterFileSize = new FileInfo(convertedFilePath).Length;
        long fileSizeDifference = beforeFileSize - afterFileSize;

        _ = _log.Db($"GIF to WebP conversion: [fileName={file.FileName}, fileType={Path.GetExtension(file.FileName)}, fileSize={beforeFileSize} bytes, compression={fileSizeDifference} bytes]", null, "FILE", true);

        (width, height) = await GetMediaDimensions(convertedFilePath);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error occurred during GIF conversion. " + ex.Message, null, "FILE", true);
      }
      finally
      {
        var beforeFileSize = new FileInfo(inputFilePath).Length;
        var afterFileSize = new FileInfo(convertedFilePath).Length;

        if (beforeFileSize > afterFileSize)
        {
          System.IO.File.Delete(inputFilePath);
        }
        else
        {
          System.IO.File.Delete(convertedFilePath);
          convertedFilePath = inputFilePath;
        }

      }

      return (convertedFilePath, width, height, duration);
    }

    private async Task<(string FilePath, int Width, int Height)> ConvertImageToWebp(IFormFile file, string uploadDirectory)
    {
      var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
      var convertedFileName = $"{fileNameWithoutExtension}.webp";
      var convertedFilePath = Path.Combine(uploadDirectory, convertedFileName);
      var width = 0;
      var height = 0;
      try
      {
        using (var image = await SixLabors.ImageSharp.Image.LoadAsync(file.OpenReadStream()))
        {
          var beforeFileSize = file.Length;

          await image.SaveAsWebpAsync(convertedFilePath);

          var afterFileSize = new FileInfo(convertedFilePath).Length;
          width = image.Width;
          height = image.Height;
          long fileSizeDifference = beforeFileSize - afterFileSize;
          _ = _log.Db($"Image to WebP conversion: [fileName={file.FileName}, fileType={Path.GetExtension(file.FileName)}, fileSize={beforeFileSize} bytes, compression={fileSizeDifference} bytes]", null, "FILE", true);
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error occurred during image conversion. " + ex.Message, null, "FILE", true);
      }

      if (System.IO.File.Exists(convertedFilePath) && width == 0 || height == 0)
      {
        (width, height) = await GetMediaDimensions(convertedFilePath);
      }
      return (convertedFilePath, width, height);
    }

    private async Task<(string FilePath, int Width, int Height, int Duration)> ConvertVideoToWebm(IFormFile file, string uploadDirectory)
    {
      var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
      var convertedFileName = $"{fileNameWithoutExtension}.webm";
      var convertedFilePath = Path.Combine(uploadDirectory, convertedFileName);
      var inputFilePath = Path.Combine(uploadDirectory, file.FileName);
      int width = 0;
      int height = 0;
      int duration = 0;
      try
      {
        using (var stream = new FileStream(inputFilePath, FileMode.Create))
        {
          await file.CopyToAsync(stream);
        }

        var beforeFileSize = new FileInfo(inputFilePath).Length;

        _ = _log.Db("attempting to convert " + inputFilePath, null, "FILE", true);
        var ffmpegCommand = await FFmpeg.GetMediaInfo(inputFilePath);
        duration = (int)ffmpegCommand.Duration.TotalSeconds;

        var res = await FFmpeg.Conversions.FromSnippet.ToWebM(inputFilePath, convertedFilePath);
        await res.Start();

        var afterFileSize = new FileInfo(convertedFilePath).Length;
        var ffProbe = await FFmpeg.GetMediaInfo(inputFilePath);
        var videoStream = ffProbe.VideoStreams.FirstOrDefault();

        if (videoStream != null)
        {
          width = videoStream.Width;
          height = videoStream.Height;
        }
        long fileSizeDifference = beforeFileSize - afterFileSize;
        _ = _log.Db($"Video to WebM conversion: [fileName={file.FileName}, fileType={Path.GetExtension(file.FileName)}, fileSize={afterFileSize} bytes, compressed={fileSizeDifference} bytes]", null, "FILE", true);
        if (beforeFileSize > afterFileSize)
        {
          System.IO.File.Delete(inputFilePath);
        }
        else
        {
          System.IO.File.Delete(convertedFilePath);
          convertedFilePath = inputFilePath;
        }

      }
      catch (Exception ex)
      {
        if (ex.Message.Contains(" already exists. Exiting."))
        {
          _ = _log.Db("Converted file already exists, Returning converted file", null, "FILE", true);
        }
        else if (System.IO.File.Exists(inputFilePath))
        {
          convertedFilePath = inputFilePath;
          _ = _log.Db("Error occurred during video conversion. Returning Unconverted file", null, "FILE", true);
        }
        _ = _log.Db("Error occurred during video conversion.", null, "FILE", true);
      }

      if (System.IO.File.Exists(convertedFilePath) && width == 0 || height == 0)
      {
        (width, height) = await GetMediaDimensions(convertedFilePath);
      }
      return (convertedFilePath, width, height, duration);
    }
    private async Task<(int Width, int Height)> GetMediaDimensions(string filePath)
    {
      try
      {
        var probe = await FFmpeg.GetMediaInfo(filePath);
        var videoStream = probe.VideoStreams.FirstOrDefault();
        if (videoStream != null)
        {
          return (videoStream.Width, videoStream.Height);
        }
        return (0, 0);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error getting media dimensions, " + ex.Message, null, "FILE", true);
        return (0, 0);
      }
    }

    private async Task InsertDirectoryMetadata(int userId, string directoryPath, bool isPublic)
    {
      using (var connection = new MySqlConnection(_connectionString))
      {
        await connection.OpenAsync();
        var directoryName = (Path.GetFileName(Path.GetDirectoryName(directoryPath.TrimEnd('/'))) ?? "").Replace("\\", "/");
        var directoryPathTrimmed = (Path.GetDirectoryName(directoryPath.TrimEnd('/')) ?? "").Replace("\\", "/").TrimEnd('/') + '/';
        var command = new MySqlCommand(
            @$"INSERT INTO maxhanna.file_uploads 
                    (user_id, file_name, upload_date, folder_path, is_public, is_folder, file_size) 
                VALUES 
                    (@user_id, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder, @file_size);"
        , connection);
        command.Parameters.AddWithValue("@user_id", userId);
        command.Parameters.AddWithValue("@fileName", directoryName);
        command.Parameters.AddWithValue("@uploadDate", DateTime.UtcNow);
        command.Parameters.AddWithValue("@folderPath", directoryPathTrimmed);
        command.Parameters.AddWithValue("@isPublic", isPublic);
        command.Parameters.AddWithValue("@isFolder", true);
        command.Parameters.AddWithValue("@file_size", 0);

        await command.ExecuteScalarAsync();
        _ = _log.Db($"Uploaded folder: {directoryName}, Path: {directoryPath}", userId, "FILE", true);
      }
    }

    private async Task<int> InsertFileIntoDB(int userId, IFormFile file, string uploadDirectory, bool isPublic, string convertedFilePath, int? width, int? height, int? duration)
    {
      using (var connection = new MySqlConnection(_connectionString))
      {
        await connection.OpenAsync();

        string fileName = Path.GetFileName(convertedFilePath);
        long fileSize = new FileInfo(convertedFilePath).Length;
        DateTime uploadDate = DateTime.UtcNow;

        var command = new MySqlCommand(
        @"INSERT IGNORE INTO maxhanna.file_uploads 
            (user_id, file_name, upload_date, folder_path, is_public, is_folder, file_size, width, height, last_updated, last_updated_by_user_id, duration)  
          VALUES 
            (@user_id, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder, @file_size, @width, @height, @uploadDate, @user_id, @duration); 
          SELECT LAST_INSERT_ID();", connection);

        command.Parameters.AddWithValue("@user_id", userId);
        command.Parameters.AddWithValue("@fileName", fileName);
        command.Parameters.AddWithValue("@uploadDate", uploadDate);
        command.Parameters.AddWithValue("@folderPath", uploadDirectory ?? "");
        command.Parameters.AddWithValue("@isPublic", isPublic);
        command.Parameters.AddWithValue("@width", width);
        command.Parameters.AddWithValue("@height", height);
        command.Parameters.AddWithValue("@isFolder", false);
        command.Parameters.AddWithValue("@file_size", fileSize);
        command.Parameters.AddWithValue("@duration", duration);

        var fileId = await command.ExecuteScalarAsync();
        int newFileId = Convert.ToInt32(fileId);

        if (newFileId == 0) // Means INSERT was ignored, so fetch the existing ID
        {
          _ = _log.Db("Ignoring, file already exists: " + fileName, userId, "FILE", true);
          var fetchCommand = new MySqlCommand(
              @"SELECT id FROM maxhanna.file_uploads 
                  WHERE user_id = @user_id AND file_name = @fileName 
                  LIMIT 1;", connection);

          fetchCommand.Parameters.AddWithValue("@user_id", userId);
          fetchCommand.Parameters.AddWithValue("@fileName", fileName);

          var existingFileId = await fetchCommand.ExecuteScalarAsync();
          return Convert.ToInt32(existingFileId ?? 0); // Return existing ID
        }

        return newFileId; // Return new ID if inserted
      }
    }


    private FileEntry CreateFileEntry(IFormFile file, int userId, bool isPublic, int fileId, string filePath, string uploadDirectory, int? height, int? width, int? duration)
    {
      return new FileEntry
      {
        Id = fileId,
        FileName = Path.GetFileName(filePath),
        Directory = uploadDirectory,
        Visibility = isPublic ? "Public" : "Private",
        User = new User(userId),
        IsFolder = false,
        FileComments = new List<FileComment>(),
        Date = DateTime.UtcNow,
        SharedWith = string.Empty,
        FileType = Path.GetExtension(filePath).TrimStart('.'),
        FileSize = (int)new FileInfo(filePath).Length,
        Height = height,
        Width = width,
        Duration = duration,
      };
    }
    private async Task<FileEntry?> GetConflictingFile(int userId, IFormFile file, string folderPath, bool isPublic)
    {
      var convertedFileName = "";
      if (IsImageFile(file))
      {
        var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
        convertedFileName = $"{fileNameWithoutExtension}.webp";
      }
      else if (IsVideoFile(file))
      {
        var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
        convertedFileName = $"{fileNameWithoutExtension}.webm";
      }

      //_ = _log.Db("Checking for duplicated files : " + (!string.IsNullOrEmpty(convertedFileName) ? convertedFileName : file.FileName));

      using (var connection = new MySqlConnection(_connectionString))
      {
        await connection.OpenAsync();

        var command = new MySqlCommand(
            @"SELECT 
                        f.id AS fileId, 
                        f.file_name, 
                        f.folder_path, 
                        f.file_type, 
                        f.is_public, 
                        f.is_folder, 
                        f.width, 
                        f.height, 
                        f.file_size, 
                        f.user_id, 
                        u.username AS username, 
                        f.shared_with,  
                        f.upload_date AS date, 
                        fc.id AS commentId, 
                        fc.user_id AS commentUserId, 
                        uc.username AS commentUsername,  
                        fc.comment AS commentText,  
                        f.given_file_name,
                        f.description,
                        f.last_updated as file_data_updated,
                        f.last_access as last_access,
						udp.file_id AS commentUserDisplayPicId,
						udp.tag_background_file_id AS commentUserDisplayPicId
                    FROM 
                        maxhanna.file_uploads f    
                    LEFT JOIN 
                        maxhanna.comments fc ON fc.file_id = f.id 
                    LEFT JOIN 
                        maxhanna.users u ON u.id = f.user_id 
                    LEFT JOIN 
                        maxhanna.users uc ON fc.user_id = uc.id   
					LEFT JOIN 
							maxhanna.user_display_pictures udp ON udp.user_id = uc.id
                    WHERE 
                        (f.file_name = @fileName OR f.file_name = @originalFileName)
                        AND f.folder_path = @folderPath 
                        AND (
                            f.is_public = @isPublic OR 
                            f.user_id = @userId OR 
                            FIND_IN_SET(@userId, f.shared_with) > 0
                        ) 
                    GROUP BY 
                        f.id, u.username, f.file_name, f.folder_path, f.file_type, f.is_public, f.is_folder, f.user_id, fc.id, uc.username, fc.comment, f.given_file_name, f.description, f.last_updated, udp.file_id 
                    LIMIT 1;",
            connection);

        command.Parameters.AddWithValue("@userId", userId);
        command.Parameters.AddWithValue("@fileName", !string.IsNullOrEmpty(convertedFileName) ? convertedFileName : file.FileName);
        command.Parameters.AddWithValue("@originalFileName", file.FileName);
        command.Parameters.AddWithValue("@folderPath", folderPath);
        command.Parameters.AddWithValue("@isPublic", isPublic);

        using (var reader = await command.ExecuteReaderAsync())
        {
          if (await reader.ReadAsync())
          {
            var id = reader.GetInt32("fileId");
            var user_id = reader.GetInt32("user_id");
            var userName = reader.GetString("username");
            var fileType = reader.IsDBNull(reader.GetOrdinal("file_type")) ? string.Empty : reader.GetString("file_type");
            var shared_with = reader.IsDBNull(reader.GetOrdinal("shared_with")) ? string.Empty : reader.GetString("shared_with");
            int? width = reader.IsDBNull(reader.GetOrdinal("width")) ? null : reader.GetInt32("width");
            int? height = reader.IsDBNull(reader.GetOrdinal("height")) ? null : reader.GetInt32("height");
            int fileSize = reader.IsDBNull(reader.GetOrdinal("file_size")) ? 0 : reader.GetInt32("file_size");
            var isFolder = reader.GetBoolean("is_folder");
            var lastAccess = reader.GetDateTime("last_access");

            var date = reader.GetDateTime("date");


            var fileEntry = new FileEntry();
            fileEntry.Id = id;
            fileEntry.FileName = !string.IsNullOrEmpty(convertedFileName) ? convertedFileName : file.FileName;
            fileEntry.Visibility = isPublic ? "Public" : "Private";
            fileEntry.SharedWith = shared_with;
            fileEntry.User = new User(user_id, userName);
            fileEntry.IsFolder = isFolder;
            fileEntry.FileType = fileType;
            fileEntry.FileComments = new List<FileComment>();
            fileEntry.Date = date;
            fileEntry.GivenFileName = reader.IsDBNull(reader.GetOrdinal("given_file_name")) ? null : reader.GetString("given_file_name");
            fileEntry.Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description");
            fileEntry.LastUpdated = reader.IsDBNull(reader.GetOrdinal("file_data_updated")) ? null : reader.GetDateTime("file_data_updated");

            fileEntry.Width = width;
            fileEntry.Height = height;
            fileEntry.FileSize = fileSize;
            fileEntry.LastAccess = lastAccess;


            if (!reader.IsDBNull(reader.GetOrdinal("commentId")))
            {
              do
              {
                var commentId = reader.GetInt32("commentId");
                var commentUserId = reader.GetInt32("commentUserId");
                var commentUsername = reader.GetString("commentUsername");
                var commentText = reader.GetString("commentText");

                int? displayPicId = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicId")) ? null : reader.GetInt32("commentUserDisplayPicId");
                FileEntry? dpFileEntry = displayPicId != null ? new FileEntry() { Id = (Int32)(displayPicId) } : null;

                int? backgroundPicId = reader.IsDBNull(reader.GetOrdinal("commentUserBackgroundPicId")) ? null : reader.GetInt32("commentUserBackgroundPicId");
                FileEntry? bgFileEntry = backgroundPicId != null ? new FileEntry() { Id = (Int32)(backgroundPicId) } : null;

                var fileComment = new FileComment
                {
                  Id = commentId,
                  FileId = id,
                  User = new User(
                        commentUserId,
                        commentUsername ?? "Anonymous",
                        null,
                        displayPicId != null ? dpFileEntry : null,
                        bgFileEntry != null ? bgFileEntry : null,
                        null, null, null),
                  CommentText = commentText,
                };

                fileEntry.FileComments!.Add(fileComment);
              } while (await reader.ReadAsync());
            }

            return fileEntry;
          }
        }
      }
      return null;
    }

    [HttpPost("/File/Hide/", Name = "HideFile")]
    public async Task<IActionResult> HideFile([FromBody] HideFileRequest request)
    {
      try
      {
        using (var connection = new MySqlConnection(_connectionString))
        {
          await connection.OpenAsync();
          using (var transaction = await connection.BeginTransactionAsync())
          {
            var checkCommand = new MySqlCommand(
              "SELECT COUNT(*) FROM maxhanna.hidden_files WHERE user_id = @userId AND file_id = @fileId",
              connection, transaction);
            checkCommand.Parameters.AddWithValue("@userId", request.UserId);
            checkCommand.Parameters.AddWithValue("@fileId", request.FileId);

            var isHidden = Convert.ToInt32(await checkCommand.ExecuteScalarAsync()) > 0;

            if (isHidden)
            {
              var unhideCommand = new MySqlCommand(
                "DELETE FROM maxhanna.hidden_files WHERE user_id = @userId AND file_id = @fileId",
                connection, transaction);
              unhideCommand.Parameters.AddWithValue("@userId", request.UserId);
              unhideCommand.Parameters.AddWithValue("@fileId", request.FileId);

              await unhideCommand.ExecuteNonQueryAsync();
              _ = _log.Db($"File {request.FileId} unhidden for user {request.UserId}", request.UserId, "FILE");
            }
            else
            {
              var hideCommand = new MySqlCommand(
                "INSERT INTO maxhanna.hidden_files (user_id, file_id) VALUES (@userId, @fileId)",
                connection, transaction);
              hideCommand.Parameters.AddWithValue("@userId", request.UserId);
              hideCommand.Parameters.AddWithValue("@fileId", request.FileId);

              await hideCommand.ExecuteNonQueryAsync();
              _ = _log.Db($"File {request.FileId} hidden for user {request.UserId}", request.UserId, "FILE");
            }

            await transaction.CommitAsync();

            return Ok(isHidden ? "File unhidden successfully." : "File hidden successfully.");
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while toggling file visibility. " + ex.Message, request.UserId, "FILE", true);
        return StatusCode(500, "An error occurred while toggling file visibility.");
      }
    }

    [HttpPost("/File/Unhide/", Name = "UnhideFile")]
    public async Task<IActionResult> UnhideFile([FromBody] HideFileRequest request)
    {
      try
      {
        using (var connection = new MySqlConnection(_connectionString))
        {
          await connection.OpenAsync();
          using (var transaction = await connection.BeginTransactionAsync())
          {
            // Remove from hidden_files table (no permission check)
            var unhideCommand = new MySqlCommand(
                "DELETE FROM maxhanna.hidden_files WHERE user_id = @userId AND file_id = @fileId",
                connection, transaction);
            unhideCommand.Parameters.AddWithValue("@userId", request.UserId);
            unhideCommand.Parameters.AddWithValue("@fileId", request.FileId);

            await unhideCommand.ExecuteNonQueryAsync();

            // Commit transaction
            await transaction.CommitAsync();
          }
        }

        _ = _log.Db($"File {request.FileId} unhidden successfully for user {request.UserId}", request.UserId, "FILE");
        return Ok("File unhidden successfully.");
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while unhiding the file. " + ex.Message, request.UserId, "FILE", true);
        return StatusCode(500, "An error occurred while unhiding the file.");
      }
    }

    [HttpDelete("/File/Delete/", Name = "DeleteFileOrDirectory")]
    public async Task<IActionResult> DeleteFileOrDirectory([FromBody] DeleteFileOrDirectory request)
    {
      // Ensure baseTarget ends with a forward slash
      string filePath;

      try
      {
        using (var connection = new MySqlConnection(_connectionString))
        {
          connection.Open();
          _ = _log.Db($"Opened connection to database for deleting file or directory with id {request.file.Id}", request.userId, "FILE", true);

          using (var transaction = connection.BeginTransaction())
          {
            // Check for ownership
            var ownershipCommand = new MySqlCommand(
                "SELECT user_id, file_name, folder_path, is_folder, shared_with FROM maxhanna.file_uploads WHERE id = @fileId",
                connection, transaction);
            ownershipCommand.Parameters.AddWithValue("@fileId", request.file.Id);

            var ownershipReader = ownershipCommand.ExecuteReader();
            if (!ownershipReader.Read())
            {
              _ = _log.Db($"File or directory with id {request.file.Id} not found.", request.userId, "FILE", true);
              return NotFound("File or directory not found.");
            }

            var userId = ownershipReader.GetInt32("user_id");
            var sharedWith = ownershipReader.IsDBNull(ownershipReader.GetOrdinal("shared_with")) ? string.Empty : ownershipReader.GetString("shared_with");

            if (!sharedWith.Split(',').Contains(request.userId.ToString())
               && userId != request.userId && request.userId != 1)
            {
              _ = _log.Db($"User {request.userId} does not have ownership of {request.file.FileName}", request.userId, "FILE", true);
              return StatusCode(409, "You do not have permission to delete this file or directory.");
            }

            var fileName = ownershipReader.GetString("file_name");
            var folderPath = ownershipReader.GetString("folder_path").Replace("\\", "/").TrimEnd('/') + "/";
            var isFolder = ownershipReader.GetBoolean("is_folder");

            filePath = Path.Combine(_baseTarget, folderPath.TrimStart('/'), fileName).Replace("\\", "/");
            ownershipReader.Close();

            if (!ValidatePath(filePath, forDelete: true)) { return BadRequest($"Cannot delete: {filePath}"); }

            _ = _log.Db($"User {request.userId} has ownership. Proceeding with deletion. File Path: {filePath}", request.userId, "FILE", true);

            // Proceed with deletion if ownership is confirmed
            if (isFolder)
            {
              if (Directory.Exists(filePath))
              {
                Directory.Delete(filePath, true);
                _ = _log.Db($"Directory deleted at {filePath}", null, "FILE", true);
              }
              else
              {
                _ = _log.Db($"Directory not found at {filePath}", null, "FILE", true);
              }

              if (filePath.TrimEnd('/') + "/" != _baseTarget.TrimEnd('/') + "/")
              {
                var innerDeleteCommand = new MySqlCommand(
                    "DELETE FROM maxhanna.file_uploads WHERE folder_path LIKE CONCAT(@FolderPath, '%')",
                    connection, transaction);
                innerDeleteCommand.Parameters.AddWithValue("@FolderPath", filePath.TrimEnd('/') + "/");
                //_ = _log.Db(innerDeleteCommand.CommandText);
                innerDeleteCommand.ExecuteNonQuery();
              }
            }
            else
            {
              if (System.IO.File.Exists(filePath))
              {
                System.IO.File.Delete(filePath);
                _ = _log.Db($"File deleted at {filePath}", request.userId, "FILE", true);
              }
              else
              {
                _ = _log.Db($"File not found at {filePath}", request.userId, "FILE", true);
              }
            }

            var deleteCommand = new MySqlCommand(
                "DELETE FROM maxhanna.file_uploads WHERE id = @fileId",
                connection, transaction);
            deleteCommand.Parameters.AddWithValue("@fileId", request.file.Id);
            deleteCommand.ExecuteNonQuery();

            _ = _log.Db($"Record deleted from database for file or directory with id {request.file.Id}", request.userId, "FILE", true);

            // Commit transaction
            transaction.Commit();
          }
        }
        if (!request.file.IsFolder)
        {
          await RemoveFromSitemapAsync(request.file.Id);
        }
        _ = _log.Db($"File or directory deleted successfully at {filePath}", request.userId, "FILE", true);
        return Ok("File or directory deleted successfully.");
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while deleting file or directory." + ex.Message, request.userId, "FILE", true);
        return StatusCode(500, "An error occurred while deleting file or directory.");
      }
    }


    [HttpPost("/File/MassDelete/", Name = "MassDelete")]
    public async Task<IActionResult> MassDelete([FromBody] MassDeleteRequest request)
    {
      var results = new List<object>();
      foreach (var id in request.FileIds ?? new List<int>())
      {
        try
        {
          var delRes = await DeleteFileOrDirectory(new DeleteFileOrDirectory(request.UserId, new FileEntry { Id = id }));
          if (delRes is ObjectResult obj)
          {
            results.Add(new { FileId = id, Status = obj.StatusCode ?? 200, Value = obj.Value?.ToString() });
          }
          else if (delRes is StatusCodeResult sc)
          {
            results.Add(new { FileId = id, Status = sc.StatusCode });
          }
          else
          {
            results.Add(new { FileId = id, Status = 200 });
          }
        }
        catch (Exception ex)
        {
          results.Add(new { FileId = id, Status = 500, Error = ex.Message });
        }
      }
      return Ok(results);
    }
    [HttpPost("/File/Move/", Name = "MoveFile")]
    public async Task<IActionResult> MoveFile([FromBody] MoveFileRequest request)
    {
      try
      {
        // Read inputFile and destinationFolder from request body and decode
        var inputFile = (request.InputFile ?? "").TrimStart('/');
        var destinationFolder = (request.DestinationFolder ?? "").TrimStart('/');

        // If a fileId was provided, look up the exact folder_path and file_name from DB to avoid relying on client-provided filename
        string resolvedInputPath = string.Empty;
        if (request?.FileId != null && request.FileId > 0)
        {
          using var conn = new MySqlConnection(_connectionString);
          conn.Open();
          var cmd = new MySqlCommand("SELECT folder_path, file_name, is_folder FROM maxhanna.file_uploads WHERE id = @fileId LIMIT 1", conn);
          cmd.Parameters.AddWithValue("@fileId", request.FileId.Value);
          using var rdr = cmd.ExecuteReader();
          if (rdr.Read())
          {
            var folder = rdr.IsDBNull("folder_path") ? "" : rdr.GetString("folder_path").Replace("\\", "/").TrimStart('/');
            var fileName = rdr.IsDBNull("file_name") ? "" : rdr.GetString("file_name");
            var isFolder = rdr.IsDBNull("is_folder") ? false : rdr.GetBoolean("is_folder");
            resolvedInputPath = Path.Combine(_baseTarget, folder, fileName).Replace("\\", "/");
          }
          rdr.Close();
        }

        // Fallback to the client-provided inputFile query if we couldn't resolve by id
        if (string.IsNullOrEmpty(resolvedInputPath))
        {
          resolvedInputPath = Path.Combine(_baseTarget, inputFile).Replace("\\", "/");
        }

        var resolvedDestination = Path.Combine(_baseTarget, destinationFolder ?? "").Replace("\\", "/");

        if (!ValidatePath(resolvedInputPath) || !ValidatePath(resolvedDestination))
        {
          _ = _log.Db($"Invalid path: inputFile = {resolvedInputPath}, destinationFolder = {resolvedDestination}", null, "FILE", true);
          return NotFound("Invalid path.");
        }

        // Use the fileId for permission check if provided, otherwise fall back to path-based check
        if (request?.FileId != null && request.FileId > 0)
        {
          // Verify the caller is the owner
          using var conn2 = new MySqlConnection(_connectionString);
          conn2.Open();
          var checkCmd = new MySqlCommand("SELECT user_id FROM maxhanna.file_uploads WHERE id = @fileId LIMIT 1", conn2);
          checkCmd.Parameters.AddWithValue("@fileId", request.FileId.Value);
          var owner = checkCmd.ExecuteScalar();
          int ownerId = owner == null || owner == DBNull.Value ? 0 : Convert.ToInt32(owner);
          if (request.UserId != 1 && ownerId != request.UserId)
          {
            _ = _log.Db($"Cannot move file id {request.FileId}. Insufficient Privileges for user {request.UserId}.", request.UserId, "FILE", true);
            return NotFound("Cannot move file.");
          }
        }
        else
        {
          if (!CanMoveFile(resolvedInputPath, request?.UserId ?? 0))
          {
            _ = _log.Db($"Cannot move file: {resolvedInputPath} to {resolvedDestination}. Insufficient Privileges.", request?.UserId ?? 0, "FILE", true);
            return NotFound("Cannot move file.");
          }
        }

        if (System.IO.File.Exists(resolvedInputPath))
        {
          string fileName = Path.GetFileName(resolvedInputPath).Replace("\\", "/");
          string newFilePath = Path.Combine(resolvedDestination, fileName).Replace("\\", "/");
          System.IO.File.Move(resolvedInputPath, newFilePath);

          await UpdateFilePathInDatabase(resolvedInputPath, newFilePath);

          _ = _log.Db($"File moved from {resolvedInputPath} to {newFilePath}", null, "FILE", true);
          return Ok("File moved successfully.");
        }
        else if (Directory.Exists(resolvedInputPath))
        {
          MoveDirectory(resolvedInputPath, resolvedDestination);

          await UpdateDirectoryPathInDatabase(resolvedInputPath, resolvedDestination);

          _ = _log.Db($"Directory moved from {resolvedInputPath} to {resolvedDestination}", null, "FILE", true);
          return Ok("Directory moved successfully.");
        }
        else
        {
          _ = _log.Db($"Input file or directory not found at {resolvedInputPath}", null, "FILE", true);
          return NotFound("Input file or directory not found.");
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while moving the file or directory." + ex.Message, null, "FILE", true);
        return StatusCode(500, "An error occurred while moving the file or directory.");
      }
    }

    [HttpPost("/File/Share/{fileId}", Name = "ShareFile")]
    public async Task<IActionResult> ShareFileRequest([FromBody] ShareFileRequest request, int fileId)
    {
      _ = _log.Db($"GET /File/Share/{fileId} (for user: {request.User1Id} to user: {request.User2Id})", null, "FILE", true);

      string updateSql = @"
                UPDATE maxhanna.file_uploads 
                SET shared_with = 
                    CASE 
                        WHEN shared_with IS NULL OR shared_with = '' THEN @user2id
                        ELSE CONCAT(shared_with, ',', @user2id) 
                    END 
                WHERE id = @fileId 
                AND (
                    shared_with IS NULL 
                    OR NOT FIND_IN_SET(@user2id, shared_with)
                )";

      string selectSql = "SELECT id, folder_path FROM maxhanna.file_uploads WHERE id = @fileId";

      try
      {
        using (var conn = new MySqlConnection(_connectionString))
        {
          await conn.OpenAsync();

          // Find the file's path
          string? filePath = null;
          using (var selectCmd = new MySqlCommand(selectSql, conn))
          {
            selectCmd.Parameters.AddWithValue("@fileId", fileId);
            using (var reader = await selectCmd.ExecuteReaderAsync())
            {
              if (await reader.ReadAsync())
              {
                filePath = reader["folder_path"].ToString();
              }
            }
          }

          if (filePath == null)
          {
            _ = _log.Db("Returned 500: File path not found", null, "FILE", true);
            return StatusCode(500, "File path not found");
          }

          // List to keep track of all ids to be updated
          List<int> idsToUpdate = new List<int> { fileId };

          // Find all parent directories
          while (!string.IsNullOrEmpty(filePath))
          {
            string parentPath = (Path.GetDirectoryName(filePath.TrimEnd('/').Replace("\\", "/")) ?? "").Replace("\\", "/");
            if (!parentPath.EndsWith("/"))
            {
              parentPath += "/";
            }
            string folderName = Path.GetFileName(filePath.TrimEnd('/'));

            if (string.IsNullOrEmpty(parentPath))
            {
              break;
            }

            using (var selectParentCmd = new MySqlCommand("SELECT id FROM maxhanna.file_uploads WHERE folder_path = @parentPath AND file_name = @folderName AND is_folder = 1", conn))
            {
              selectParentCmd.Parameters.AddWithValue("@parentPath", parentPath);
              selectParentCmd.Parameters.AddWithValue("@folderName", folderName);

              using (var reader = await selectParentCmd.ExecuteReaderAsync())
              {
                if (await reader.ReadAsync())
                {
                  idsToUpdate.Add(reader.GetInt32("id"));
                  filePath = parentPath;
                }
                else
                {
                  break;
                }
              }
            }
          }

          // Update all relevant records
          foreach (var id in idsToUpdate)
          {
            using (var updateCmd = new MySqlCommand(updateSql, conn))
            {
              updateCmd.Parameters.AddWithValue("@user2id", request.User2Id);
              updateCmd.Parameters.AddWithValue("@fileId", id);
              await updateCmd.ExecuteNonQueryAsync();
            }
          }
          return Ok();
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while sharing the file. " + ex.Message, request.User1Id, "FILE", true);
        return StatusCode(500, "An error occurred while sharing the file.");
      }
    }

    [HttpPost("/File/GetUserFavorites/{userId}", Name = "GetUserFavorites")]
    public async Task<IActionResult> GetUserFavorites(int userId)
    {
      try
      {
        using (var connection = new MySqlConnection(_connectionString))
        {
          await connection.OpenAsync();

          var command = new MySqlCommand(@"
                    SELECT file_id 
                    FROM file_favourites 
                    WHERE user_id = @user_id",
          connection);
          command.Parameters.AddWithValue("@user_id", userId);

          var favorites = new List<int>();
          using (var reader = await command.ExecuteReaderAsync())
          {
            while (await reader.ReadAsync())
            {
              favorites.Add(reader.GetInt32("file_id"));
            }
          }

          return Ok(favorites);
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"An error occurred while fetching user favorites. {ex.Message}", userId, "FILE", true);
        return StatusCode(500, "An error occurred while fetching favorites.");
      }
    }

    [HttpPost("/File/ToggleFavorite/", Name = "ToggleFavorite")]
    public async Task<IActionResult> ToggleFavorite([FromBody] FavoriteRequest request)
    {
      try
      {
        using (var connection = new MySqlConnection(_connectionString))
        {
          await connection.OpenAsync();

          // First check if the favorite exists
          var checkCommand = new MySqlCommand(@"
                    SELECT COUNT(*) 
                    FROM file_favourites 
                    WHERE user_id = @user_id AND file_id = @file_id",
          connection);
          checkCommand.Parameters.AddWithValue("@user_id", request.UserId);
          checkCommand.Parameters.AddWithValue("@file_id", request.FileId);

          var exists = Convert.ToInt32(await checkCommand.ExecuteScalarAsync()) > 0;

          if (exists)
          {
            // Remove favorite
            var deleteCommand = new MySqlCommand(@"
                        DELETE FROM file_favourites 
                        WHERE user_id = @user_id AND file_id = @file_id",
            connection);
            deleteCommand.Parameters.AddWithValue("@user_id", request.UserId);
            deleteCommand.Parameters.AddWithValue("@file_id", request.FileId);

            await deleteCommand.ExecuteNonQueryAsync();
            _ = _log.Db($"Removed file {request.FileId} from favorites for user {request.UserId}", request.UserId, "FILE", true);
            return Ok(new { action = "removed" });
          }
          else
          {
            // Add favorite
            var insertCommand = new MySqlCommand(@"
                        INSERT INTO file_favourites (user_id, file_id)
                        VALUES (@user_id, @file_id)",
            connection);
            insertCommand.Parameters.AddWithValue("@user_id", request.UserId);
            insertCommand.Parameters.AddWithValue("@file_id", request.FileId);

            await insertCommand.ExecuteNonQueryAsync();
            _ = _log.Db($"Added file {request.FileId} to favorites for user {request.UserId}", request.UserId, "FILE", true);
            return Ok(new { action = "added" });
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"An error occurred while toggling favorite. {ex.Message}", request.UserId, "FILE", true);
        return StatusCode(500, "An error occurred while toggling favorite.");
      }
    }


    private async Task UpdateFilePathInDatabase(string oldFilePath, string newFilePath)
    {

      using (var connection = new MySqlConnection(_connectionString))
      {
        await connection.OpenAsync();

        // Ensure folder paths are standardized (replace backslashes with forward slashes)
        string oldFolderPath = (Path.GetDirectoryName(oldFilePath) ?? "").Replace("\\", "/");
        if (!oldFolderPath.EndsWith("/"))
        {
          oldFolderPath += "/";
        }
        string newFolderPath = (Path.GetDirectoryName(newFilePath) ?? "").Replace("\\", "/");
        if (!newFolderPath.EndsWith("/"))
        {
          newFolderPath += "/";
        }
        string fileName = Path.GetFileName(oldFilePath);

        _ = _log.Db($"Update FilePath in database: oldFolderPath: {oldFolderPath}; newFolderPath: {newFolderPath}; fileName: {fileName}", null, "FILE", true);

        var command = new MySqlCommand(
            "UPDATE maxhanna.file_uploads SET folder_path = @newFolderPath WHERE folder_path = @oldFolderPath AND file_name = @fileName", connection);
        command.Parameters.AddWithValue("@newFolderPath", newFolderPath);
        command.Parameters.AddWithValue("@oldFolderPath", oldFolderPath);
        command.Parameters.AddWithValue("@fileName", fileName);

        await command.ExecuteNonQueryAsync();
      }
    }

    private async Task UpdateDirectoryPathInDatabase(string oldDirectoryPath, string newDirectoryPath)
    {
      using (var connection = new MySqlConnection(_connectionString))
      {
        await connection.OpenAsync();

        // Ensure folder paths are standardized (replace backslashes with forward slashes)
        string standardizedOldPath = Path.GetDirectoryName(oldDirectoryPath)!.Replace("\\", "/");
        if (!standardizedOldPath.EndsWith("/"))
        {
          standardizedOldPath += "/";
        }

        string standardizedNewPath = newDirectoryPath.Replace("\\", "/");
        if (!standardizedNewPath.EndsWith("/"))
        {
          standardizedNewPath += "/";
        }

        // Update paths for all files within the directory
        var command = new MySqlCommand(
            "UPDATE maxhanna.file_uploads SET folder_path = REPLACE(folder_path, @standardOldFolderPath, @newFolderPath) " +
            "WHERE folder_path LIKE CONCAT(@oldFolderPath, '%')", connection);
        command.Parameters.AddWithValue("@standardOldFolderPath", standardizedOldPath);
        command.Parameters.AddWithValue("@oldFolderPath", oldDirectoryPath);
        command.Parameters.AddWithValue("@newFolderPath", standardizedNewPath);

        await command.ExecuteNonQueryAsync();

        string fileName = Path.GetFileName(oldDirectoryPath)!;
        _ = _log.Db($"UpdateDirectoryPathInDatabase: standardizedOldPath: {standardizedOldPath}; standardizedNewPath: {standardizedNewPath}; fileName: {fileName}", null, "FILE", true);

        command = new MySqlCommand(
           "UPDATE maxhanna.file_uploads SET folder_path = @newFolderPath " +
           "WHERE folder_path  = @oldFolderPath AND file_name = @fileName;", connection);
        command.Parameters.AddWithValue("@oldFolderPath", standardizedOldPath);
        command.Parameters.AddWithValue("@newFolderPath", standardizedNewPath);
        command.Parameters.AddWithValue("@fileName", fileName);

        await command.ExecuteNonQueryAsync();
      }
    }

    [HttpPost("/File/Batch/", Name = "ExecuteBatch")]
    public IActionResult ExecuteBatch([FromBody] User user, [FromQuery] string? inputFile)
    {
      string result = "";
      try
      {
        Process p = new Process();
        p.StartInfo.UseShellExecute = false;
        p.StartInfo.RedirectStandardOutput = true;
        p.StartInfo.FileName = _baseTarget + "hello_world.bat";
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
    public static async Task<(int? width, int? height, int? duration)> GetMediaInfo(string filePath)
    {
      var mediaInfo = await FFmpeg.GetMediaInfo(filePath);
      var videoStream = mediaInfo.VideoStreams?.FirstOrDefault();
      var audioStream = mediaInfo.AudioStreams?.FirstOrDefault();

      int? width = videoStream?.Width;
      int? height = videoStream?.Height;
      int? duration = (int?)mediaInfo.Duration.TotalSeconds;

      return (width, height, duration);
    }

    private static readonly SemaphoreSlim _sitemapLock = new(1, 1);
    private readonly string _sitemapPath = Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.Client/src/sitemap.xml");

    private async Task AppendToSitemapAsync(FileEntry fileEntry)
    {
      string fileUrl = IsVideoFileFromExtensionString(fileEntry.FileType)
          ? $"https://bughosted.com/Media/{fileEntry.Id}"
          : $"https://bughosted.com/File/{fileEntry.Id}";

      string lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

      await _sitemapLock.WaitAsync();
      try
      {
        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        XNamespace videoNs = "http://www.google.com/schemas/sitemap-video/1.1";
        XDocument sitemap;

        if (System.IO.File.Exists(_sitemapPath))
        {
          sitemap = XDocument.Load(_sitemapPath);
        }
        else
        {
          sitemap = new XDocument(new XElement(ns + "urlset"));
        }

        // Ensure video namespace is declared
        sitemap?.Root?.SetAttributeValue(XNamespace.Xmlns + "video", videoNs);

        // Remove existing entry (if any) to prevent duplicates
        var existingEntry = sitemap?.Descendants(ns + "url")
                                   .FirstOrDefault(x => x.Element(ns + "loc")?.Value == fileUrl);
        existingEntry?.Remove();

        var urlElement = new XElement(ns + "url",
            new XElement(ns + "loc", fileUrl),
            new XElement(ns + "lastmod", lastMod),
            new XElement(ns + "changefreq", "daily"),
            new XElement(ns + "priority", "0.8")
        );

        // Check if the file is a video
        if (IsVideoFileFromExtensionString(fileEntry.FileType))
        {
          var videoElement = new XElement(videoNs + "video",
              new XElement(videoNs + "title", fileEntry.FileName),
              new XElement(videoNs + "description", "Video: " + fileEntry.FileName),
              new XElement(videoNs + "content_loc", GetVideoContentLoc(fileEntry.Directory, fileEntry.FileName)),
              new XElement(videoNs + "duration", fileEntry.Duration ?? 0),
              new XElement(videoNs + "publication_date", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssK")),
              new XElement(videoNs + "family_friendly", "yes"),
              new XElement(videoNs + "thumbnail_loc", _logo)
          );

          urlElement.Add(videoElement);
        }

        sitemap?.Root?.Add(urlElement);
        sitemap?.Save(_sitemapPath);
      }
      finally
      {
        _sitemapLock.Release();
      }
    }


    private async Task UpdateSitemapEntry(int? fileId, string? fileName, string? description)
    {
      if (string.IsNullOrEmpty(fileName) || fileId == null)
      {
        _ = _log.Db("FileId and FileName must be provided.", null, "FILE", true);
        return;
      }
      string fileUrl = $"https://bughosted.com/File/{fileId}";
      string lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

      await _sitemapLock.WaitAsync();
      try
      {
        XDocument sitemap;

        if (System.IO.File.Exists(_sitemapPath))
        {
          sitemap = XDocument.Load(_sitemapPath);
        }
        else
        {
          _ = _log.Db("Sitemap not found, unable to update.", null, "FILE", true);
          return;
        }

        var urlElement = sitemap.Descendants(XName.Get("url", "http://www.sitemaps.org/schemas/sitemap/0.9"))
                .FirstOrDefault(x => x.Element(XName.Get("loc", "http://www.sitemaps.org/schemas/sitemap/0.9"))?.Value == fileUrl);

        if (urlElement == null)
        {
          _ = _log.Db($"No sitemap entry found for file {fileId}.", null, "FILE", true);
          return;
        }

        urlElement.Element(XName.Get("lastmod", "http://www.sitemaps.org/schemas/sitemap/0.9"))?.SetValue(lastMod);
        XNamespace videoNamespace = "http://www.google.com/schemas/sitemap-video/1.1";

        var videoElement = urlElement.Element(videoNamespace + "video");
        if (videoElement != null)
        {
          // Update the title and description for the video
          string desc = "";
          if (!string.IsNullOrEmpty(description)) { desc = description; }
          else if (!string.IsNullOrEmpty(fileName)) { desc = fileName; }
          else { desc = "Updated video file description."; }

          videoElement.Element(videoNamespace + "title")?.SetValue(fileName);
          videoElement.Element(videoNamespace + "description")?.SetValue(desc);
        }
        else
        {
          //	_ = _log.Db("No <video:video> element found in sitemap for file.", null, "FILE", true);
        }

        // Save the updated sitemap
        sitemap.Save(_sitemapPath);
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while updating the sitemap entry. " + ex.Message, null, "FILE", true);
      }
      finally
      {
        _sitemapLock.Release();
      }
    }

    private async Task RemoveFromSitemapAsync(int targetId)
    {
      string targetUrl = $"https://bughosted.com/File/{targetId}";
      _ = _log.Db($"Removing {targetUrl} from sitemap.", null, "FILE", true);

      await _sitemapLock.WaitAsync();
      try
      {
        if (System.IO.File.Exists(_sitemapPath))
        {
          XDocument sitemap = XDocument.Load(_sitemapPath);
          XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9"; // Declare the default namespace

          // Use the namespace to search for <url> and <loc> elements
          var targetElement = sitemap.Descendants(ns + "url")
                                      .FirstOrDefault(x => x.Element(ns + "loc")?.Value == targetUrl);

          if (targetElement != null)
          {
            targetElement.Remove();
            sitemap.Save(_sitemapPath);
            _ = _log.Db($"Removed {targetUrl} from sitemap!", null, "FILE", true);
          }
          else
          {
            _ = _log.Db($"Could not remove sitemap entry, {targetUrl} not found in sitemap!", null, "FILE", true);
          }
        }
      }
      finally
      {
        _sitemapLock.Release();
      }
    }

    private string GetVideoContentLoc(string? directory, string? fileName)
    {
      if (string.IsNullOrEmpty(directory) || string.IsNullOrEmpty(fileName))
      {
        return _logo;
      }
      string basePath = "E:/Dev/maxhanna/maxhanna.client/src/assets/";
      string relativePath = directory.Replace(basePath, "").TrimStart(Path.DirectorySeparatorChar);

      // Combine the relative path with the file name and return the full URL
      return $"https://bughosted.com/assets/{Path.Combine(relativePath, fileName).Replace(Path.DirectorySeparatorChar, '/')}";
    }

    private void MoveDirectory(string sourceDirectory, string destinationDirectory)
    {
      string directoryName = new DirectoryInfo(sourceDirectory).Name;
      string newDirectoryPath = Path.Combine(destinationDirectory, directoryName);
      Directory.Move(sourceDirectory, newDirectoryPath);
    }
    private bool CanMoveFile(string from, int userId)
    {
      if (userId == 1)
        return true;

      const string sql = @"
				SELECT 1 
				FROM maxhanna.file_uploads 
				WHERE folder_path = @folderPath AND user_id = @userId 
				LIMIT 1";

      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      conn.Open();

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@folderPath", from);
      cmd.Parameters.AddWithValue("@userId", userId);

      using var reader = cmd.ExecuteReader();
      return reader.Read();
    }

    private bool ValidatePath(string directory, bool forDelete = false)
    {
      if (!directory.Contains(_baseTarget))
      {
        _ = _log.Db($"{directory} Must be within {_baseTarget}", null, "FILE", true);
        return false;
      }
      else if (forDelete && (directory.Equals(_baseTarget + "Users") || directory.Equals(_baseTarget + "Roms")
          || directory.Equals(_baseTarget + "Meme") || directory.Equals(_baseTarget + "Nexus")
          || directory.Equals(_baseTarget + "Array") || directory.Equals(_baseTarget + "BugHosted")
          || directory.Equals(_baseTarget + "Files") || directory.Equals(_baseTarget + "Pictures")
          || directory.Equals(_baseTarget + "Videos")))
      {
        _ = _log.Db($"Cannot delete {directory}!", null, "FILE", true);
        return false;
      }
      else
      {
        return true;
      }
    }

    private bool DetermineIfRomSearch(List<string>? fileType)
    {
      if (fileType == null || fileType.Count == 0)
      {
        return false;
      }

      List<string> fileTypeList = (fileType.Count == 1 && fileType[0] != null && fileType[0].Contains(","))
          ? fileType[0].Split(',').Select(s => s.Trim()).ToList()
          : fileType;

      return fileTypeList.Any(ext => romExtensions.Contains(ext));
    }

    private string GetContentType(string fileExtension)
    {
      switch (fileExtension.ToLower())
      {
        case ".pdf":
          return "application/pdf";
        case ".txt":
          return "text/plain";
        case ".jpg":
        case ".jpeg":
          return "image/jpeg";
        case ".png":
          return "image/png";
        default:
          return "application/octet-stream";
      }
    }
  }
}