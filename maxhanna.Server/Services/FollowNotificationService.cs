using MySqlConnector;

namespace maxhanna.Server.Services
{
    public class FollowNotificationService
    {
        private readonly string _connectionString;
        private readonly Log _log;
        private readonly IConfiguration _config;
        private readonly EmailService _emailService;

        public FollowNotificationService(IConfiguration config, Log log, EmailService emailService)
        {
            _config = config;
            _log = log;
            _emailService = emailService;
            _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna")!;
        }

        public async Task SendFollowNotifications()
        {
            Console.WriteLine("[FollowNotif] Checking for new comments on followed content...");
            try
            {
                using var conn = new MySqlConnection(_connectionString);
                await conn.OpenAsync();

                const string sql = @"
                    SELECT f.user_id AS follower_id, f.follow_type, f.follow_id,
                           c.id AS comment_id, c.user_id AS commenter_id,
                           COALESCE(u.username, 'Someone') AS commenter_name,
                           COALESCE(us.follow_notifications_push, 1) AS want_push,
                           COALESCE(us.follow_notifications_email, 0) AS want_email,
                           COALESCE(ua.email, '') AS email
                    FROM user_follows f
                    JOIN comments c ON (
                        (f.follow_type = 'story' AND c.story_id = f.follow_id) OR
                        (f.follow_type = 'file' AND c.file_id = f.follow_id) OR
                        (f.follow_type = 'comment' AND c.comment_id = f.follow_id)
                    )
                    JOIN users u ON u.id = c.user_id
                    LEFT JOIN user_settings us ON us.user_id = f.user_id
                    LEFT JOIN user_about ua ON ua.user_id = f.user_id
                    WHERE c.date >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)
                      AND c.user_id != f.user_id
                      AND NOT EXISTS (
                          SELECT 1 FROM follow_notifications_sent fns
                          WHERE fns.user_id = f.user_id
                            AND fns.follow_type = f.follow_type
                            AND fns.follow_id = f.follow_id
                            AND fns.triggered_by_comment_id = c.id
                      )
                    ORDER BY f.user_id";

                using var cmd = new MySqlCommand(sql, conn);
                using var reader = await cmd.ExecuteReaderAsync();

                int pushSent = 0, emailSent = 0;
                var firebaseService = new FirebaseNotificationService(_log, _config);

                while (await reader.ReadAsync())
                {
                    int followerId = reader.GetInt32("follower_id");
                    string followType = reader.GetString("follow_type");
                    int followId = reader.GetInt32("follow_id");
                    int commentId = reader.GetInt32("comment_id");
                    string commenterName = reader.IsDBNull(reader.GetOrdinal("commenter_name")) ? "Someone" : reader.GetString("commenter_name");
                    bool wantPush = !reader.IsDBNull(reader.GetOrdinal("want_push")) && reader.GetInt32("want_push") == 1;
                    bool wantEmail = !reader.IsDBNull(reader.GetOrdinal("want_email")) && reader.GetInt32("want_email") == 1;
                    string email = reader.IsDBNull(reader.GetOrdinal("email")) ? "" : reader.GetString("email");

                    string subject = followType switch
                    {
                        "story" => "New comment on a story you follow",
                        "file" => "New comment on a file you follow",
                        "comment" => "New reply on a comment you follow",
                        _ => "New activity on something you follow"
                    };
                    string message = commenterName + " commented on a " + followType + " you follow.";

                    if (wantPush)
                    {
                        try { await firebaseService.SendFirebaseNotification(followerId, message); pushSent++; }
                        catch (Exception ex) { _ = _log.Db("Failed push for follow notif (user " + followerId + "): " + ex.Message, followerId, "FOLLOW", outputToConsole: true); }
                    }

                    if (wantEmail && !string.IsNullOrEmpty(email))
                    {
                        try
                        {
                            await _emailService.SendEmailAsync(email, subject, message + "\n\nVisit https://bughosted.com to view it.");
                            emailSent++;
                        }
                        catch (Exception ex) { _ = _log.Db("Failed email for follow notif (user " + followerId + "): " + ex.Message, followerId, "FOLLOW", outputToConsole: true); }
                    }

                    // Record sent notifications
                    try
                    {
                        using var insConn = new MySqlConnection(_connectionString);
                        await insConn.OpenAsync();
                        if (wantPush)
                        {
                            using var insCmd = new MySqlCommand(
                                "INSERT IGNORE INTO follow_notifications_sent (user_id, follow_type, follow_id, triggered_by_comment_id, notification_type) VALUES (@uid, @ft, @fid, @cid, 'push')", insConn);
                            insCmd.Parameters.AddWithValue("@uid", followerId);
                            insCmd.Parameters.AddWithValue("@ft", followType);
                            insCmd.Parameters.AddWithValue("@fid", followId);
                            insCmd.Parameters.AddWithValue("@cid", commentId);
                            await insCmd.ExecuteNonQueryAsync();
                        }
                        if (wantEmail && !string.IsNullOrEmpty(email))
                        {
                            using var insCmd2 = new MySqlCommand(
                                "INSERT IGNORE INTO follow_notifications_sent (user_id, follow_type, follow_id, triggered_by_comment_id, notification_type) VALUES (@uid, @ft, @fid, @cid, 'email')", insConn);
                            insCmd2.Parameters.AddWithValue("@uid", followerId);
                            insCmd2.Parameters.AddWithValue("@ft", followType);
                            insCmd2.Parameters.AddWithValue("@fid", followId);
                            insCmd2.Parameters.AddWithValue("@cid", commentId);
                            await insCmd2.ExecuteNonQueryAsync();
                        }
                    }
                    catch { }
                }

                if (pushSent > 0 || emailSent > 0)
                    Console.WriteLine("[FollowNotif] Sent " + pushSent + " push + " + emailSent + " email follow notifications.");
                else
                    Console.WriteLine("[FollowNotif] No new follow notifications to send.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("[FollowNotif] Error: " + ex.Message);
            }
        }

        public async Task DeleteOldFollowNotifications()
        {
            try
            {
                using var conn = new MySqlConnection(_connectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(
                    "DELETE FROM follow_notifications_sent WHERE sent_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)", conn);
                int deleted = await cmd.ExecuteNonQueryAsync();
                if (deleted > 0)
                    Console.WriteLine("[FollowNotif] Cleaned up " + deleted + " old follow notification records.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("[FollowNotif] Cleanup error: " + ex.Message);
            }
        }
    }
}
