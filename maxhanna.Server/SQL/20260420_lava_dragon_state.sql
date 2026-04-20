-- Migration: Add persisted state columns for Lava Dragon companions
-- Date: 2026-04-20

ALTER TABLE `maxhanna`.`digcraft_lava_dragon_companions`
  ADD COLUMN IF NOT EXISTS `health` INT NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS `max_health` INT NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS `pos_x` FLOAT NULL,
  ADD COLUMN IF NOT EXISTS `pos_y` FLOAT NULL,
  ADD COLUMN IF NOT EXISTS `pos_z` FLOAT NULL,
  ADD COLUMN IF NOT EXISTS `died_at_ms` BIGINT NOT NULL DEFAULT 0;

-- Backfill: copy home_ coordinates into pos_* for existing rows if pos is null
UPDATE `maxhanna`.`digcraft_lava_dragon_companions` SET pos_x = COALESCE(pos_x, home_x), pos_y = COALESCE(pos_y, home_y), pos_z = COALESCE(pos_z, home_z);
