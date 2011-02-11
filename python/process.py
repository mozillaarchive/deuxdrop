#!/bin/env python

import os, os.path, sys

try:
  import MySQLdb
except:
  print "missing dependency"
  print "yum install MySQL-python"
  sys.exit(0)

import asyncore

try:
  import pyinotify
except:
  print "missing dependency"
  print "yum install python-inotify"
  sys.exit(0)


from mailbox import Maildir, MaildirMessage
try:
  import json
except:
  print "missing dependency"
  print "yum install python-simplejson"
  sys.exit(0)

import time
import re
from email import message_from_file
from email.utils import unquote, getaddresses
import datetime

try:
  from dateutil.tz import tzutc, tzlocal
except:
  print "missing dependency"
  print "yum install python-dateutil"
  sys.exit(0)

from email.utils import mktime_tz, parsedate_tz
from email.header import decode_header
from email.Iterators import typed_subpart_iterator

MAILDIR_DIRECTORY = "/home/email/"
JSON_DIRECTORY = "/var/www/email/"

DB_PARAMS = { "host" : "localhost", 
              "user" : "python", 
              "passwd" : "psw0rd",
              "db_name" : "messages",
              "db_table" : "messages" }

class Database:
  def add_message( self, msg_obj, domain, username, name ):
    statement = "INSERT INTO " + self.db_table + \
                " ( date, file, domain, username ) " + \
                " VALUES ( '%s', '%s', '%s', '%s' ) " % ( msg_obj["dates"]["mysqltimestamp"], name, domain, username )
    try:
      self.__cursor.execute( statement )
    except MySQLdb.Error, e:
      print "MySQL Error %d: %s" % (e.args[0], e.args[1])
      self.__conn.rollback()

  def __init__( self, params ):
    self.host = params["host"]
    self.user = params["user"]
    self.passwd = params["passwd"]
    self.db_name = params["db_name"]
    self.db_table = params["db_table"]

    self.__conn = self._get_connection()
    self.__cursor = self._get_cursor()

  def _get_connection( self ):
    try:
      __conn = MySQLdb.connect(host = self.host, user = self.user, passwd = self.passwd, db = self.db_name)
    except MySQLdb.Error, e:
      print "MySQL Error %d: %s" % (e.args[0], e.args[1])
      sys.exit (1)

    return __conn

  def _get_cursor( self ):
    return self.__conn.cursor()

  def shutdown( self ):
    self.__cursor.close()
    self.__conn.commit()
    self.__conn.close()

class EventHandler(pyinotify.ProcessEvent):
  def my_init(self, processor):
    self.processor = processor

  def process_IN_CREATE(self, event):
    # <Event dir=False mask=0x100 maskname=IN_CREATE name=filename path=/home/email pathname=/home/email/filename wd=1 >
    # print "IN_CREATE:", event.pathname
    (path, is_tmp) = os.path.split(event.path)
    if not event.dir and is_tmp != "tmp":
      msgs = Maildir(path, factory=MaildirMessage)
      for key in msgs.keys():
        # By popping the messages we remove them from the Maildir
        self.processor.process(path, event.name, msgs.pop(key))

class EmailProcessor:
  def __init__( self, maildir, jsondir, database ):
    self.maildir = maildir
    self.jsondir = jsondir
    self.database = database

  def process( self, maildir_path, name, msg ):
    # print "process: ", maildir_path, msg
    (domain, username) = self._get_domain_username_from_maildir_path(maildir_path)
    json_path = self._get_or_create_json_path(domain, username)

    obj = {}
    obj.update(self.process_body(msg))
    obj.update(self.process_headers(msg))

    try:
      # Write out our object in JSON
      f = open(os.path.join(json_path, "%s.json" % name), "w")
      json.dump(obj, f, indent=4)
      f.close()

      self.database.add_message(obj, domain, username, name)
    except:
      print "error delivering message"

  def _get_domain_username_from_maildir_path( self, maildir_path ):
    (domain, username) = os.path.split(maildir_path)
    (ignore, domain) = os.path.split(domain)
    return (domain, username)

  def _get_or_create_json_path( self, domain, username ):
    json_path = os.path.join(self.jsondir, domain, username)

    if not os.path.exists(json_path):
      os.makedirs(json_path)

    return json_path

  def process_body( self, msg ):
    email_body = ""
    def get_charset( msg, default="ascii" ):
      """Get the message charset"""
      if msg.get_content_charset(): return msg.get_content_charset();
      if msg.get_charset(): return msg.get_charset();
      return default

    if msg.is_multipart():
      parts = [part for part in typed_subpart_iterator(msg,'text','plain')]
      body = []
      for part in parts:
        charset = get_charset(part, get_charset(msg))
        body.append(unicode(part.get_payload(decode=True), charset, "replace"))

      email_body = u"\n".join(body).strip()

    else: # if it is not multipart, the payload will be a string
        # representing the message body
      body = unicode(msg.get_payload(decode=True),
                     get_charset(msg),
                     "replace")
      email_body = body.strip()

    return { "body" : email_body }

  def process_headers( self, msg ):
    # Given we have no opportunity to introduce an object which can ignore
    # the case of headers, we lowercase the keys
    headers = {}; involves = {}; msgdates = {}
    for hn in msg.keys():
      header_values = msg.get_all(hn)
      if header_values:
        header_name = hn.lower()
        # add this header to the list of available headers
        headers[header_name] = []

        # do any charset etc conversion on the values...
        header_values = [self._safe_convert_header(v) for v in header_values]

        # go through the values converting them into usable lists
        for value in header_values:
          if re.match(r"<.+>,",value):
            for v in value.split(","):
              headers[header_name].append(unquote(v.strip()))
          # multiple reference processing
          elif header_name == "references" and re.match(r"<[^<>]+>\s+",value):
            for ref in re.findall(r"<[^<>]+>",value):
              headers[header_name].append(unquote(ref.strip()))
          else:
            headers[header_name].append(unquote(value.strip()))

        if header_name in ["to","cc", "bcc", "from"]:
          involves[header_name] = [{ "name" : name, "address" : address} for name, address \
                                                                         in getaddresses(header_values) if address]

        elif header_name in ["date"]:
          utctimestamp = int(mktime_tz(parsedate_tz(value)))
          timestamp = datetime.datetime.fromtimestamp(utctimestamp, tzutc())
          msgdates["utctimestamp"] = utctimestamp
          msgdates["isotimestamp"] = timestamp.isoformat()
          msgdates["mysqltimestamp"] = timestamp.strftime('%Y-%m-%d %H:%M:%S')
    return { "headers" : headers, "involves" : involves, "dates" : msgdates }


  def _safe_convert_header( self, header_val, default="ascii" ):
    headers = decode_header(header_val)
    header_sections = [unicode(text, charset or default) for text, charset in headers]
    return u"".join(header_sections)


wm = pyinotify.WatchManager()
db = Database(DB_PARAMS)
notifier = pyinotify.AsyncNotifier(wm, EventHandler(processor=EmailProcessor(MAILDIR_DIRECTORY, JSON_DIRECTORY, db)))
#notifier.coalesce_events()

wdd = wm.add_watch(MAILDIR_DIRECTORY, pyinotify.IN_CREATE, rec=True)

try:
  asyncore.loop()
except KeyboardInterrupt:
  db.shutdown()
  wm.rm_watch(wdd.values())
  notifier.stop()
  sys.exit(0)
except pyinotify.NotifierError, err:
    print >> sys.stderr, err
