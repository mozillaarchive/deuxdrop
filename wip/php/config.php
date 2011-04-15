<?php

/* example: {ch.tudelft.nl:993/imap/ssl/novalidate-cert}INBOX
For more info: http://php.net/manual/en/function.imap-open.php */

function config() {
    return array(
        'spec'=>'{imap.gmail.com:993/imap/ssl}',
        //'spec'=>'{mail.caraveo.com:993/imap/ssl/novalidate-cert}',
        'mailbox'=>'INBOX',
    );
}
