-- Create table for user event preferences
CREATE TABLE IF NOT EXISTS maxhanna.user_event_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_event (user_id, event_type),
    FOREIGN KEY (user_id) REFERENCES maxhanna.users(id) ON DELETE CASCADE
);