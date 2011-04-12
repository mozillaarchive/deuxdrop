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
    
    static public function list_messages($folder, $start=0, $num_msgs=25) {
        $flags = 0;
        $search = NULL;
        if(isset($_POST['start']))
            $start = $_POST['start'];
        if(isset($_POST['num_msgs']))
            $num_msgs = $_POST['num_msgs'];
        if(isset($_POST['flags']))
            $search = $_POST['flags'];
        if(isset($_POST['search']))
            $search = $_POST['search'];

        $imap = new ImapBase($folder);
        return $imap->list_messages($start, $num_msgs, $flags, $search);
    }

    static public function send_message() {
        $imap = new ImapBase();
        return $imap->send_message();
    }
}