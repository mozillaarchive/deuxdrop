<?php
require_once 'config.php';

function error_handler($errno, $errstr) {
    throw new Exception($errstr, $errno);
}

set_error_handler("error_handler");

class ImapBase {
    public function __construct($mailbox=null) {
        $config = config();
        $username = null;
        $password = "not provided";
        $spec = $config["spec"];
        if ($mailbox)
            $folder = $mailbox;
        else
            $folder = '';//$config["mailbox"];

        if(isset($_POST['folder']))
            $folder = $_POST['folder'];
        if(isset($_POST['username']))
            $username = $_POST['username'];
        if(isset($_POST['password']))
            $password = $_POST['password'];

        $this->connect($spec, $folder, $username, $password);
    }

    protected function connection_string() {
        return $this->spec.$this->mailbox;
    }
    
    public function connect($spec, $mailbox, $username, $password) {
        $this->spec = $spec;
        $this->mailbox = $mailbox;
        $this->conn = imap_open($this->connection_string(),$username,$password,OP_READONLY);
    }
    
    public function close() {
        imap_close($this->conn);
    }
    
    private function decodeMimeStr($string, $charset="UTF-8" )
    {
          $newString = '';
          $elements=imap_mime_header_decode($string);
          for($i=0;$i<count($elements);$i++)
          {
            if ($elements[$i]->charset == 'default')
              $elements[$i]->charset = 'iso-8859-1';
            $newString .= iconv($elements[$i]->charset, $charset, $elements[$i]->text);
          }
          return $newString;
    } 

    protected function decode_headers($headers) {
        $msg = array();
        //echo json_encode($headers);
        foreach($headers as $k=>$v) {
            if (is_string($v)) {
                $u = $this->decodeMimeStr($v);
                //$u = imap_utf8($v);
            //echo "$k [$v]->[$u]\n";
                if ($u)
                    $msg[$k] = $u;
                else
                    $msg[$k] = $v;
            } else if (is_scalar($v)) {
                $msg[$k] = $v;
            } else {
                $msg[$k] = $this->decode_headers($v);
            }
            //echo $k." ---> ". json_encode($msg[$k])."\n";
        }
        return $msg;
    }

    public function list_folders() {
        $list = imap_list($this->conn, $this->spec, "*");
        if (is_array($list)) {
            return $list;
        } else {
            //throw new Exception(imap_last_error());
        }
    }
    
    public function list_messages($num_msgs=0) {
        $boxinfo = imap_check($this->conn);
        if ($boxinfo === False) {
            throw Exception(imap_last_error());
        }
        $r = array();
        foreach($boxinfo as $k=>$v) {
            $r[$k] = $v;
        }
        if ($num_msgs == 0)
            $num_msgs = $boxinfo->Nmsgs;
        
        //$r['entries'] = imap_fetch_overview($imap,"1:{$boxinfo->Nmsgs}",0);
        $this->orig_conn = $this->conn;
        $sorted_mbox = imap_sort($this->conn, SORTARRIVAL, 1);
        $totalrows = $boxinfo->Nmsgs;
        if ($totalrows > 200) {
            $totalrows = 200;
        }
        //echo json_encode($sorted_mbox);
        //imap_headers($this->conn);
        $r['entries'] = array();
        for ($i=1; $i < $totalrows; $i++) {
            try {
                $headers = $this->decode_headers(imap_header($this->conn, $sorted_mbox[$i]));
                //$headers['uid'] = imap_uid($this->conn, $sorted_mbox[$i]);
                //assert($headers['uid'] != $headers['MsgNo']);
                array_push($r['entries'], $headers);
            } catch(Exception $e) {
                continue;
            }
        }
        return $r;
    }


    public function get_message($msguid) {
        // input $mbox = IMAP stream, $mid = message id
        // output all the following:
        // the message may in $htmlmsg, $plainmsg, or both
        $htmlmsg = $plainmsg = $charset = '';
        $attachments = array();
        //$mid = imap_msgno($this->conn, $msguid);
        $mid = $msguid;
        $msg = array();
        // HEADER
        $msg['headers'] = $this->decode_headers(imap_header($this->conn ,$mid));
        // add code here to get date, from, to, cc, subject...
    
        // BODY
        $s = imap_fetchstructure($this->conn ,$mid);

        $msg['parts'] = array();
        if (!property_exists($s, 'parts')) {  // not multipart
            array_push($msg['parts'], $this->getpart($mid,$s,0));  // no part-number, so pass 0
        } else {  // multipart: iterate through each part
            foreach ($s->parts as $partno0=>$p)
                array_push($msg['parts'], $this->getpart($mid,$p,$partno0+1));
        }
        return $msg;
    }
    
    protected function getpart($mid, $p, $partno) {
        // $partno = '1', '2', '2.1', '2.1.3', etc if multipart, 0 if not multipart
        $part = array();
        // DECODE DATA
        $data = ($partno)?
            imap_fetchbody($this->conn ,$mid,$partno):  // multipart
            imap_body($this->conn ,$mid);  // not multipart
        //print json_encode($s);
        $part['body'] = NULL;
        // Any part may be encoded, even plain text messages, so check everything.
        if ($p->encoding==4)
            $part['body'] = quoted_printable_decode($data);
        elseif ($p->encoding==3)
            $part['body'] = base64_decode($data);

        foreach ($p as $k=>$v) {
            if ($k != 'parameters' && $k != 'dparameters')
                $part[ strtolower( $k ) ] = $v;
        }
        if (property_exists($p,"parameters") && $p->parameters)
            foreach ($p->parameters as $x)
                $part[ strtolower( $x->attribute ) ] = $x->value;
        if (property_exists($p,"dparameters") && $p->dparameters)
            foreach ($p->dparameters as $x)
                $part[ strtolower( $x->attribute ) ] = $x->value;

        if (property_exists($p, 'charset')) {
            $data = iconv($p->charset, "UTF-8", $data);
        } else
        if (array_key_exists('charset', $part)) {
            $data = iconv($part['charset'], "UTF-8", $data);
        }

        // no need to decode 7-bit, 8-bit, or binary
        if (!property_exists($p, 'parts') && $part['body'] == NULL)
            $part['body'] = $data;
    

        // SUBPART RECURSION
        if (property_exists($p, 'parts')) {
            $part['parts'] = array();
            foreach ($p->parts as $partno0=>$p2)
                array_push($part['parts'], $this->getpart($mid,$p2,$partno.'.'.($partno0+1)));  // 1.2, 1.2.1, etc.
        }
        return $part;
    }
    
    public function send_message() {
        $fullname = $_POST['fullname'];
        $to = $_POST['to'];
        $from = $_POST['email'];
        $subject = $_POST['subject'];
        $message = $_POST['message'];
        
        if ($fullname)
            $address = "\"$fullname\" <$from>";
        else
            $address = $from;

        $headers = "From: $address\r\nReply-To: $address";

        if (mail( $to, $subject, $message, $headers )) {
            return "ok";
        }
        throw new Exception("sending email failed");
    }    
}
