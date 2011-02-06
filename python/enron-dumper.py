#!/usr/bin/env python

"""
Consult a lightly modified version of the enron database created by Andrew Fiore
and Jeff Heer as found at: http://bailando.sims.berkeley.edu/enron_email.html

Our modifications thus far are to:

- Add a table mutualpeeps which filters mailgraph to only contain people who
  have both emailed each other.  For each pair, there will be two rows; they
  each get to be a sender.

"""

import os, os.path, sys
import MySQLdb
import json
import time
import re
from email import message_from_file
from email.utils import unquote, getaddresses
import datetime, calendar
from dateutil.tz import tzoffset
from email.utils import mktime_tz, parsedate_tz
from email.header import decode_header
from email.Iterators import typed_subpart_iterator

class DbTalkingGuy(object):
    def __init__(self, params, dumper):
        self.conn = MySQLdb.connect(host = params["host"],
                                    user = params["user"],
                                    passwd = params["passwd"],
                                    db = params["db"])
        self.dumper = dumper

    def frob_message(self, mid, maildirname):
        """
        Given a message id, reconstitute the message from the normalized
        parts and give it to the dumper.
        """
        c = self.conn.cursor(MySQLdb.cursors.DictCursor)
        
        peeps = set()

        # - message, sender person
        c.execute("SELECT messagedt, messagetz, subject," +
                  " personid, email, name " +
                  "FROM messages, people WHERE" +
                  " messageid = %s AND" +
                  " messages.senderid = people.personid",
                  (mid,))
        r_message = c.fetchone()
        peeps.add(r_message["personid"])

        # - body
        c.execute("SELECT * FROM bodies WHERE messageid = %s",
                  (mid,))
        r_body = c.fetchone()

        # - headers
        #c.execute("SELECT * FROM headers WHERE messageid = %s",
        #          (mid,))
        #r_headers = c.fetchall()
        #headers = {}

        # - recipients
        c.execute("SELECT reciptype, reciporder, people.personid," +
                  " email, name " +
                  "FROM recipients, people WHERE" +
                  " messageid = %s AND" +
                  " recipients.personid = people.personid" ,
                  (mid,))
        r_recipients = c.fetchall()
        recipients = []
        for row in r_recipients:
            if row["personid"] in peeps:
                continue
            recipients.append({ "name": row["name"] or row["email"],
                                "email": row["email"],
                                "type": row["reciptype"]})
            peeps.add(row["personid"])

        message = {}

        tzbits = r_message["messagetz"].split(" ")
        tz = tzoffset(tzbits[1], int(tzbits[0]) / 100 * 60 * 60)
        ttupe = time.strptime(str(r_message["messagedt"]), "%Y-%m-%d %H:%M:%S")
        date = datetime.datetime(*(ttupe[:-2] + (tz,)))

        message["date_ms"] = calendar.timegm(date.utctimetuple()) * 1000
        message["from"] = { "name": r_message["name"] or r_message["email"],
                            "email": r_message["email"] }
        message["recipients"] = recipients
        message["subject"] = r_message["subject"]
        message["body"] = r_body["body"].strip()

        self.dumper.dump_message(maildirname, mid, message)
        

    def frob_messages_by_mutual_person(self, personid):
        """
        Given a person id, find all the messages sent to and by that user
        from the set of users the user had a mutual message sending
        relationship with.
        """
        frobbed = set()

        c = self.conn.cursor()

        c.execute("SELECT email FROM people where personid = %s",
                  (personid,))
        r_person = c.fetchone()
        personmail = r_person[0]

        # -- find all the messages they sent (to mutual peeps)
        c.execute(
            "SELECT messages.messageid " +
            "FROM messages, recipients " +
            "WHERE" +
            " messages.senderid = %s AND" +
            " messages.messageid = recipients.messageid AND" +
            " recipients.personid IN" +
            "  (SELECT recipientid FROM mutualpeeps WHERE" +
            "   senderid = %s) " +
            "GROUP by messages.messageid",
            (personid, personid))
        r_messages = c.fetchall()
        for row in r_messages:
            self.frob_message(row[0], personmail)
            frobbed.add(row[0])

        # -- find all the messages they received (from mutual peeps)
        c.execute(
            "SELECT messages.messageid " +
            "FROM messages, recipients " +
            "WHERE" +
            " messages.senderid IN" +
            # it's a mutual relationship, but we only have an index on sender,
            #  so use that.
            "  (SELECT recipientid FROM mutualpeeps WHERE" +
            "   senderid = %s) AND" +
            " messages.messageid = recipients.messageid AND" +
            " recipients.messageid = messages.messageid AND" +
            " recipients.personid = %s " +
            "GROUP by messages.messageid",
            (personid, personid))

        frobbed = set()
        r_messages = c.fetchall()
        for row in r_messages:
            if row[0] in frobbed:
                continue
            self.frob_message(row[0], personmail)
            frobbed.add(row[0])
        
        print "Dumped", len(frobbed), "messages."

class JsonMessageDumper(object):
    def __init__(self, outdir):
        if not os.path.isdir(outdir):
            raise Exception('%s is not a valid dir!' % (outdir,))

        self.outdir = outdir
        self.known_person_dirs = set()

    def dump_message(self, personmail, messageid, obj):
        persondir = os.path.join(self.outdir, personmail)
        if not personmail in self.known_person_dirs:
            if not os.path.isdir(persondir):
                os.mkdir(persondir)
            self.known_person_dirs.add(personmail)

        msgpath = os.path.join(persondir, '%d.json' % (messageid,))
        f = open(msgpath, 'w')
        json.dump(obj, f, indent=2)
        f.close()

    
JSON_DIRECTORY = "/local/odata/enron/json-out"

DB_PARAMS = { "host" : "localhost", 
              "user" : "enron", 
              "passwd" : "enronic",
              "db" : "enron"
            }

if __name__ == '__main__':
    dumper = JsonMessageDumper(JSON_DIRECTORY)
    db = DbTalkingGuy(DB_PARAMS, dumper)

    #db.frob_messages_by_mutual_person(242)
    db.frob_messages_by_mutual_person(347)

    db.frob_messages_by_mutual_person(8)
    db.frob_messages_by_mutual_person(680)
    db.frob_messages_by_mutual_person(124)
