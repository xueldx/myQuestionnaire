/*
 Sanitized schema-only SQL for local development.
 This file intentionally excludes production data, personal accounts, and real host metadata.
 After importing the schema, create your own local test users through the application or SQL.
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `question`;
CREATE TABLE `question` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `answer_count` int NOT NULL DEFAULT '0',
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `is_published` tinyint NOT NULL DEFAULT '0',
  `description` varchar(255) NOT NULL DEFAULT '暂无描述',
  `author` varchar(255) NOT NULL DEFAULT '官方',
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `author_id` int NOT NULL,
  `is_deleted` tinyint NOT NULL DEFAULT '0' COMMENT '0:未删除, 1:已删除',
  `deleted_at` datetime(6) DEFAULT NULL COMMENT '删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_author_id_is_deleted` (`author_id`, `is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `user`;
CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `password` varchar(255) NOT NULL,
  `nickname` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `avatar` varchar(255) DEFAULT NULL,
  `bio` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_e12875dfb3b1d92d7d7c5377e2` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TABLE IF EXISTS `user_favorites`;
CREATE TABLE `user_favorites` (
  `created_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `user_id` int NOT NULL,
  `question_id` int NOT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`),
  KEY `FK_5238ce0a21cc77dc16c8efe3d36` (`user_id`),
  KEY `FK_09c7eaa2ae773062f54d1749a8f` (`question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP PROCEDURE IF EXISTS `InsertTestQuestions`;
delimiter ;;
CREATE PROCEDURE `InsertTestQuestions`()
BEGIN
  DECLARE i INT DEFAULT 1;

  WHILE i <= 20 DO
    INSERT INTO `question` (
      `title`,
      `description`,
      `author_id`,
      `author`,
      `answer_count`,
      `create_time`,
      `update_time`,
      `is_published`
    )
    VALUES (
      CONCAT('Demo Question ', i),
      CONCAT('Demo Description ', FLOOR(1 + RAND() * 1000)),
      1,
      '官方',
      FLOOR(RAND() * 20),
      NOW(),
      NOW(),
      FLOOR(RAND() * 2)
    );

    SET i = i + 1;
  END WHILE;
END
;;
delimiter ;

SET FOREIGN_KEY_CHECKS = 1;
