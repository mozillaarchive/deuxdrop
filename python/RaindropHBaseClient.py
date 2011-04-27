
# pyhbase
try:
  from pyhbase.connection import HBaseConnection
except:
  print "missing dependency"
  print "yum install pyhbase"
  sys.exit(0)

# this is available in python 2.7
try:
  import json
except:
  print "missing dependency"
  print "yum install python-simplejson"
  sys.exit(0)

# Avro libraries
try:
  from avro.ipc import AvroRemoteException, ConnectionClosedException
  from avro.schema import AvroException
except:
  print "missing dependency"
  #XXX I don't think this is the right install instructions
  print "yum install pyhbase"
  sys.exit(0)


MESSAGES_TABLE = "messages"
SUMMARY_COLUMN = "s"
DATA_COLUMN = "d"
IDS_COLUMN = "ids"

class RaindropHBaseClient:

  def __init__(self, host = 'localhost', port = 9090):
    self._port = port
    self._host = host
    self.connection = HBaseConnection(self._host, self._port)
    try:
      print "Connected to HBase %s" % self.connection.get_hbase_version()
    except:
      print "Error connecting to HBase"

    self.__init__tables()

  def __init__tables(self):
    if not self.connection.table_exists(MESSAGES_TABLE):
      self.__create_tables()

  def __create_tables(self):
    try:
      self.connection.create_table(MESSAGES_TABLE, IDS_COLUMN, SUMMARY_COLUMN, DATA_COLUMN)
    except AvroException, e:
      print e.message.get("message")
      raise e

  def _get_message_id(self, username, domain):
    id = None
    try:
      id = self.connection.incr(MESSAGES_TABLE, "%s:%s" % (IDS_COLUMN,"msg"), "%s:%s@%s" % (IDS_COLUMN, username, domain), 1)
    except:
      raise
    print "_get_message_id: ", id
    return id

  # XXX unused
  def _get_conversation_id(self, username, domain):
    id = None
    try:
      id = self.connection.incr(MESSAGES_TABLE, "%s:%s" % (IDS_COLUMN,"conv"), "%s:%s@%s" % (IDS_COLUMN, username, domain), 1)
    except:
      raise
    print "_get_conversation_id: ", id
    return id

  def _get(self, msg, col):
    return json.dumps(msg.get(col, ''))

  def save(self, username, domain, message, data):
    try:
      id = self._get_message_id(username, domain)
      self.connection.put(MESSAGES_TABLE, "%s@%s:%s" % (username, domain,id),
                          "%s:subject" % SUMMARY_COLUMN, self._get(message, "subject"),
                          "%s:message-id" % SUMMARY_COLUMN, self._get(message,"mid"),
                          "%s:body" % SUMMARY_COLUMN, self._get(message,"body"),
                          "%s:date" % SUMMARY_COLUMN, self._get(message,"date"),
                          "%s:from" % SUMMARY_COLUMN, self._get(message,"from"),
                          "%s:to" % SUMMARY_COLUMN, self._get(message,"to"),
                          "%s:cc" % SUMMARY_COLUMN, self._get(message,"cc"),
                          "%s:bcc" % SUMMARY_COLUMN, self._get(message,"bcc"))
                          #"%s:data" % DATA_COLUMN, data)
    except:
      raise

if __name__ == "__main__":
  client = RaindropHBaseClient()
  print client.connection.describe_table(MESSAGES_TABLE)
  
