# 1) Run this with `mysql -u root -p < email.sql`
# B) Follow instructions for email-grant.sql

create database email;

use email;

CREATE TABLE `domains` (
  `domain` varchar(128) NOT NULL,
  PRIMARY KEY (`domain`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;

CREATE TABLE `forwardings` (
  `source` varchar(255) NOT NULL,
  `destination` varchar(255) NOT NULL,
  PRIMARY KEY (`source`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8

CREATE TABLE `users` (
  `email` varchar(255) NOT NULL,
  `password` varchar(48) NOT NULL,
  PRIMARY KEY (`email`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8
