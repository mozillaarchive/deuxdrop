# 1) Run this with `mysql -u root -p < messages.sql`
# B) Follow instructions for messages-grant.sql

create database messages;

use messages;

CREATE TABLE `messages` (
  `date` datetime NOT NULL,
  `file` varchar(255) NOT NULL,
  `domain` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
) ENGINE=MyISAM DEFAULT CHARSET=utf8
