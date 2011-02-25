<?php

/* example: {ch.tudelft.nl:993/imap/ssl/novalidate-cert}INBOX
For more info: http://php.net/manual/en/function.imap-open.php */

function config() {
    return array(
        'spec'=>'{mail.fubar.com:993/imap/ssl/novalidate-cert}',
        'mailbox'=>'INBOX',
        'username'=>'you@fubar.com',
        'password'=>'yourpassword'
    );
}