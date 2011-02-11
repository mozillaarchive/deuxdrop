#!/bin/env python

import os, os.path, sys

# this is available in python 2.7
try:
  import argparse
except:
  print "missing dependency"
  print "yum install python-argparse"
  sys.exit(0)

try:
  import MySQLdb
except:
  print "missing dependency"
  print "yum install MySQL-python"
  sys.exit(0)

# this is available in python 2.7
try:
  import json
except:
  print "missing dependency"
  print "yum install python-simplejson"
  sys.exit(0)

import datetime, time, re, uuid
from email import message_from_file
from email.utils import unquote, getaddresses

try:
  from dateutil.tz import tzutc, tzlocal
except:
  print "missing dependency"
  print "yum install python-dateutil"
  sys.exit(0)

from email import message_from_file
from email.utils import mktime_tz, parsedate_tz
from email.header import decode_header
from email.Iterators import typed_subpart_iterator

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

class EmailProcessor:
  def __init__( self, database ):
    self.jsondir = JSON_DIRECTORY
    self.database = database

  def process( self, sender, user, domain, extension, recipient, message ):
    # print "process: ", maildir_path, msg

    json_path = self._get_or_create_json_path(domain, user)

    obj = {}
    obj.update(self.process_body(message))
    obj.update(self.process_headers(message))

    try:
      # Write out our object in JSON
      f = open(os.path.join(json_path, "%s.json" % str(uuid.uuid4())), "w")
      json.dump(obj, f, indent=4)
      f.close()

      self.database.add_message(obj, domain, user, name)
    except:
      print "error delivering message"

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

    return { "body" : { "text" : email_body } }

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
    return { "involves" : involves, "dates" : msgdates }


  def _safe_convert_header( self, header_val, default="ascii" ):
    headers = decode_header(header_val)
    header_sections = [unicode(text, charset or default) for text, charset in headers]
    return u"".join(header_sections)


parser = argparse.ArgumentParser(description='Raindrop message processor')
parser.add_argument('--sender', dest="sender")
parser.add_argument('--extension', dest="extension")
parser.add_argument('--user', dest="user")
parser.add_argument('--recipient', dest="recipient")
parser.add_argument('--domain', dest="domain")
parser.add_argument('-', dest="message", type = argparse.FileType('r'), default = '-')

options = parser.parse_args()
# XXX This opens a DB connection for every email processed.  How could that go wrong?
e = EmailProcessor(Database(DB_PARAMS))
e.process(options.sender, options.user, options.domain, options.extension, options.recipient, message_from_file(options.message))

