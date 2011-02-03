# deuxdrop components

* Linux
* Postfix
  * Postfix-mysql
* MySQL
* Maildir
* Python `process.py`
* Node.js

## Linux

The Linux/Unix system requires a user who holds all the Maildir messages which Postfix delivers to, we use the `email` user.

First create the `email` group for our user.

    groupadd email --gid 5000

Then create the `email` user locking down its account so there is no login allowed.  The `-m` option creates our required `/home/email/` directory.

    useradd email --gid 5000 --uid 5000 --shell /sbin/nologin -m

**NOTE:** the use of `5000` for both our `gid` and `uid`, this number is referenced in the Postfix `main.cf`

## Postfix

    yum install postfix

### /etc/postfix/main.cf

    virtual_alias_domains =
    virtual_alias_maps = proxy:mysql:/etc/postfix/mysql-virtual_forwardings.cf, proxy:mysql:/etc/postfix/mysql-virtual_email2email.cf
    virtual_mailbox_domains = proxy:mysql:/etc/postfix/mysql-virtual_domains.cf
    virtual_mailbox_maps = proxy:mysql:/etc/postfix/mysql-virtual_mailboxes.cf

    virtual_mailbox_base = /home/email/
    virtual_uid_maps = static:5000
    virtual_gid_maps = static:5000

    virtual_create_maildirsize = yes
    virtual_maildir_extended = yes

    # services with proxy: allows postfix to use a single proxy connection to our database and must be listed here 
    proxy_read_maps = $virtual_alias_maps $virtual_mailbox_domains $virtual_mailbox_maps

## Postfix-MySQL

    yum install postfix-mysql

These MySQL config files are placed in the `/etc/postfix/` directory and referenced from the main.cf file

We use a `postfix` user to access the MySQL tables, this user has SELECT access only to our `email` table.

**NOTE:** the use of `PASSWORD` where our `postfix` user password should be

### /etc/postfix/mysql-virtual_forwardings.cf

Creates a virtual forwards user1@domain to user2@domain _not currently required, but useful_

    user = postfix
    password = PASSWORD
    dbname = email
    query = SELECT destination FROM forwardings WHERE source='%s'
    hosts = 127.0.0.1

### /etc/postfix/mysql-virtual_email2email.cf

Ensures that our user email gets mapped to our users

    user = postfix
    password = PASSWORD
    dbname = email
    query = SELECT email FROM users WHERE email='%s'
    hosts = 127.0.0.1

### /etc/postfix/mysql-virtual_domains.cf

Provides postfix with the domain name it should accept messages for e.g. `raindrop.it`

    user = postfix
    password = PASSWORD
    dbname = email
    query = SELECT domain AS virtual FROM domains WHERE domain='%s'
    hosts = 127.0.0.1

### /etc/postfix/mysql-virtual_mailboxes.cf

Provides the virtual mailbox file location by taking `user@domain` and splitting it into `$MAILDIR/domain/user/`

    user = postfix
    password = PASSWORD
    dbname = email
    query = SELECT CONCAT(SUBSTRING_INDEX(email,'@',-1),'/',SUBSTRING_INDEX(email,'@',1),'/') FROM users WHERE email='%s'
    hosts = 127.0.0.1

## MySQL

    yum install mysql-server

This table information will be available in an SQL file and will be checked into the repo such that you could run `mysql -u root -p < email.sql`

### EMAIL TABLE

Create the email table that Postfix will use to handle routing and delivery.

    create database email;

Give the `postfix` user SELECT only privileges on the database.

**NOTE:** the use of `PASSWORD` where our `postfix` user password should be

    GRANT SELECT ON email.* to 'postfix'@'localhost' IDENTIFIED BY 'PASSWORD';
    GRANT SELECT ON email.* to 'postfix'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';

We give the `node` user more privileges than `postfix` but only to the `users` table.

**NOTE:** the use of `PASSWORD` where our `node` user password should be

    GRANT SELECT,UPDATE,INSERT,DELETE ON email.users to 'node'@'localhost' IDENTIFIED BY 'PASSWORD';
    GRANT SELECT,UPDATE,INSERT,DELETE ON email.users to 'node'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';

    use email;

#### DOMAIN TABLE

    +-------------+
    | domain      |
    +-------------+
    | raindrop.it |
    +-------------+

    CREATE TABLE `domains` (
      `domain` varchar(128) NOT NULL,
      PRIMARY KEY (`domain`)
    ) ENGINE=MyISAM DEFAULT CHARSET=utf8;

#### FORWARDINGS TABLE

    +-----------------+---------------------+
    | source          | destination         |
    +-----------------+---------------------+
    | joe@raindrop.it | clarkbw@raindrop.it |
    +-----------------+---------------------+

    CREATE TABLE `forwardings` (
      `source` varchar(255) NOT NULL,
      `destination` varchar(255) NOT NULL,
      PRIMARY KEY (`source`)
    ) ENGINE=MyISAM DEFAULT CHARSET=utf8

#### USERS TABLE

Provides our users and their passwords for authentication.

    +---------------------+---------------+
    | email               | password      |
    +---------------------+---------------+
    | clarkbw@raindrop.it | i/AYUx.6XMDtk |
    +---------------------+---------------+

    CREATE TABLE `users` (
      `email` varchar(255) NOT NULL,
      `password` varchar(48) NOT NULL,
      PRIMARY KEY (`email`)
    ) ENGINE=MyISAM DEFAULT CHARSET=utf8


### MESSAGES TABLE

This table handles the index of messages received and processed by the system.

It is designed to be a single lightweight and fast table avoiding joins and other costly queries.

    create database messages;

We grant `INSERT` only access to a `python` user for creating the message index as it processes messages.

**NOTE:** the use of `PASSWORD` where our `python` user password should be

    GRANT INSERT ON messages.* to 'python'@'localhost' IDENTIFIED BY 'PASSWORD';
    GRANT INSERT ON messages.* to 'python'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';

We grant more privileges to our `node` user than our `python` user.

**NOTE:** the use of `PASSWORD` where our `node` user password should be

    GRANT SELECT,UPDATE,INSERT,DELETE ON messages.* to 'node'@'localhost' IDENTIFIED BY 'PASSWORD';
    GRANT SELECT,UPDATE,INSERT,DELETE ON messages.* to 'node'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';

    use messages;

    CREATE TABLE `messages` (
      `date` datetime NOT NULL,
      `file` varchar(255) NOT NULL,
      `domain` varchar(255) NOT NULL,
      `username` varchar(255) NOT NULL,
    ) ENGINE=MyISAM DEFAULT CHARSET=utf8


## Maildir

All mail from Postfix is dropped into the configured location for our `email` user as `/home/email/`.

For `user@domain` the directory layout will look like `/home/email/domain/user/` and then Maildir will add 3 subdirectories to that; `/home/email/domain/user/{tmp,cur,new}`

Initially messages are delivered to `tmp` and then once the write is complete they are moved to `new`; completing delivery.

The `cur` directory is never used in this system.  Normally email clients move messages from the `new` to the `cur` directory as they are opened but we are deleting them after opening them; this may change.

## Python `process.py`

    yum install MySQL-python notify-python python-simplejson python-dateutil
    mkdir /var/www/email

The Python process needs to be daemonized and run when the system is started as the `email` user.

_Pseudo code:_

* Recursively watch `/home/email/` for new files in the Maildir directories
* For each new message convert into JSON format
* For each new message write JSON format to files in `/var/www/email/`
* For each new message create entry in MySQL `messsages.messsages`

## Node.js

**NOT IMPLEMENTED**

_Pseudo code:_

* Authenticate users against the `email.users` table
* provide API access to message index and message JSON files
