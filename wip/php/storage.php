<?php
require_once 'imap.php';

class storage {
    static public function get_message($mid) {
        $imap = new ImapBase();
        return $imap->get_message($mid);
    }

    static public function list_folders() {
        $imap = new ImapBase();
        return $imap->list_folders();
    }
    
    static public function list_messages($num_msgs=0) {
        $imap = new ImapBase();
        return $imap->list_messages($num_msgs);
    }

    static public function send_message() {
        $imap = new ImapBase();
        return $imap->send_message();
    }
}