using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Services;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class BooksController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly string _connectionString;
		private readonly string _baseTarget;

		// Accepted book formats: PDF, EPUB, plain text and any Word format (legacy + OOXML).
		private static readonly HashSet<string> BookExtensions = new(StringComparer.OrdinalIgnoreCase)
		{
			"pdf", "epub", "txt", "doc", "docx", "docm", "dot", "dotx", "dotm", "rtf", "odt"
		};

		public BooksController(IConfiguration config, Log log)
		{
			_config = config;
			_log = log;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

			var configPath = config.GetValue<string>("FileUploads:BasePath") ?? "";
			if (string.IsNullOrWhiteSpace(configPath))
			{
				var serverDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location) ?? ".";
				configPath = Path.Combine(serverDir, "..", "..", "..", "..", "maxhanna.client", "src", "assets", "Uploads");
			}
			_baseTarget = Path.GetFullPath(configPath).Replace("\\", "/");
			if (!_baseTarget.EndsWith("/")) _baseTarget += "/";
		}

		// The shared books folder inside the upload tree ("Uploads/Books/").
		// Matches the FileController folder layout: relative to _baseTarget.
		private static string BooksFolder() => "Books/";

		[HttpGet("/Books/GetMyLibrary")]
		public async Task<IActionResult> GetMyLibrary(
			[FromQuery] int userId,
			[FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
		{
			try
			{
				if (userId <= 0) return BadRequest("userId required.");
				if (!await _log.ValidateUserLoggedIn(userId, encryptedUserIdHeader ?? ""))
					return StatusCode(500, "Access Denied.");

				var registered = await QueryBooks(BookSql(userId, false), cmd =>
				{
					cmd.Parameters.AddWithValue("@UserId", userId);
				});
				// A file shared with you matches via two rows (your saved entry +
				// the sharer's entry) — keep one card, preferring your own entry.
				registered = DedupByFile(registered, preferOwnerId: userId);
				// The library also lists the owner's own book-format files sitting in
				// the Books/ upload folder that were never registered via the Add
				// Book dialog (e.g. uploaded straight through the Files app).
				var unregistered = await QueryUnregisteredBookFiles(userId, onlyPublic: false);
				// Saved copies of other users' books replace their catalog entries
				// in your library view — one card per book, not two.
				var savedFileIds = registered.Select(b => b.FileId).ToHashSet();
				unregistered = unregistered.Where(u => !savedFileIds.Contains(u.FileId)).ToList();
				return Ok(registered.Concat(unregistered).ToList());
			}
			catch (Exception ex)
			{
				_ = _log.Db($"GetMyLibrary failed: {ex.Message}", userId, "BOOKS", true);
				return StatusCode(500, "An error occurred while loading your library.");
			}
		}

		[HttpGet("/Books/GetCatalog")]
		public async Task<IActionResult> GetCatalog([FromQuery] int? userId = null)
		{
			try
			{
				// Catalog = public books plus books explicitly shared with the
				// caller (userId 0 for anonymous visitors sees only public ones).
				var registered = await QueryBooks(BookSql(userId ?? 0, true), cmd =>
				{
					cmd.Parameters.AddWithValue("@UserId", userId ?? 0);
				});
				// Many users can hold their own entry for the same public file —
				// the catalog shows one card per book, preferring the uploader's.
				registered = DedupByFile(registered, preferFileOwner: true);
				// Plus every public book-format file uploaded into the Books/ folder
				// that has never been registered — the raw directory contents the
				// feature was specced to list. These come back with bookId = 0.
				var unregistered = await QueryUnregisteredBookFiles(userId ?? 0, onlyPublic: true);
				// A public file you already saved keeps its original catalog
				// identity here; your saved entry lives in the library tab instead.
				var savedFileIds = registered.Select(b => b.FileId).ToHashSet();
				unregistered = unregistered.Where(u => !savedFileIds.Contains(u.FileId)).ToList();
				return Ok(registered.Concat(unregistered).ToList());
			}
			catch (Exception ex)
			{
				_ = _log.Db($"GetCatalog failed: {ex.Message}", userId, "BOOKS", true);
				return StatusCode(500, "An error occurred while loading the catalog.");
			}
		}

		/// <summary>
		/// Lists the distinct subfolders (one level) under Books/{prefix} that
		/// contain book-format files the caller can see. The client uses this to
		/// navigate the Books folder like a mini file browser.
		/// </summary>
		[HttpGet("/Books/GetBookFolders")]
		public async Task<IActionResult> GetBookFolders(
			[FromQuery] int userId = 0,
			[FromQuery] string? prefix = null)
		{
			try
			{
				// Folder rows are authoritative. The previous implementation only
				// inspected book files, which hid empty folders and made nested folders
				// disappear until a book had been uploaded into them. Read both folder
				// rows and book-file rows, then derive the immediate child folder from
				// the real stored path in C#.
				var clean = (prefix ?? "").Replace("\\", "/").Trim('/');
				var exts = string.Join(',', BookExtensions.Select(e => $"'{e}'"));
				var sql = $@"
					SELECT f.folder_path, f.file_name, f.is_folder
					FROM maxhanna.file_uploads f
					WHERE REPLACE(f.folder_path, CHAR(92), '/') LIKE @booksRoot
					  AND (
							f.is_folder = 1
							OR LOWER(SUBSTRING_INDEX(f.file_name, '.', -1)) IN ({exts})
					  )
					  AND (f.is_public = 1 OR (@UserId > 0 AND (
						   f.user_id = @UserId
						   OR (f.shared_with IS NOT NULL AND f.shared_with != '' AND FIND_IN_SET(@UserId, f.shared_with) > 0))))";
				var folders = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();
					using var cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@booksRoot", "%/Books/%");
					cmd.Parameters.AddWithValue("@UserId", userId);
					using var rdr = await cmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						var parent = rdr.IsDBNull(0) ? "" : rdr.GetString(0).Replace("\\", "/");
						var name = rdr.IsDBNull(1) ? "" : rdr.GetString(1);
						var isFolder = !rdr.IsDBNull(2) && rdr.GetBoolean(2);
						var itemPath = isFolder ? parent.TrimEnd('/') + "/" + name : parent;
						var marker = "/Books/";
						var booksIndex = itemPath.LastIndexOf(marker, StringComparison.OrdinalIgnoreCase);
						if (booksIndex < 0) continue;
						var relativeFolder = itemPath[(booksIndex + marker.Length)..].Trim('/');
						if (!isFolder && relativeFolder.Equals(clean, StringComparison.OrdinalIgnoreCase)) continue;
						var requiredPrefix = string.IsNullOrEmpty(clean) ? "" : clean + "/";
						if (!relativeFolder.StartsWith(requiredPrefix, StringComparison.OrdinalIgnoreCase)) continue;
						var remainder = relativeFolder[requiredPrefix.Length..];
						var slash = remainder.IndexOf('/');
						var child = slash >= 0 ? remainder[..slash] : remainder;
						if (!string.IsNullOrWhiteSpace(child)) folders.Add(child);
					}
				}
				return Ok(folders.OrderBy(f => f, StringComparer.OrdinalIgnoreCase).ToList());
			}
			catch (Exception ex)
			{
				_ = _log.Db($"GetBookFolders failed: {ex.Message}", userId, "BOOKS", true);
				return StatusCode(500, "An error occurred while listing book folders.");
			}
		}

		[HttpPost("/Books/Register")]
		public async Task<IActionResult> RegisterBook(
			[FromBody] RegisterBookRequest req,
			[FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
		{
			try
			{
				if (req.UserId <= 0) return BadRequest("userId required.");
				if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? ""))
					return StatusCode(500, "Access Denied.");

				if (req.FileId <= 0) return BadRequest("fileId required.");
				var title = (req.Title ?? "").Trim();
				var author = (req.Author ?? "").Trim();
				var description = (req.Description ?? "").Trim();
				if (title.Length == 0) return BadRequest("Title required.");

				string connStr = _connectionString;
				using (var conn = new MySqlConnection(connStr))
				{
					await conn.OpenAsync();

					// The file must exist, must be a book format and must be readable
					// by the caller (owner, or public/shared for saving others' books).
					string? folderPath = null, fileName = null;
					bool isPublic = false;
					bool ownsFile = false;
					using (var cmd = new MySqlCommand(
						"SELECT user_id, file_name, folder_path, is_public, file_type, shared_with FROM maxhanna.file_uploads WHERE id = @fileId LIMIT 1", conn))
					{
						cmd.Parameters.AddWithValue("@fileId", req.FileId);
						using var rdr = await cmd.ExecuteReaderAsync();
						if (!await rdr.ReadAsync()) return NotFound("Uploaded file not found.");
						var ownerId = rdr.GetInt32("user_id");
						ownsFile = ownerId == req.UserId;
						if (!ownsFile)
						{
							// Adding someone else's book to your library — they must be
							// able to read it (public, or shared directly with them).
							var canRead = rdr.GetBoolean("is_public");
							if (!canRead)
							{
								var sw = rdr.IsDBNull(rdr.GetOrdinal("shared_with")) ? "" : rdr.GetString("shared_with");
								foreach (var p in sw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
									if (int.TryParse(p, out var sid) && sid == req.UserId) { canRead = true; break; }
							}
							if (!canRead) return StatusCode(403, "That book is not public or shared with you.");
						}
						fileName = rdr.GetString("file_name");
						folderPath = rdr.GetString("folder_path");
						isPublic = rdr.GetBoolean("is_public");
						var ext = Path.GetExtension(fileName ?? "").TrimStart('.').ToLowerInvariant();
						if (!BookExtensions.Contains(ext))
							return BadRequest("Unsupported book format. Allowed: pdf, epub, txt, doc, docx, rtf, odt.");
					}

					// Keep every registered book inside the Books tree — but respect
					// subfolders: a file already in Books/Foo/ stays in Books/Foo/.
					var targetFolder = _baseTarget + BooksFolder();
					var normalizedFolder = (folderPath ?? "").Replace("\\", "/").TrimEnd('/') + "/";
					// Only the owner's copy is relocated into Books/ — saving someone
					// else's book must never touch their file location.
					if (ownsFile && !normalizedFolder.EndsWith("/Books/", StringComparison.OrdinalIgnoreCase)
						&& !normalizedFolder.Contains("/Books/", StringComparison.OrdinalIgnoreCase))
					{
						// Move the file into Books/ (and move any DB registration with it).
						if (!Directory.Exists(targetFolder)) Directory.CreateDirectory(targetFolder);
						var newPath = Path.Combine(targetFolder, fileName ?? "");
						if (System.IO.File.Exists(newPath))
						{
							// A same-named file already lives in Books/ — do not overwrite
							// it (or we would corrupt someone else's book). Keep the
							// uploaded copy where it is and register that instead.
							newPath = Path.Combine((folderPath ?? "").Replace('/', Path.DirectorySeparatorChar), fileName ?? "");
						}
						else
						{
							var oldPath = Path.Combine((folderPath ?? "").Replace('/', Path.DirectorySeparatorChar), fileName ?? "");
							if (System.IO.File.Exists(oldPath))
								System.IO.File.Move(oldPath, newPath);
						}
						using (var upd = new MySqlCommand(
							"UPDATE maxhanna.file_uploads SET folder_path = @fp WHERE id = @fid", conn))
						{
							upd.Parameters.AddWithValue("@fp", targetFolder);
							upd.Parameters.AddWithValue("@fid", req.FileId);
							await upd.ExecuteNonQueryAsync();
						}
						folderPath = targetFolder;
					}

					// If the file is already registered as a book, just refresh metadata.
					using (var exists = new MySqlCommand(
						// Scoped to the caller: several users may each keep their own
						// library entry for the same underlying file.
						"SELECT id FROM maxhanna.book_library WHERE file_id = @fid AND user_id = @uid LIMIT 1", conn))
					{
						exists.Parameters.AddWithValue("@fid", req.FileId);
						exists.Parameters.AddWithValue("@uid", req.UserId);
						var existing = await exists.ExecuteScalarAsync();
						if (existing != null && existing != DBNull.Value)
						{
							using (var upd = new MySqlCommand(@"
								UPDATE maxhanna.book_library
								SET title = @title, author = @author, description = @description, cover_file_id = @coverId
								WHERE file_id = @fid AND user_id = @uid", conn))
							{
								upd.Parameters.AddWithValue("@title", title);
								upd.Parameters.AddWithValue("@author", string.IsNullOrWhiteSpace(author) ? (object?)DBNull.Value : author);
								upd.Parameters.AddWithValue("@description", string.IsNullOrWhiteSpace(description) ? (object?)DBNull.Value : description);
								upd.Parameters.AddWithValue("@coverId", req.CoverFileId.HasValue ? req.CoverFileId.Value : (object?)DBNull.Value);
								upd.Parameters.AddWithValue("@fid", req.FileId);
								upd.Parameters.AddWithValue("@uid", req.UserId);
								await upd.ExecuteNonQueryAsync();
							}
							return Ok(new { bookId = Convert.ToInt32(existing), fileId = req.FileId, updated = true });
						}
					}

					long bookId;
					using (var ins = new MySqlCommand(@"
						INSERT INTO maxhanna.book_library (user_id, file_id, title, author, description, cover_file_id, created_at, updated_at)
						VALUES (@uid, @fid, @title, @author, @description, @coverId, UTC_TIMESTAMP(), UTC_TIMESTAMP())", conn))
					{
						ins.Parameters.AddWithValue("@uid", req.UserId);
						ins.Parameters.AddWithValue("@fid", req.FileId);
						ins.Parameters.AddWithValue("@title", title);
						ins.Parameters.AddWithValue("@author", string.IsNullOrWhiteSpace(author) ? (object?)DBNull.Value : author);
						ins.Parameters.AddWithValue("@description", string.IsNullOrWhiteSpace(description) ? (object?)DBNull.Value : description);
						ins.Parameters.AddWithValue("@coverId", req.CoverFileId.HasValue ? req.CoverFileId.Value : (object?)DBNull.Value);
						await ins.ExecuteNonQueryAsync();
						bookId = ins.LastInsertedId;
					}

					// Mirror sharing onto the underlying file row so existing file
					// permissions (GetFileById works for anyone; GetDirectory honours
					// is_public/shared_with) stay consistent with the book's sharing.
					// Sharing mirrors only apply to the owner — a saved copy of
					// someone else's book can never change their file's visibility.
					if (ownsFile) await SyncFileVisibility(conn, req.FileId, req.UserId, req.IsPublic);
					_ = isPublic;

					return Ok(new { bookId, fileId = req.FileId, updated = false });
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"RegisterBook failed: {ex.Message}", req.UserId, "BOOKS", true);
				return StatusCode(500, "An error occurred while registering the book.");
			}
		}

		[HttpPost("/Books/Update")]
		public async Task<IActionResult> UpdateBook(
			[FromBody] RegisterBookRequest req,
			[FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
		{
			try
			{
				if (req.UserId <= 0) return BadRequest("userId required.");
				if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? ""))
					return StatusCode(500, "Access Denied.");
				if (req.FileId <= 0 && req.BookId <= 0) return BadRequest("bookId or fileId required.");

				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				var idCol = req.BookId > 0 ? "bookId" : "fileId";
				var where = req.BookId > 0 ? "id = @id" : "file_id = @id";
				using (var upd = new MySqlCommand($@"
					UPDATE maxhanna.book_library
					SET title = @title, author = @author, description = @description,
					    cover_file_id = @coverId, updated_at = UTC_TIMESTAMP()
					WHERE {where} AND user_id = @uid", conn))
				{
					upd.Parameters.AddWithValue("@id", req.BookId > 0 ? req.BookId : req.FileId);
					upd.Parameters.AddWithValue("@title", (req.Title ?? "").Trim());
					upd.Parameters.AddWithValue("@author", string.IsNullOrWhiteSpace(req.Author) ? (object?)DBNull.Value : req.Author!.Trim());
					upd.Parameters.AddWithValue("@description", string.IsNullOrWhiteSpace(req.Description) ? (object?)DBNull.Value : req.Description!.Trim());
					upd.Parameters.AddWithValue("@coverId", req.CoverFileId.HasValue ? req.CoverFileId.Value : (object?)DBNull.Value);
					upd.Parameters.AddWithValue("@uid", req.UserId);
					var rows = await upd.ExecuteNonQueryAsync();
					if (rows == 0) return NotFound("Book not found in your library.");
				}

				if (req.IsPublic.HasValue)
				{
					// Only the file's owner may change its visibility — a saved copy
					// of someone else's book cannot flip their file public/private.
					var fileId = await GetFileIdForBook(conn, req.BookId > 0 ? req.BookId : req.FileId, req.BookId > 0);
					if (fileId.HasValue && await FileBelongsToUser(conn, fileId.Value, req.UserId))
						await SyncFileVisibility(conn, fileId.Value, req.UserId, req.IsPublic);
				}
				return Ok(new { success = true });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"UpdateBook failed: {ex.Message}", req.UserId, "BOOKS", true);
				return StatusCode(500, "An error occurred while updating the book.");
			}
		}

		[HttpPost("/Books/Share")]
		public async Task<IActionResult> ShareBook(
			[FromBody] ShareBookRequest req,
			[FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
		{
			try
			{
				if (req.UserId <= 0) return BadRequest("userId required.");
				if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? ""))
					return StatusCode(500, "Access Denied.");

				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				var fileId = await GetOwnedBookFileId(conn, req.BookId, req.UserId);
				if (fileId == null) return NotFound("Book not found in your library.");

				if (req.MakePublic)
				{
					// Saved copies of others' books can't change the original's
					// visibility — only the file owner can make it public.
					if (!await FileBelongsToUser(conn, fileId.Value, req.UserId))
						return StatusCode(403, "Only the book's owner can make it public.");
					await SyncFileVisibility(conn, fileId.Value, req.UserId, true);
					await TouchBook(conn, req.BookId);
					return Ok(new { success = true, isPublic = true, sharedWith = new int[0] });
				}

				// Share with specific users by username. Like make-public, direct
				// shares write to the file row — so only the file owner may do it.
				if (!await FileBelongsToUser(conn, fileId.Value, req.UserId))
					return StatusCode(403, "Only the book's owner can share it.");
				var resolved = new List<int>();
				var unknown = new List<string>();
				foreach (var name in req.Usernames ?? new List<string>())
				{
					var n = (name ?? "").Trim().TrimStart('@');
					if (n.Length == 0) continue;
					using var q = new MySqlCommand("SELECT id FROM maxhanna.users WHERE username = @u LIMIT 1", conn);
					q.Parameters.AddWithValue("@u", n);
					var r = await q.ExecuteScalarAsync();
					if (r == null || r == DBNull.Value) { unknown.Add(n); continue; }
					var targetId = Convert.ToInt32(r);
					if (targetId != req.UserId) resolved.Add(targetId);
				}

				var sharedWith = await GetSharedWithList(conn, fileId.Value);
				var changed = false;
				var all = new List<int>(resolved);
				if (req.UserIds != null) all.AddRange(req.UserIds);
				foreach (var id in all)
				{
					if (id > 0 && id != req.UserId && !sharedWith.Contains(id)) { sharedWith.Add(id); changed = true; }
				}
				if (changed) await SaveSharedWith(conn, fileId.Value, sharedWith);
				await TouchBook(conn, req.BookId);

				return Ok(new { success = true, isPublic = false, sharedWith, unknownUsernames = unknown });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"ShareBook failed: {ex.Message}", req.UserId, "BOOKS", true);
				return StatusCode(500, "An error occurred while sharing the book.");
			}
		}

		[HttpPost("/Books/Unshare")]
		public async Task<IActionResult> UnshareBook(
			[FromBody] ShareBookRequest req,
			[FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
		{
			try
			{
				if (req.UserId <= 0) return BadRequest("userId required.");
				if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? ""))
					return StatusCode(500, "Access Denied.");

				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				var fileId = await GetOwnedBookFileId(conn, req.BookId, req.UserId);
				if (fileId == null) return NotFound("Book not found in your library.");

				if (req.MakePublic) // request to un-public
				{
					if (await FileBelongsToUser(conn, fileId.Value, req.UserId))
						await SyncFileVisibility(conn, fileId.Value, req.UserId, false);
				}
				if ((req.Usernames?.Count ?? 0) > 0 || (req.UserIds?.Count ?? 0) > 0)
				{
					// Removing recipients edits the shared_with CSV on the file row —
					// owner-only for the same reason as sharing.
					if (!await FileBelongsToUser(conn, fileId.Value, req.UserId))
						return StatusCode(403, "Only the book's owner can manage sharing.");
					var sharedWith = await GetSharedWithList(conn, fileId.Value);
					foreach (var name in req.Usernames ?? new List<string>())
					{
						var n = (name ?? "").Trim().TrimStart('@');
						if (n.Length == 0) continue;
						using var q = new MySqlCommand("SELECT id FROM maxhanna.users WHERE username = @u LIMIT 1", conn);
						q.Parameters.AddWithValue("@u", n);
						var r = await q.ExecuteScalarAsync();
						if (r == null || r == DBNull.Value) continue;
						sharedWith.Remove(Convert.ToInt32(r));
					}
					foreach (var uid in req.UserIds ?? new List<int>())
					{
						sharedWith.Remove(uid);
					}
					await SaveSharedWith(conn, fileId.Value, sharedWith);
				}
				await TouchBook(conn, req.BookId);
				return Ok(new { success = true });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"UnshareBook failed: {ex.Message}", req.UserId, "BOOKS", true);
				return StatusCode(500, "An error occurred while updating sharing.");
			}
		}

		[HttpPost("/Books/Remove")]
		public async Task<IActionResult> RemoveBook(
			[FromBody] ShareBookRequest req,
			[FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
		{
			try
			{
				if (req.UserId <= 0) return BadRequest("userId required.");
				if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? ""))
					return StatusCode(500, "Access Denied.");

				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				// The book row must belong to the caller.
				var fileId = await GetOwnedBookFileId(conn, req.BookId, req.UserId);
				if (fileId == null) return NotFound("Book not found in your library.");

				using (var del = new MySqlCommand("DELETE FROM maxhanna.book_library WHERE id = @id", conn))
				{
					del.Parameters.AddWithValue("@id", req.BookId);
					await del.ExecuteNonQueryAsync();
				}
				// The uploaded file itself is left untouched — the owner can delete it
				// from Files if they want; unregistering only removes it from the library.
				return Ok(new { success = true });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"RemoveBook failed: {ex.Message}", req.UserId, "BOOKS", true);
				return StatusCode(500, "An error occurred while removing the book.");
			}
		}

		/// <summary>
		/// Server-generated SVG cover for a book: deterministic gradient from the
		/// title hash, title/author typography and a format badge. Used when a book
		/// has no uploaded cover image — every book always has a preview image.
		/// </summary>
		[HttpGet("/Books/Cover.svg")]
		public IActionResult CoverSvg([FromQuery] string? title, [FromQuery] string? author, [FromQuery] string? fmt)
		{
			var t = (title ?? "Untitled").Trim();
			if (t.Length == 0) t = "Untitled";
			var a = (author ?? "").Trim();
			var format = (fmt ?? "").Trim().ToUpperInvariant();

			// Deterministic hue pair from the title so a given book always gets the
			// same cover (cacheable by URL), but neighbouring books differ.
			var hash = SHA256.HashData(Encoding.UTF8.GetBytes(t.ToUpperInvariant()));
			var hue = hash[0] * 360 / 256;
			var hue2 = (hue + 40 + hash[1] * 60 / 256) % 360;
			var c1 = $"hsl({hue},62%,38%)";
			var c2 = $"hsl({hue2},70%,22%)";

			string Esc(string s) => s
				.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
				.Replace("\"", "&quot;").Replace("'", "&apos;");

			var titleLines = WrapText(Esc(t), 17, 4);
			var titleSvg = new StringBuilder();
			var startY = 330 - (titleLines.Count - 1) * 21;
			for (int i = 0; i < titleLines.Count; i++)
			{
				titleSvg.AppendLine($"<text x='32' y='{startY + i * 42}' font-family='Georgia, serif' font-size='30' font-weight='bold' fill='#f5efe0'>{titleLines[i]}</text>");
			}

			var authorSvg = a.Length > 0
				? $"<text x='32' y='430' font-family='Georgia, serif' font-size='19' font-style='italic' fill='#d8d2c2'>{Esc(Truncate(a, 34))}</text>"
				: "";

			var badge = format.Length > 0
				? $"<rect x='255' y='24' rx='6' width='65' height='26' fill='rgba(255,255,255,.16)'/><text x='287' y='42' text-anchor='middle' font-family='Arial' font-size='13' font-weight='bold' fill='#e8e2d2'>{Esc(format)}</text>"
				: "";

			var svg = new StringBuilder();
			svg.AppendLine($"<svg xmlns='http://www.w3.org/2000/svg' width='340' height='480' viewBox='0 0 340 480'>");
			svg.AppendLine($"<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='{c1}'/><stop offset='1' stop-color='{c2}'/></linearGradient></defs>");
			svg.AppendLine($"<rect width='340' height='480' fill='url(#g)'/>");
			// spine highlight
			svg.AppendLine($"<rect x='0' y='0' width='14' height='480' fill='rgba(0,0,0,.25)'/>");
			svg.AppendLine($"<rect x='14' y='0' width='3' height='480' fill='rgba(255,255,255,.14)'/>");
			// subtle border
			svg.AppendLine($"<rect x='24' y='18' width='292' height='444' fill='none' stroke='rgba(245,239,224,.35)' stroke-width='2'/>");
			svg.Append(titleSvg.ToString());
			svg.AppendLine(authorSvg);
			svg.AppendLine(badge);
			svg.AppendLine("</svg>");

			Response.Headers["Cache-Control"] = "public, max-age=86400";
			return Content(svg.ToString(), "image/svg+xml");
		}
 

		[HttpGet("/Books/Progress")]
		public async Task<IActionResult> GetReadingProgress(
			[FromQuery] int userId,
			[FromQuery] int fileId,
			[FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
		{
			try
			{
				if (userId <= 0 || fileId <= 0) return BadRequest("userId and fileId required.");
				if (!await _log.ValidateUserLoggedIn(userId, encryptedUserIdHeader ?? ""))
					return StatusCode(500, "Access Denied.");
 				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(
					"SELECT page, scroll_ratio, position, updated_at FROM maxhanna.book_reading_progress WHERE user_id = @uid AND file_id = @fid LIMIT 1", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				cmd.Parameters.AddWithValue("@fid", fileId);
				using var reader = await cmd.ExecuteReaderAsync();
				if (!await reader.ReadAsync()) return Ok(new { fileId, position = (object?)null });
				var posOrdinal = reader.GetOrdinal("position");
				return Ok(new
				{
					fileId,
					position = new
					{
						page = Convert.ToInt32(reader["page"]),
						scroll = Convert.ToDouble(reader["scroll_ratio"], CultureInfo.InvariantCulture),
						position = reader.IsDBNull(posOrdinal) ? null : reader.GetString(posOrdinal),
						updatedAt = Convert.ToDateTime(reader["updated_at"])
					}
				});
			}
			catch (Exception ex)
			{
				_ = _log.Db($"GetReadingProgress failed: {ex.Message}", userId, "BOOKS", true);
				return StatusCode(500, "Could not load reading progress.");
			}
		}

		[HttpPost("/Books/Progress")]
		public async Task<IActionResult> SaveReadingProgress(
			[FromBody] SaveProgressRequest req,
			[FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
		{
			try
			{
				if (req.UserId <= 0 || req.FileId <= 0) return BadRequest("userId and fileId required.");
				if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? ""))
					return StatusCode(500, "Access Denied.");
 				var page = Math.Max(0, req.Page);
				var scroll = Math.Clamp(req.Scroll, 0.0, 1.0);
				// Free-form reader position (e.g. EPUB CFI). Truncated defensively.
				var position = string.IsNullOrWhiteSpace(req.Position)
					? (object?)DBNull.Value
					: req.Position.Substring(0, Math.Min(req.Position.Length, 4000));
				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(@"
					INSERT INTO maxhanna.book_reading_progress (user_id, file_id, page, scroll_ratio, position, updated_at)
					VALUES (@uid, @fid, @page, @scroll, @position, UTC_TIMESTAMP())
					ON DUPLICATE KEY UPDATE page = VALUES(page), scroll_ratio = VALUES(scroll_ratio), position = VALUES(position), updated_at = UTC_TIMESTAMP()", conn);
				cmd.Parameters.AddWithValue("@uid", req.UserId);
				cmd.Parameters.AddWithValue("@fid", req.FileId);
				cmd.Parameters.AddWithValue("@page", page);
				cmd.Parameters.AddWithValue("@scroll", scroll);
				cmd.Parameters.AddWithValue("@position", position);
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { success = true });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"SaveReadingProgress failed: {ex.Message}", req.UserId, "BOOKS", true);
				return StatusCode(500, "Could not save reading progress.");
			}
		}

		// ---------- helpers ----------

		public class RegisterBookRequest
		{
			public int UserId { get; set; }
			public int BookId { get; set; }
			public int FileId { get; set; }
			public int? CoverFileId { get; set; }
			public string? CoverUrl { get; set; }
			public string? Title { get; set; }
			public string? Author { get; set; }
			public string? Description { get; set; }
			public bool? IsPublic { get; set; }
		}

		public class ShareBookRequest
		{
			public int UserId { get; set; }
			public int BookId { get; set; }
			public bool MakePublic { get; set; }
			public List<string>? Usernames { get; set; }
			public List<int>? UserIds { get; set; }
		}

		public class SaveProgressRequest
		{
			public int UserId { get; set; }
				public int FileId { get; set; }
				public int Page { get; set; }
				public double Scroll { get; set; }
				public string? Position { get; set; }
		}			/// <summary>
			/// Collapses multiple library entries that point at the same uploaded
			/// file. Library view keeps the caller's own entry; catalog view keeps
			/// the uploader's entry when one exists.
			/// </summary>
			private static List<BookDto> DedupByFile(List<BookDto> books, int? preferOwnerId = null, bool preferFileOwner = false)
			{
				var byFile = new Dictionary<int, BookDto>();
				foreach (var b in books)
				{
					if (!byFile.TryGetValue(b.FileId, out var keep))
					{
						byFile[b.FileId] = b;
						continue;
					}
					if (preferOwnerId.HasValue && b.OwnerId == preferOwnerId.Value && keep.OwnerId != preferOwnerId.Value)
						byFile[b.FileId] = b;
					else if (preferFileOwner && b.OwnerId == b.FileOwnerId && keep.OwnerId != keep.FileOwnerId)
						byFile[b.FileId] = b;
				}
				return byFile.Values.OrderByDescending(b => b.UpdatedUtc).ToList();
			}

			private static string BookSql(int? userId, bool catalog)
		{
			// Catalog: public books, plus books explicitly shared with the caller.
			// Library: the caller's own books, plus books shared with them.
			// FIND_IN_SET matches whole CSV entries (no "user 1 matches 11" false
			// positives that a LIKE '%1%' would produce).
			var visibility = catalog
				? "AND (f.is_public = 1 OR (f.shared_with IS NOT NULL AND f.shared_with != '' AND FIND_IN_SET(@UserId, f.shared_with) > 0))"
				: "AND (b.user_id = @UserId OR (f.shared_with IS NOT NULL AND f.shared_with != '' AND FIND_IN_SET(@UserId, f.shared_with) > 0))";
			return $@"
				SELECT b.id AS book_id, b.file_id, b.title, b.author, b.description,
				       b.cover_file_id, b.created_at AS book_created, b.updated_at AS book_updated,
				       b.user_id AS owner_id, u.username AS owner_name,
				       f.user_id AS file_owner_id, fu.username AS file_owner_name,
				       f.file_name, f.folder_path, f.file_type, f.file_size, f.is_public, f.shared_with,
				       f.upload_date, f.access_count,
				       c.given_file_name AS cover_name, c.folder_path AS cover_folder
				FROM maxhanna.book_library b
				JOIN maxhanna.file_uploads f ON f.id = b.file_id
				LEFT JOIN maxhanna.users u ON u.id = b.user_id
				LEFT JOIN maxhanna.users fu ON fu.id = f.user_id
				LEFT JOIN maxhanna.file_uploads c ON c.id = b.cover_file_id
				WHERE 1=1 {visibility}				ORDER BY b.updated_at DESC
				LIMIT 1000";
		}

		private static List<string> WrapText(string text, int maxChars, int maxLines)
		{
			var lines = new List<string>();
			var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
			var current = "";
			foreach (var w in words)
			{
				var candidate = current.Length == 0 ? w : current + " " + w;
				if (candidate.Length > maxChars && current.Length > 0)
				{
					lines.Add(current);
					current = w;
					if (lines.Count == maxLines) break;
				}
				else current = candidate;
			}
			if (lines.Count < maxLines && current.Length > 0) lines.Add(current);
			if (lines.Count == maxLines)
			{
				// elide the rest
				var idx = 0;
				for (int i = 0; i < lines.Count; i++) idx += lines[i].Length + 1;
				if (idx < text.Length) lines[^1] = lines[^1].TrimEnd() + "…";
			}
			return lines;
		}

		private static string Truncate(string s, int max)
			=> s.Length <= max ? s : s[..(max - 1)] + "…";

		private static async Task<int?> GetFileIdForBook(MySqlConnection conn, int id, bool isBookId)
		{
			using var cmd = new MySqlCommand(
				isBookId ? "SELECT file_id FROM maxhanna.book_library WHERE id = @id LIMIT 1"
						 : "SELECT file_id FROM maxhanna.book_library WHERE file_id = @id LIMIT 1", conn);
			cmd.Parameters.AddWithValue("@id", id);
			var r = await cmd.ExecuteScalarAsync();
			return r == null || r == DBNull.Value ? (int?)null : Convert.ToInt32(r);
		}

		/// <summary>True when the caller owns the underlying file_uploads row.</summary>
		private static async Task<bool> FileBelongsToUser(MySqlConnection conn, int fileId, int userId)
		{
			using var cmd = new MySqlCommand(
				"SELECT COUNT(1) FROM maxhanna.file_uploads WHERE id = @fid AND user_id = @uid", conn);
			cmd.Parameters.AddWithValue("@fid", fileId);
			cmd.Parameters.AddWithValue("@uid", userId);
			var r = await cmd.ExecuteScalarAsync();
			return r != null && r != DBNull.Value && Convert.ToInt64(r) > 0;
		}

		private static async Task<List<int>> GetSharedWithList(MySqlConnection conn, int fileId)
		{
			var list = new List<int>();
			using var cmd = new MySqlCommand("SELECT shared_with FROM maxhanna.file_uploads WHERE id = @fid LIMIT 1", conn);
			cmd.Parameters.AddWithValue("@fid", fileId);
			var r = await cmd.ExecuteScalarAsync();
			var s = r as string;
			if (!string.IsNullOrWhiteSpace(s))
			{
				foreach (var p in s.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
				{
					if (int.TryParse(p, out var id)) list.Add(id);
				}
			}
			return list;
		}

		/// <summary>
		/// Resolves the caller's own library entry for a book to its underlying
		/// file id. Gates share/unshare/remove — the library entry must belong to
		/// the caller, but the file itself may belong to someone else when they
		/// saved a copy of that user's book.
		/// </summary>
		private static async Task<int?> GetOwnedBookFileId(MySqlConnection conn, int bookId, int userId)
		{
			using var cmd = new MySqlCommand(
				"SELECT file_id FROM maxhanna.book_library WHERE id = @id AND user_id = @uid LIMIT 1", conn);
			cmd.Parameters.AddWithValue("@id", bookId);
			cmd.Parameters.AddWithValue("@uid", userId);
			var r = await cmd.ExecuteScalarAsync();
			return r == null || r == DBNull.Value ? (int?)null : Convert.ToInt32(r);
		}

		private static async Task SaveSharedWith(MySqlConnection conn, int fileId, List<int> ids)
		{
			var csv = ids.Count > 0 ? string.Join(",", ids) : (object?)DBNull.Value;
			using var cmd = new MySqlCommand("UPDATE maxhanna.file_uploads SET shared_with = @sw WHERE id = @fid", conn);
			cmd.Parameters.AddWithValue("@sw", csv);
			cmd.Parameters.AddWithValue("@fid", fileId);
			await cmd.ExecuteNonQueryAsync();
			_ = csv;
		}

		private async Task SyncFileVisibility(MySqlConnection conn, int fileId, int userId, bool? makePublic)
		{
			if (!makePublic.HasValue) return;
			using var cmd = new MySqlCommand(
				"UPDATE maxhanna.file_uploads SET is_public = @p WHERE id = @fid AND user_id = @uid", conn);
			cmd.Parameters.AddWithValue("@p", makePublic.Value);
			cmd.Parameters.AddWithValue("@fid", fileId);
			cmd.Parameters.AddWithValue("@uid", userId);
			await cmd.ExecuteNonQueryAsync();
		}

		private static async Task TouchBook(MySqlConnection conn, int bookId)
		{
			using var cmd = new MySqlCommand("UPDATE maxhanna.book_library SET updated_at = UTC_TIMESTAMP() WHERE id = @id", conn);
			cmd.Parameters.AddWithValue("@id", bookId);
			await cmd.ExecuteNonQueryAsync();
			_ = conn;
		}

		private async Task<List<BookDto>> QueryBooks(string sql, Action<MySqlCommand> bind)
		{
			var list = new List<BookDto>();
			using (var conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(sql, conn);
				bind(cmd);
				using var rdr = await cmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync())
				{
					list.Add(MapBook(rdr));
				}
			}				return list;
			}

		/// <summary>
		/// Book-format files uploaded into the Books/ folder that were never
		/// registered in book_library. The Books feature was specced to list the
		/// /books directory contents, so these must appear in the catalog (when
		/// public) and in the owner's library (always for the owner) even though
		/// they have no library row yet. They come back with BookId = 0 and
		/// metadata derived from the filename — the client offers a one-click
		/// "Add to library" which turns them into a full book entry.
		/// </summary>
		private async Task<List<BookDto>> QueryUnregisteredBookFiles(int userId, bool onlyPublic)
		{
			var list = new List<BookDto>();
			var exts = string.Join(',', BookExtensions.Select(e => $"'{e}'"));
			var sql = $@"
				SELECT f.id, f.user_id, f.file_name, f.folder_path, f.file_type, f.file_size,
				       f.is_public, f.shared_with, f.upload_date, f.access_count,
				       u.username AS owner_name
				FROM maxhanna.file_uploads f
				LEFT JOIN maxhanna.users u ON u.id = f.user_id
				LEFT JOIN maxhanna.book_library b ON b.file_id = f.id AND b.user_id = @UserId
				WHERE b.id IS NULL
				  AND LOWER(SUBSTRING_INDEX(f.file_name, '.', -1)) IN ({exts})
				  AND (f.is_folder IS NULL OR f.is_folder = 0)
				  AND f.folder_path LIKE '%/Books/'";
			if (onlyPublic)
			{
				// Public files, plus files shared directly with this caller.
				sql += "\n				  AND (f.is_public = 1 OR (@UserId > 0 AND f.shared_with IS NOT NULL AND f.shared_with != '' AND FIND_IN_SET(@UserId, f.shared_with) > 0))";
			}
			else
			{
				sql += "\n				  AND f.user_id = @UserId";
			}
			sql += "\n				ORDER BY f.upload_date DESC\n				LIMIT 500";

			using (var conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", userId);
				using var rdr = await cmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync())
				{
					var fileName = rdr.IsDBNull(rdr.GetOrdinal("file_name")) ? "" : rdr.GetString("file_name");
					var ext = Path.GetExtension(fileName).TrimStart('.').ToLowerInvariant();
					var sharedWith = rdr.IsDBNull(rdr.GetOrdinal("shared_with")) ? "" : rdr.GetString("shared_with");
					var sharedIds = new List<int>();
					if (!string.IsNullOrWhiteSpace(sharedWith))
					{
						foreach (var p in sharedWith.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
							if (int.TryParse(p, out var i)) sharedIds.Add(i);
					}
					list.Add(new BookDto
					{
						BookId = 0, // unregistered — client offers "Add to library"
						FileId = rdr.GetInt32("id"),
						FolderPath = rdr.IsDBNull(rdr.GetOrdinal("folder_path")) ? null : rdr.GetString("folder_path"),
						OwnerId = rdr.GetInt32("user_id"),
						FileOwnerId = rdr.GetInt32("user_id"),
						OwnerName = rdr.IsDBNull(rdr.GetOrdinal("owner_name")) ? "Unknown" : rdr.GetString("owner_name"),
						Title = Path.GetFileNameWithoutExtension(fileName),
						FileType = ext,
						FileSize = rdr.IsDBNull(rdr.GetOrdinal("file_size")) ? 0 : rdr.GetInt64("file_size"),
						IsPublic = !rdr.IsDBNull(rdr.GetOrdinal("is_public")) && rdr.GetBoolean("is_public"),
						SharedWith = sharedIds,
						CreatedUtc = rdr.IsDBNull(rdr.GetOrdinal("upload_date")) ? DateTime.UtcNow : rdr.GetDateTime("upload_date"),
						UpdatedUtc = rdr.IsDBNull(rdr.GetOrdinal("upload_date")) ? DateTime.UtcNow : rdr.GetDateTime("upload_date"),
						UploadDateUtc = rdr.IsDBNull(rdr.GetOrdinal("upload_date")) ? null : rdr.GetDateTime("upload_date"),
						AccessCount = rdr.IsDBNull(rdr.GetOrdinal("access_count")) ? 0 : rdr.GetInt32("access_count"),
					});
				}
			}
			return list;
		}

		private BookDto MapBook(MySqlDataReader r)
		{
			var fileName = r.IsDBNull(r.GetOrdinal("file_name")) ? "" : r.GetString("file_name");
			var ext = Path.GetExtension(fileName).TrimStart('.').ToLowerInvariant();
			var sharedWith = r.IsDBNull(r.GetOrdinal("shared_with")) ? "" : r.GetString("shared_with");
			var sharedIds = new List<int>();
			if (!string.IsNullOrWhiteSpace(sharedWith))
			{
				foreach (var p in sharedWith.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
					if (int.TryParse(p, out var i)) sharedIds.Add(i);
			}

			// Cover images are plain static assets under the Uploads root — the
			// same URL pattern the site already uses for display pictures. An
			// <img src> cannot call the POST GetFileById endpoint, so convert the
			// stored absolute folder_path to a relative /assets/Uploads/... path.
			string? coverUrl = null;
			if (!r.IsDBNull(r.GetOrdinal("cover_file_id")))
			{
				var coverName = r.IsDBNull(r.GetOrdinal("cover_name")) ? null : r.GetString("cover_name");
				var coverFolder = r.IsDBNull(r.GetOrdinal("cover_folder")) ? null : r.GetString("cover_folder");
				if (!string.IsNullOrWhiteSpace(coverName) && !string.IsNullOrWhiteSpace(coverFolder))
				{
					// Convert the stored absolute upload path into the site-relative
					// /assets/... URL by stripping everything before the Uploads root.
					var normFolder = coverFolder.Replace("\\", "/");
					var marker = "/assets/Uploads/";
					var idx = normFolder.IndexOf("Uploads/", StringComparison.OrdinalIgnoreCase);
					if (idx >= 0)
					{
						var rel = normFolder[(idx + "Uploads/".Length)..];
						coverUrl = $"{marker}{rel}{Uri.EscapeDataString(coverName)}";
					}
				}
			}

			return new BookDto
			{
				BookId = r.GetInt32("book_id"),
				FileId = r.GetInt32("file_id"),
				OwnerId = r.GetInt32("owner_id"),
				FileOwnerId = r.IsDBNull(r.GetOrdinal("file_owner_id")) ? 0 : r.GetInt32("file_owner_id"),
				// For saved copies the card should credit the original uploader,
				// not the user who saved it into their library.
				OwnerName = r.IsDBNull(r.GetOrdinal("owner_name")) ? "Unknown" :
					(r.GetInt32("owner_id") != r.GetInt32("file_owner_id") &&
					 !r.IsDBNull(r.GetOrdinal("file_owner_name")))
						? r.GetString("file_owner_name")
						: r.GetString("owner_name"),
				Title = r.IsDBNull(r.GetOrdinal("title")) ? Path.GetFileNameWithoutExtension(fileName) : r.GetString("title"),
				Author = r.IsDBNull(r.GetOrdinal("author")) ? null : r.GetString("author"),
				Description = r.IsDBNull(r.GetOrdinal("description")) ? null : r.GetString("description"),
				CoverFileId = r.IsDBNull(r.GetOrdinal("cover_file_id")) ? null : r.GetInt32("cover_file_id"),
				CoverUrl = coverUrl,
				FolderPath = r.IsDBNull(r.GetOrdinal("folder_path")) ? null : r.GetString("folder_path"),
				FileType = ext,
				FileSize = r.IsDBNull(r.GetOrdinal("file_size")) ? 0 : r.GetInt64("file_size"),
				IsPublic = r.GetBoolean("is_public"),
				SharedWith = sharedIds,
				CreatedUtc = r.GetDateTime("book_created"),
				UpdatedUtc = r.GetDateTime("book_updated"),
				UploadDateUtc = r.IsDBNull(r.GetOrdinal("upload_date")) ? null : r.GetDateTime("upload_date"),
				AccessCount = r.IsDBNull(r.GetOrdinal("access_count")) ? 0 : r.GetInt32("access_count"),
			};
		}			public class BookDto
			{
				public int BookId { get; set; }
				public int FileId { get; set; }
				/// <summary>Absolute upload folder of the underlying file — the
				/// client derives the Books/-relative folder from it.</summary>
				public string? FolderPath { get; set; }
				public int OwnerId { get; set; }
				/// <summary>Owner of the underlying uploaded file (differs from
				/// OwnerId when a user saved a copy of someone else's book).</summary>
				public int FileOwnerId { get; set; }
				public string OwnerName { get; set; } = "Unknown";
			public string Title { get; set; } = "";
			public string? Author { get; set; }
			public string? Description { get; set; }
			public int? CoverFileId { get; set; }
			public string? CoverUrl { get; set; }
			public string FileType { get; set; } = "";
			public long FileSize { get; set; }
			public bool IsPublic { get; set; }
			public List<int> SharedWith { get; set; } = new();
			public DateTime CreatedUtc { get; set; }
			public DateTime UpdatedUtc { get; set; }
			public DateTime? UploadDateUtc { get; set; }
			public int AccessCount { get; set; }
		}
	}
}
