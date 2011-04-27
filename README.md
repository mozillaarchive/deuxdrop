# deuxdrop components

* Linux
* Postfix
  * Postfix-mysql
* MySQL
* Python `process.py`
* Node.js

## Linux

The Linux/Unix system requires a user who holds all the Maildir messages which Postfix delivers to, we use the `email` user.

First create the `email` group for our user.

    groupadd email --gid 5000

Then create the `email` user locking down its account so there is no login allowed.

    useradd email --gid 5000 --uid 5000 --shell /sbin/nologin

**NOTE:** the use of `5000` for both our `gid` and `uid`, any number could be chosen for this value.

## Postfix

    yum install postfix

The included [main.cf](https://github.com/mozilla/deuxdrop/blob/master/postfix/main.cf) inside the [postfix](https://github.com/mozilla/deuxdrop/tree/master/postfix) directory can simply be concatenated to existing your `/etc/postfix/main.cf`.  A `/etc/init.d/postfix reload` will be required after changing the config

### [/etc/postfix/main.cf](https://github.com/mozilla/deuxdrop/blob/master/postfix/main.cf)

    ### LOCAL RECIPIENTS ###
    # This should prevent local users (/etc/passwd) from having emails on our system
    # XXX we should ensure that 'postmaster' still has a viable address as that is required
    mydestination = localhost
    local_recipient_maps =

    # reset any virtual aliases to none, next line provides ones we want
    virtual_alias_domains =
    # use mysql to provide our domain alias mapping for both forwards and users
    virtual_alias_maps = proxy:mysql:/etc/postfix/mysql-virtual_forwardings.cf, proxy:mysql:/etc/postfix/mysql-virtual_email2email.cf

    # XXX not sure this is necessary anymore
    virtual_mailbox_domains = proxy:mysql:/etc/postfix/mysql-virtual_domains.cf

    # Use the LMTP delivery method
    virtual_transport = lmtp:inet:localhost:10025

    # services with proxy: allows postfix to use a single proxy connection to our database and must be listed here 
    proxy_read_maps = $virtual_alias_maps $virtual_mailbox_domains

## Postfix-MySQL

    yum install postfix-mysql

These MySQL config files are placed in the `/etc/postfix/` directory and referenced from the main.cf file

We use a `postfix` user to access the MySQL tables, this user has SELECT access only to our `email` table.

**NOTE:** the use of `PASSWORD` where our `postfix` user password should be

### [/etc/postfix/mysql-virtual_forwardings.cf](https://github.com/mozilla/deuxdrop/blob/master/postfix/mysql-virtual_forwardings.cf)

Creates a virtual forwards `user1@domain` to `user2@domain` _not currently required, but useful_

    user = postfix
    password = PASSWORD
    dbname = email
    query = SELECT destination FROM forwardings WHERE source='%s'
    hosts = 127.0.0.1

### [/etc/postfix/mysql-virtual_email2email.cf](https://github.com/mozilla/deuxdrop/blob/master/postfix/mysql-virtual_email2email.cf)

Ensures that our user email gets mapped to our users

    user = postfix
    password = PASSWORD
    dbname = email
    query = SELECT email FROM users WHERE email='%s'
    hosts = 127.0.0.1

### [/etc/postfix/mysql-virtual_domains.cf](https://github.com/mozilla/deuxdrop/blob/master/postfix/mysql-virtual_domains.cf)

Provides postfix with the domain name it should accept messages for e.g. `raindrop.it`

    user = postfix
    password = PASSWORD
    dbname = email
    query = SELECT domain AS virtual FROM domains WHERE domain='%s'
    hosts = 127.0.0.1

### [/etc/postfix/mysql-virtual_mailboxes.cf](https://github.com/mozilla/deuxdrop/blob/master/postfix/mysql-virtual_mailboxes.cf)

Provides the virtual mailbox file location by taking `user@domain` and splitting it into `$MAILDIR/domain/user/`

    user = postfix
    password = PASSWORD
    dbname = email
    query = SELECT CONCAT(SUBSTRING_INDEX(email,'@',-1),'/',SUBSTRING_INDEX(email,'@',1),'/') FROM users WHERE email='%s'
    hosts = 127.0.0.1

## MySQL

    yum install mysql-server

**NOTE:** you'll need to run `mysql_install_db` before you can start the server via `/etc/init.d/mysqld start` and then you'll want to change the root password

### EMAIL TABLE

Create the email table that Postfix will use to handle routing and delivery.

_see [email.sql](https://github.com/mozilla/deuxdrop/blob/master/mysql/email.sql)_

    create database email;
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

_see [email-grant.sql](https://github.com/mozilla/deuxdrop/blob/master/mysql/email-grant.sql)_

Give the `postfix` user SELECT only privileges on the database.

**NOTE:** the use of `PASSWORD` where our `postfix` user password should be

    GRANT SELECT ON email.* to 'postfix'@'localhost' IDENTIFIED BY 'PASSWORD';
    GRANT SELECT ON email.* to 'postfix'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';

We give the `node` user more privileges than `postfix` but only to the `users` table.

**NOTE:** the use of `PASSWORD` where our `node` user password should be

    GRANT SELECT,UPDATE,INSERT,DELETE ON email.users to 'node'@'localhost' IDENTIFIED BY 'PASSWORD';
    GRANT SELECT,UPDATE,INSERT,DELETE ON email.users to 'node'@'localhost.localdomain' IDENTIFIED BY 'PASSWORD';

**NOTE:** after adding mysql users you'll need to run `mysqladmin reload` to use their accounts

### MESSAGES HBASE TABLE DESIGN

row id: `USERNAME@DOMAIN:ID`

column:`s` (summary)
    s:subject
    s:message-id
    s:body
    s:date
    s:from
    s:to
    s:cc
    s:bcc

## Python `RaindropLMTPServer.py`

LMTP is essentially ESMTP for local routing only.  We use this service to deliver messages sent to the Postfix service into our HBase storage.

    yum install python-dateutil

`RaindropLMTPServer.py` should be located in the `/usr/local/bin/` directory and owned by the `email` user.

Run the LMTP service once your Postfix service is running `/usr/local/bin/RaindropLMTPServer.py`

* Each new message is converted into JSON format and saved in HBase
* Each new message is also saved in Maildir message format to `/home/email/` directory

## Node.js

**NOT IMPLEMENTED**

_Pseudo code:_

* Authenticate users against the `email.users` table
* provide API access to message index and message JSON files
