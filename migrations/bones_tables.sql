-- Bones game tables (mirrored from meta_* equivalents). Adjust types/sizes if original schema differs.

CREATE TABLE IF NOT EXISTS bones_hero (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  coordsX INT NOT NULL DEFAULT 0,
  coordsY INT NOT NULL DEFAULT 0,
  speed INT NOT NULL DEFAULT 1,
  map VARCHAR(64) NOT NULL DEFAULT 'HeroRoom',
  color VARCHAR(32) NULL,
  mask INT NULL,
  created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_bones_hero_user (user_id),
  UNIQUE KEY uk_bones_hero_user (user_id),
  UNIQUE KEY uk_bones_hero_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bones_bot (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hero_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  type INT NOT NULL,
  hp INT NOT NULL DEFAULT 100,
  exp INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  is_deployed TINYINT(1) NOT NULL DEFAULT 0,
  created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_bones_bot_hero (hero_id),
  CONSTRAINT fk_bones_bot_hero FOREIGN KEY (hero_id) REFERENCES bones_hero(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bones_bot_part (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hero_id INT NOT NULL,
  metabot_id INT NULL,
  part_name VARCHAR(50) NOT NULL,
  type INT NOT NULL DEFAULT 0,
  damage_mod INT NOT NULL DEFAULT 1,
  skill VARCHAR(64) NULL,
  last_used TIMESTAMP NULL DEFAULT NULL,
  created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_bones_bot_part_hero (hero_id),
  INDEX ix_bones_bot_part_metabot (metabot_id),
  CONSTRAINT fk_bones_bot_part_hero FOREIGN KEY (hero_id) REFERENCES bones_hero(id) ON DELETE CASCADE,
  CONSTRAINT fk_bones_bot_part_metabot FOREIGN KEY (metabot_id) REFERENCES bones_bot(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bones_event (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hero_id INT NOT NULL,
  event VARCHAR(64) NOT NULL,
  map VARCHAR(64) NOT NULL,
  data JSON NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_bones_event_hero (hero_id),
  INDEX ix_bones_event_map (map),
  CONSTRAINT fk_bones_event_hero FOREIGN KEY (hero_id) REFERENCES bones_hero(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bones_hero_inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bones_hero_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  image VARCHAR(200) NULL,
  category VARCHAR(64) NULL,
  quantity INT NULL,
  created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_bones_inventory_hero_name (bones_hero_id, name),
  CONSTRAINT fk_bones_inventory_hero FOREIGN KEY (bones_hero_id) REFERENCES bones_hero(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bones_hero_crypto (
  hero_id INT NOT NULL PRIMARY KEY,
  crypto_balance BIGINT NOT NULL DEFAULT 0,
  updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bones_crypto_hero FOREIGN KEY (hero_id) REFERENCES bones_hero(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bones_encounter (
  hero_id INT NOT NULL PRIMARY KEY, -- negative hero_id logic mirrors meta implementation
  coordsX INT NOT NULL DEFAULT -1,
  coordsY INT NOT NULL DEFAULT -1,
  last_killed TIMESTAMP NULL,
  map VARCHAR(64) NOT NULL,
  created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bones_encounter_bot_part (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hero_id INT NOT NULL, -- encounter hero id (negative)
  part_name VARCHAR(50) NOT NULL,
  type INT NOT NULL DEFAULT 0,
  damage_mod INT NOT NULL DEFAULT 1,
  skill VARCHAR(64) NULL,
  last_used TIMESTAMP NULL DEFAULT NULL,
  created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_bones_encounter_part_hero (hero_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bones_hero_party (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bones_hero_id_1 INT NOT NULL,
  bones_hero_id_2 INT NOT NULL,
  created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_bones_party_pair (bones_hero_id_1, bones_hero_id_2),
  INDEX ix_bones_party_hero1 (bones_hero_id_1),
  INDEX ix_bones_party_hero2 (bones_hero_id_2),
  CONSTRAINT fk_bones_party_hero1 FOREIGN KEY (bones_hero_id_1) REFERENCES bones_hero(id) ON DELETE CASCADE,
  CONSTRAINT fk_bones_party_hero2 FOREIGN KEY (bones_hero_id_2) REFERENCES bones_hero(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
