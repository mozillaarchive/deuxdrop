create database email;
GRANT SELECT ON email.* to 'postfix'@'localhost' IDENTIFIED BY 'psw0rd';
GRANT SELECT ON email.* to 'postfix'@'localhost.localdomain' IDENTIFIED BY 'psw0rd';

use email;

#+-------------+
#| domain      |
#+-------------+
#| raindrop.it |
#+-------------+

CREATE TABLE `domains` (
  `domain` varchar(128) NOT NULL,
  PRIMARY KEY (`domain`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;


#+-----------------+---------------------+
#| source          | destination         |
#+-----------------+---------------------+
#| joe@raindrop.it | clarkbw@raindrop.it |
#+-----------------+---------------------+

CREATE TABLE `forwardings` (
  `source` varchar(255) NOT NULL,
  `destination` varchar(255) NOT NULL,
  PRIMARY KEY (`source`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8

#+---------------------+---------------+
#| email               | password      |
#+---------------------+---------------+
#| clarkbw@raindrop.it | i/AYUx.6XMDtk |
#+---------------------+---------------+

CREATE TABLE `users` (
  `email` varchar(255) NOT NULL,
  `password` varchar(48) NOT NULL,
  PRIMARY KEY (`email`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8


# main.cf

### VIRTUAL MAIL DEFINITIONS ###
virtual_alias_domains =
virtual_alias_maps = proxy:mysql:/etc/postfix/mysql-virtual_forwardings.cf, mysql:/etc/postfix/mysql-virtual_email2email.cf
virtual_mailbox_domains = proxy:mysql:/etc/postfix/mysql-virtual_domains.cf
virtual_mailbox_maps = proxy:mysql:/etc/postfix/mysql-virtual_mailboxes.cf

# XXX deprecated, we deliver to Maildir and then pickup instead of pushing into our Python
#virtual_transport = raindrop

virtual_mailbox_base = /home/email/
virtual_uid_maps = static:501
virtual_gid_maps = static:5000

virtual_create_maildirsize = yes
virtual_maildir_extended = yes


# services with proxy: allows postfix to use a single proxy connection to our database and must be listed here 
proxy_read_maps = $virtual_alias_maps $virtual_mailbox_domains $virtual_mailbox_maps

# master.cf
# XXX deprecated we don't want to have our python process responsible for reliable transport
raindrop  unix  -       n       n       -       -       pipe
  directory=/usr/local/mail/ flags=DRhu user=email argv=/usr/local/bin/process-email.py --username ${user} --domain ${domain} --mailbox ${mailbox}


create database messages;

GRANT INSERT ON messages.* to 'python'@'localhost' IDENTIFIED BY 'psw0rd';
GRANT INSERT ON messages.* to 'python'@'localhost.localdomain' IDENTIFIED BY 'psw0rd';

use messages;

CREATE TABLE `messages` (
  `date` datetime NOT NULL,
  `file` varchar(255) NOT NULL,
  `domain` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
) ENGINE=MyISAM DEFAULT CHARSET=utf8

