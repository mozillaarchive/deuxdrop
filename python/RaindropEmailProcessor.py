import datetime, re

try:
  from dateutil.tz import tzutc, tzlocal
except:
  print "missing dependency"
  print "yum install python-dateutil"
  sys.exit(0)

from email import message_from_string
from email.utils import mktime_tz, parsedate_tz, formatdate, unquote, getaddresses
from email.header import decode_header
from email.Iterators import typed_subpart_iterator

class RaindropEmailProcessor:
  def __init__( self ):
    pass

  def process( self, message ):

    message = message_from_string(message)

    obj = {}
    obj.update(self.process_body(message))
    obj.update(self.process_headers(message))

    return obj

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
    headers = {}
    # for now we just take todays date as the received date
    message = { "receivedDate" : datetime.datetime.utcnow().isoformat() }

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

    for header_name in headers:
      header_values = headers[header_name]
      if header_name in ["to","cc", "bcc", "from", "replyto"]:
        message[header_name] = [{ "name" : name, "address" : address} \
                                  for name, address \
                                  in getaddresses(header_values) \
                                  if address]
      elif header_name == "received":
        dv = 0
        for v in header_values:
          date = re.match(r".*;\s*(.+)",v,re.DOTALL).group(1)
          parse = int(mktime_tz(parsedate_tz(date)))
          if parse > dv:
            dv = parse
            rd = formatdate(parse)
            message["receivedDate"] = { "original" : rd, 
                                        "utctimestamp" : parse,
                                        "utcisoformat" : datetime.datetime.fromtimestamp(parse, tzutc()).isoformat() }

      elif header_name in ["message-id"]:
        # single value header
        value = header_values[0]
        message["mid"] = value

      elif header_name in ["subject"]:
        # single value header
        value = header_values[0]
        message["subject"] = value

      elif header_name in ["date"]:
        # single value header
        value = header_values[0]
        utctimestamp = int(mktime_tz(parsedate_tz(value)))
        timestamp = datetime.datetime.fromtimestamp(utctimestamp, tzutc())
        message["date"] = { "original" : value, 
                            "utctimestamp" : utctimestamp, 
                            "utcisoformat" : timestamp.isoformat() }

    return message


  def _safe_convert_header( self, header_val, default="ascii" ):
    headers = decode_header(header_val)
    header_sections = [unicode(text, charset or default) for text, charset in headers]
    return u"".join(header_sections)
