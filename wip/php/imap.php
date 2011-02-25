<?php
require_once 'config.php';

class ImapBase {
    public function __construct($mailbox=null) {
        $config = config();
        $username = $config["username"];
        $password = $config["password"];
        $spec = $config["spec"];
        if ($mailbox)
            $folder = $mailbox;
        else
            $folder = $config["mailbox"];

        if(isset($_POST['folder']))
            $folder = $_POST['folder'];
        if(isset($_GET['folder']))
            $folder = $_GET['folder'];
            
        $this->connect($spec, $folder, $username, $password);
    }

    protected function connection_string() {
        return $this->spec.$this->mailbox;
    }
    
    public function connect($spec, $mailbox, $username, $password) {
        $this->spec = $spec;
        $this->mailbox = $mailbox;
        $this->conn = imap_open($this->connection_string(),$username,$password,OP_READONLY)
            or die('Cannot connect to mailbox: ' . imap_last_error());
    }
    
    public function close() {
        imap_close($this->conn);
    }
    
    protected function decode_headers($headers) {
        $msg = array();
        //echo json_encode($headers);
        foreach($headers as $k=>$v) {
            if (is_string($v)) {
                $u = imap_utf8($v);
            //echo $v." ---> ". json_encode($u)."\n";
                $msg[$k] = $u;
            } else if (is_scalar($v)) {
                $msg[$k] = $v;
            } else {
                $msg[$k] = $this->decode_headers($v);
            }
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
        imap_headers($this->conn);
        $r['entries'] = array();
        for ($i=1; $i < $boxinfo->Nmsgs; $i++) {
            try {
                $headers = imap_header($this->conn, $i);
                array_push($r['entries'], $this->decode_headers($headers));
            } catch(Exception $e) {
                continue;
            }
        }
        return $r;
    }


    public function get_message($mid) {
        // input $mbox = IMAP stream, $mid = message id
        // output all the following:
        // the message may in $htmlmsg, $plainmsg, or both
        $htmlmsg = $plainmsg = $charset = '';
        $attachments = array();
    
        $msg = array();
        // HEADER
        $msg['headers'] = imap_header($this->conn ,$mid);
        // add code here to get date, from, to, cc, subject...
    
        // BODY
        $s = imap_fetchstructure($this->conn ,$mid);
        //print json_encode($s);
        $msg['parts'] = array();
        if (!$s->parts) {  // not multipart
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
        $part['body'] == NULL;
        // Any part may be encoded, even plain text messages, so check everything.
        //if ($p->encoding==4)
        //    $part['body'] = quoted_printable_decode($data);
        //elseif ($p->encoding==3)
        //    $part['body'] = base64_decode($data);
        // no need to decode 7-bit, 8-bit, or binary
        if (!$p->parts && $part['body'] == NULL)
            $part['body'] = $data;
    
        foreach ($p as $k=>$v) {
            if ($k != 'parameters' && $k != 'dparameters')
                $part[ strtolower( $k ) ] = $v;
        }
        if ($p->parameters)
            foreach ($p->parameters as $x)
                $part[ strtolower( $x->attribute ) ] = $x->value;
        if ($p->dparameters)
            foreach ($p->dparameters as $x)
                $part[ strtolower( $x->attribute ) ] = $x->value;
    
        // SUBPART RECURSION
        if ($p->parts) {
            $part['parts'] = array();
            foreach ($p->parts as $partno0=>$p2)
                array_push($part['parts'], $this->getpart($mid,$p2,$partno.'.'.($partno0+1)));  // 1.2, 1.2.1, etc.
        }
        return $part;
    }
}
