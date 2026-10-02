-- Guest account sign-up counter.
--
-- The application creates this table automatically on first use
-- (UserController.EnsureGuestAccountCountTableAsync), so running this script
-- manually is optional. It holds a single row whose guest_count is incremented
-- by POST /User/CreateUser whenever an account with a "GuestXYZ" username is
-- created, and read by GET /User/GuestAccountCount.

CREATE TABLE IF NOT EXISTS maxhanna.guest_account_counts (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  guest_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO maxhanna.guest_account_counts (id, guest_count) VALUES (1, 0);
