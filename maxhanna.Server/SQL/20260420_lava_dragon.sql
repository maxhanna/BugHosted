-- Migration: Add table to persist Lava Dragon companion ownership and home position
-- Date: 2026-04-20

CREATE TABLE IF NOT EXISTS `maxhanna`.`digcraft_lava_dragon_companions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `world_id` INT NOT NULL,
  `home_x` FLOAT NOT NULL,
  `home_y` FLOAT NOT NULL,
  `home_z` FLOAT NOT NULL,
  `owner_user_id` INT NOT NULL DEFAULT 0,
  `is_following` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_world` (`world_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
